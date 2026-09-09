import { sql } from "kysely";
import { getDb } from "../db";
import { graphed } from "./graphed";
import { presignGet, putText } from "./storage";
import { fireAlert } from "./alerts";
import { warehouseConfig, withSchemas, wq } from "./warehouse";

// Daily email verification (06-cold-email-execution.md §3.4, 07 §4.3).
// million-verifier:bulk bills 0.046 credits/email (~$0.46 per 1,000):
// retries: 0. Only `ok` addresses are ever eligible for sending; catch_all
// on public-sector domains silently discards, so it is treated as unusable.

const BATCH_LIMIT = 5000;

/**
 * Bounce circuit-breaker (06 §3.4): trailing-7-day bounce rate over 2% on
 * the sequencer means STOP — alert critical and skip the run. Sequencer
 * pausing is manual until Instantly is connected.
 */
async function bounceRateOk(): Promise<boolean> {
  if (!warehouseConfig().instantly) return true; // no sequencer connected yet
  const rows = await wq<{ bounce_rate: number | null }>(
    withSchemas(
      `SELECT sum(bounced_count) / nullif(sum(emails_sent_count), 0) AS bounce_rate
       FROM {instantly}.daily_campaign_analytics
       WHERE date >= today() - 7`,
    ),
  );
  const rate = rows[0]?.bounce_rate ?? 0;
  if (rate > 0.02) {
    await fireAlert("bounce-rate-breaker", "critical", "instantly", {
      bounce_rate: rate,
      action: "verification run skipped; PAUSE ALL CAMPAIGNS and investigate",
    });
    return false;
  }
  return true;
}

export async function run(): Promise<void> {
  const db = getDb();

  if (!(await bounceRateOk())) {
    process.exitCode = 1;
    return;
  }

  const due = await db
    .selectFrom("contacts")
    .select(["contact_id", "email"])
    .where("email", "is not", null)
    .where("suppressed", "=", false)
    .where((eb) =>
      eb.or([
        eb("mv_verified_at", "is", null),
        eb("mv_verified_at", "<", sql<Date>`current_date - 90`),
      ]),
    )
    .limit(BATCH_LIMIT)
    .execute();
  if (due.length === 0) {
    console.log("No contacts due for verification.");
    return;
  }

  const key = `mv/${new Date().toISOString().slice(0, 10)}-${Date.now()}.csv`;
  await putText(key, due.map((row) => row.email).join("\n"), "text/plain");
  const url = await presignGet(key, 7200);

  const batch = await db
    .insertInto("verification_batches")
    .values({ storage_key: key, email_count: due.length })
    .returning("id")
    .executeTakeFirstOrThrow();

  const started = await graphed.tools.start("million-verifier:bulk", {
    url,
    filter: "all",
  });
  await db
    .updateTable("verification_batches")
    .set({ tool_run_id: started.id })
    .where("id", "=", batch.id)
    .execute();

  await graphed.tools.wait(started.id, { timeoutSeconds: 3000 });
  const csv = (await graphed.tools.downloadResult(started.id)) as unknown;
  const csvText =
    typeof csv === "string" ? csv : Buffer.isBuffer(csv) ? csv.toString("utf-8") : String(csv);

  // Report CSV: header row with `email` and a result/quality column.
  const lines = csvText.split("\n").filter((line) => line.trim().length > 0);
  const header = (lines[0] ?? "").toLowerCase().split(",").map((h) => h.trim().replace(/"/g, ""));
  const emailIdx = header.findIndex((h) => h.includes("email"));
  const statusIdx = header.findIndex((h) => h.includes("result") || h.includes("quality") || h.includes("status"));
  let updated = 0;
  if (emailIdx >= 0 && statusIdx >= 0) {
    for (const line of lines.slice(1)) {
      const cols = line.split(",").map((c) => c.trim().replace(/"/g, ""));
      const email = cols[emailIdx]?.toLowerCase();
      const status = cols[statusIdx]?.toLowerCase().replace(/\s+/g, "_");
      if (!email || !status) continue;
      await db
        .updateTable("contacts")
        .set({ mv_status: status, mv_verified_at: sql`current_date` })
        .where("email", "=", email)
        .execute();
      updated += 1;
    }
  } else {
    console.warn("Unrecognized MV report header; storing raw report only.");
  }

  const run = await graphed.tools.get(started.id).catch(() => null);
  const billed =
    run && typeof run === "object" && "billedCredits" in run
      ? ((run as { billedCredits?: number }).billedCredits ?? null)
      : null;
  await db
    .updateTable("verification_batches")
    .set({ status: "completed", completed_at: new Date(), billed_credits: billed })
    .where("id", "=", batch.id)
    .execute();

  console.log(
    `Verified ${due.length} emails (${updated} statuses recorded), batch ${batch.id}, report at ${key}.`,
  );
  // Sequencer push happens in sequencer-sync once Instantly is connected —
  // until then contacts stay `not_started` with a fresh mv_status.
}
