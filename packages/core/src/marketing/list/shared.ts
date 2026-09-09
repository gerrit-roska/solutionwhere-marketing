import { getDb } from "../../db";
import type { AccountType } from "../../db/types";

export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function domainOf(website: string | null): string | null {
  if (!website) return null;
  try {
    const url = new URL(website.startsWith("http") ? website : `https://${website}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export interface AccountUpsert {
  account_name: string;
  account_type: AccountType;
  domain: string | null;
  website: string | null;
  state: string;
  city?: string | null;
  county?: string | null;
  nces_leaid?: string | null;
  enrollment?: number | null;
  agency_term?: string | null;
  modules_fit: string[];
  priority_tier?: number;
  source: string;
  source_url?: string | null;
}

/**
 * Upserts an account, applying domain-level suppression on the way in —
 * suppressed rows are written with suppressed = true, never dropped, so
 * coverage reporting stays honest (06 §1, 07 §4.2).
 */
export async function upsertAccount(
  row: AccountUpsert,
): Promise<{ isNew: boolean }> {
  const db = getDb();
  const suppression = row.domain
    ? await db
        .selectFrom("suppression_domains")
        .select("reason")
        .where("domain", "=", row.domain)
        .executeTakeFirst()
    : undefined;

  const values = {
    account_name: row.account_name,
    account_type: row.account_type,
    normalized_name: normalizeName(row.account_name),
    domain: row.domain,
    website: row.website,
    state: row.state,
    city: row.city ?? null,
    county: row.county ?? null,
    nces_leaid: row.nces_leaid ?? null,
    enrollment: row.enrollment ?? null,
    agency_term: row.agency_term ?? null,
    modules_fit: row.modules_fit,
    priority_tier: row.priority_tier ?? 6,
    source: row.source,
    source_url: row.source_url ?? null,
    suppressed: Boolean(suppression),
    suppression_reason: suppression?.reason ?? null,
  };

  if (row.domain) {
    const result = await db
      .insertInto("accounts")
      .values(values)
      .onConflict((oc) =>
        oc.column("domain").doUpdateSet({
          account_name: values.account_name,
          website: values.website,
          enrollment: values.enrollment,
          last_verified: new Date().toISOString().slice(0, 10),
        }),
      )
      .returning(["account_id", "first_seen"])
      .executeTakeFirst();
    const isNew =
      result?.first_seen instanceof Date
        ? result.first_seen.toISOString().slice(0, 10) ===
          new Date().toISOString().slice(0, 10)
        : true;
    return { isNew };
  }

  // No domain: dedupe on normalized name + state.
  const existing = await db
    .selectFrom("accounts")
    .select("account_id")
    .where("normalized_name", "=", values.normalized_name)
    .where("state", "=", values.state)
    .executeTakeFirst();
  if (existing) return { isNew: false };
  await db.insertInto("accounts").values(values).execute();
  return { isNew: true };
}

/** Records a source_runs row around a nightly source module. */
export async function recordRun(
  source: string,
  fn: () => Promise<{ seen: number; added: number; updated: number }>,
): Promise<void> {
  const db = getDb();
  const run = await db
    .insertInto("source_runs")
    .values({ source })
    .returning("id")
    .executeTakeFirstOrThrow();
  try {
    const { seen, added, updated } = await fn();
    await db
      .updateTable("source_runs")
      .set({ finished_at: new Date(), rows_seen: seen, rows_new: added, rows_updated: updated })
      .where("id", "=", run.id)
      .execute();
    console.log(`${source}: seen=${seen} new=${added} updated=${updated}`);
  } catch (error) {
    await db
      .updateTable("source_runs")
      .set({
        finished_at: new Date(),
        error: error instanceof Error ? error.message : String(error),
      })
      .where("id", "=", run.id)
      .execute();
    throw error;
  }
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

export const CRAWL_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
