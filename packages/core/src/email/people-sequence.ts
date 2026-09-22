import { sql } from "kysely";
import { getDb } from "../db";
import { coreEnv } from "../config";
import type { AccountType } from "../db/types";
import { graphed } from "../marketing/graphed";
import { runDirectories } from "../marketing/list/directories";
import { runGetleadsEnrichment } from "../marketing/list/enrich";
import { sleep, upsertAccount } from "../marketing/list/shared";
import { matchTitleLoose } from "../marketing/list/titles";
import {
  applyAccountScope,
  PEOPLE_WAVES,
  seedArkansasEscs,
  stampPriorityTiers,
  scopeForWave,
  waveById,
  priorityFor,
  stateCodeFromName,
  type PeopleWave,
} from "../marketing/list/waves";
import { runWebsiteResolution } from "../marketing/list/websites";
import { sequencerEnv } from "./config";
import { CAMPAIGNS, EDUCATION_SQL, SEGMENTS, type ModuleId } from "./waterfall";
import { createLead } from "./instantly";

// Full TAM collector, sequenced by spec 06 §7.1:
//   t2-ar → t3-regional → t4-ec → t5-large → t6-national
// Each wave: resolve websites → staff directories → GetLeads fallback →
// MV ok-only → Instantly DRAFT module campaigns. Never Resume/Launch.
//
// Throughput is the ceiling, not discovery: ~40 accounts/run at 1 req/sec
// on directories. Repeat `--wave next` until status remaining is 0.
// CCR&R / Head Start (t4) stay empty until curated source files exist.

const MV_CONCURRENCY = 5;
const VERIFY_CAP = 200;
const INSTANTLY_CAP = 400;
const CONSUMER_MAIL = new Set([
  "gmail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "aol.com",
  "icloud.com",
  "me.com",
  "msn.com",
  "live.com",
  "proton.me",
  "protonmail.com",
]);

export interface SequenceOpts {
  wave?: string;
  limit?: number;
  skipVerify?: boolean;
  skipInstantly?: boolean;
  statusOnly?: boolean;
}

export interface WaveStatus {
  id: string;
  label: string;
  tier: number;
  accounts: number;
  withWebsite: number;
  crawled: number;
  withContacts: number;
  remaining: number;
}

export interface SequenceStatus {
  accounts: number;
  contacts: number;
  mvOk: number;
  mvPending: number;
  sequenced: number;
  byType: { account_type: string; n: number }[];
  byTier: { priority_tier: number; n: number }[];
  waves: WaveStatus[];
  nextWave: string | null;
}

function isConsumer(email: string): boolean {
  const domain = email.split("@")[1]?.toLowerCase();
  return Boolean(domain && CONSUMER_MAIL.has(domain));
}

async function countWhere(
  wave: PeopleWave,
  extra: (qb: ReturnType<typeof baseWaveQuery>) => ReturnType<typeof baseWaveQuery>,
): Promise<number> {
  const row = await extra(baseWaveQuery(wave))
    .select((eb) => eb.fn.countAll().as("n"))
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

function baseWaveQuery(wave: PeopleWave) {
  return applyAccountScope(
    getDb().selectFrom("accounts").where("suppressed", "=", false),
    scopeForWave(wave),
  );
}

export async function sequenceStatus(): Promise<SequenceStatus> {
  const db = getDb();
  const accounts = Number(
    (await db.selectFrom("accounts").select(db.fn.countAll().as("n")).executeTakeFirst())?.n ?? 0,
  );
  const contacts = Number(
    (await db.selectFrom("contacts").select(db.fn.countAll().as("n")).executeTakeFirst())?.n ?? 0,
  );
  const mvOk = Number(
    (
      await db
        .selectFrom("contacts")
        .select(db.fn.countAll().as("n"))
        .where("mv_status", "=", "ok")
        .where("suppressed", "=", false)
        .executeTakeFirst()
    )?.n ?? 0,
  );
  const mvPending = Number(
    (
      await db
        .selectFrom("contacts")
        .select(db.fn.countAll().as("n"))
        .where("email", "is not", null)
        .where("suppressed", "=", false)
        .where("mv_status", "is", null)
        .executeTakeFirst()
    )?.n ?? 0,
  );
  const sequenced = Number(
    (
      await db
        .selectFrom("contacts")
        .select(db.fn.countAll().as("n"))
        .where("sequence_status", "=", "active")
        .executeTakeFirst()
    )?.n ?? 0,
  );
  const byType = (
    await db
      .selectFrom("accounts")
      .select(["account_type", db.fn.countAll().as("n")])
      .groupBy("account_type")
      .execute()
  ).map((r) => ({ account_type: r.account_type, n: Number(r.n) }));
  const byTier = (
    await db
      .selectFrom("accounts")
      .select(["priority_tier", db.fn.countAll().as("n")])
      .groupBy("priority_tier")
      .orderBy("priority_tier", "asc")
      .execute()
  ).map((r) => ({ priority_tier: r.priority_tier, n: Number(r.n) }));

  const waves: WaveStatus[] = [];
  for (const wave of PEOPLE_WAVES) {
    const nAccounts = await countWhere(wave, (q) => q);
    const withWebsite = await countWhere(wave, (q) => q.where("website", "is not", null));
    const crawled = await countWhere(wave, (q) => q.where("last_verified", "is not", null));
    const withContactsRow = await applyAccountScope(
      db
        .selectFrom("accounts")
        .where("accounts.suppressed", "=", false)
        .where(({ exists, selectFrom }) =>
          exists(
            selectFrom("contacts")
              .select("contacts.contact_id")
              .whereRef("contacts.account_id", "=", "accounts.account_id"),
          ),
        ),
      scopeForWave(wave),
    )
      .select((eb) => eb.fn.countAll().as("n"))
      .executeTakeFirst();
    const withContacts = Number(withContactsRow?.n ?? 0);
    const remaining = await remainingForWave(wave);
    waves.push({
      id: wave.id,
      label: wave.label,
      tier: wave.tier,
      accounts: nAccounts,
      withWebsite,
      crawled,
      withContacts,
      remaining,
    });
  }

  return {
    accounts,
    contacts,
    mvOk,
    mvPending,
    sequenced,
    byType,
    byTier,
    waves,
    nextWave: waves.find((w) => w.remaining > 0)?.id ?? null,
  };
}

async function remainingForWave(wave: PeopleWave): Promise<number> {
  const db = getDb();
  const row = await applyAccountScope(
    db
      .selectFrom("accounts")
      .where("suppressed", "=", false)
      .where((eb) =>
        eb.or([eb("website", "is", null), eb("last_verified", "is", null)]),
      ),
    scopeForWave(wave),
  )
    .select((eb) => eb.fn.countAll().as("n"))
    .executeTakeFirst();
  return Number(row?.n ?? 0);
}

function guessAccountType(name: string): AccountType {
  if (/\b(isd|iu\b|i\.u\.|esc|boces|cooperative|education service|intermediate unit)\b/i.test(name)) {
    return "esa";
  }
  if (/\bccr&r|child care resource/i.test(name)) return "ccrr";
  if (/\bhead start\b/i.test(name)) return "head_start";
  return "district";
}

interface WavePerson {
  first_name?: string;
  last_name?: string;
  email?: string;
  email_address?: string;
  job_title?: string;
  title?: string;
  org_company_name?: string;
  org_domain?: string;
  email_domain?: string;
  state_name?: string;
}

function extractPeople(result: unknown): WavePerson[] {
  if (Array.isArray(result)) return result as WavePerson[];
  const root = result as Record<string, unknown>;
  const list = root?.contacts ?? root?.data ?? root?.results ?? root?.items ?? [];
  return Array.isArray(list) ? (list as WavePerson[]) : [];
}

async function searchWavePeople(
  wave: PeopleWave,
  keepLimit: number,
): Promise<{ searched: number; kept: number; added: number }> {
  const db = getDb();
  const waveStates = new Set((wave.states ?? []).map((s) => s.toUpperCase()));
  let searched = 0;
  let kept = 0;
  let added = 0;

  for (const segment of SEGMENTS) {
    if (segment.id === "referrals" && wave.id !== "t4-ec") continue;
    let offset = 0;
    for (let page = 0; page < 8 && kept < keepLimit; page += 1) {
      let rows: WavePerson[] = [];
      try {
        const result = await graphed.tools.run(
          "getleads:contacts.search",
          {
            jobTitles: segment.jobTitles,
            countries: ["US"],
            whereSql: EDUCATION_SQL,
            limit: 50,
            offset,
            maxPerCompany: 2,
          },
          { timeoutSeconds: 120 },
        );
        rows = extractPeople(result);
      } catch (error) {
        console.warn(
          `getleads people ${segment.id} offset=${offset}: ${error instanceof Error ? error.message : error}`,
        );
        await sleep(1500);
        try {
          const result = await graphed.tools.run(
            "getleads:contacts.search",
            {
              jobTitles: segment.jobTitles,
              countries: ["US"],
              whereSql: EDUCATION_SQL,
              limit: 50,
              offset,
              maxPerCompany: 2,
            },
            { timeoutSeconds: 120 },
          );
          rows = extractPeople(result);
        } catch (retryError) {
          console.warn(
            `getleads people ${segment.id} retry failed: ${retryError instanceof Error ? retryError.message : retryError}`,
          );
          break;
        }
      }
      if (rows.length === 0) break;
      searched += rows.length;
      offset += rows.length;

      for (const row of rows) {
        if (kept >= keepLimit) break;
        const email = (row.email_address || row.email || "").trim().toLowerCase();
        if (!email.includes("@") || isConsumer(email)) continue;
        const state = stateCodeFromName(row.state_name) ?? "US";
        if (waveStates.size > 0 && !waveStates.has(state)) continue;
        const title = row.job_title || row.title || "";
        const match = matchTitleLoose(title);
        if (!match || match.module !== segment.id) continue;
        const company =
          (row.org_company_name || "").trim() || email.split("@")[1] || "Unknown";
        const domain = (
          row.org_domain ||
          row.email_domain ||
          email.split("@")[1] ||
          ""
        ).toLowerCase();
        if (!domain) continue;

        let account = await db
          .selectFrom("accounts")
          .select(["account_id", "suppressed", "modules_fit"])
          .where("domain", "=", domain)
          .executeTakeFirst();
        if (!account) {
          const type = guessAccountType(company);
          await upsertAccount({
            account_name: company,
            account_type: type,
            domain,
            website: null,
            state: state === "US" ? "US" : state,
            modules_fit:
              type === "esa" ? ["pd", "coaching"] : ["pd", "enrollments", "coaching"],
            priority_tier: priorityFor(state === "US" ? "US" : state, type),
            source: "getleads-wave",
          });
          account = await db
            .selectFrom("accounts")
            .select(["account_id", "suppressed", "modules_fit"])
            .where("domain", "=", domain)
            .executeTakeFirst();
        }
        if (!account || account.suppressed) continue;
        if (!account.modules_fit.includes(match.module)) continue;

        kept += 1;
        try {
          const result = await db
            .insertInto("contacts")
            .values({
              account_id: account.account_id,
              first_name: row.first_name || null,
              last_name: row.last_name || null,
              title: title.slice(0, 200),
              title_rank: match.rank,
              module_segment: match.module,
              email,
              email_source: "getleads",
              suppressed: false,
            })
            .onConflict((oc) => oc.doNothing())
            .executeTakeFirst();
          if (Number(result.numInsertedOrUpdatedRows ?? 0) > 0) added += 1;
        } catch {
          // unique-email race
        }
      }
    }
  }
  console.log(`people-search ${wave.id}: searched=${searched} in-wave=${kept} added=${added}`);
  return { searched, kept, added };
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let i = 0;
  async function worker(): Promise<void> {
    while (i < items.length) {
      const idx = i;
      i += 1;
      await fn(items[idx]!);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));
}

async function verifyUnverified(limit: number): Promise<{ verified: number; ok: number }> {
  const db = getDb();
  const due = await db
    .selectFrom("contacts")
    .select(["contact_id", "email"])
    .where("email", "is not", null)
    .where("suppressed", "=", false)
    .where("mv_status", "is", null)
    .orderBy("title_rank", "asc")
    .limit(limit)
    .execute();
  const emails = due.filter((r) => r.email && !isConsumer(r.email));
  let verified = 0;
  let ok = 0;
  await mapPool(emails, MV_CONCURRENCY, async (row) => {
    const email = row.email!;
    let result = "unknown";
    try {
      const res = (await graphed.tools.run(
        "million-verifier:validate",
        { email, timeout: 10 },
        { timeoutSeconds: 45 },
      )) as { result?: string };
      result = String(res.result ?? "unknown").toLowerCase();
    } catch (error) {
      console.warn(
        `mv ${email}: ${error instanceof Error ? error.message : error}`,
      );
      result = "error";
    }
    await db
      .updateTable("contacts")
      .set({ mv_status: result, mv_verified_at: sql`current_date` })
      .where("contact_id", "=", row.contact_id)
      .execute();
    verified += 1;
    if (result === "ok") ok += 1;
  });
  return { verified, ok };
}

function hasInstantlyKey(): boolean {
  try {
    sequencerEnv();
    return true;
  } catch {
    return false;
  }
}

async function pushDraftInstantly(limit: number): Promise<{ uploaded: number; skipped: number }> {
  if (!hasInstantlyKey()) {
    console.log("instantly: INSTANTLY_API_KEY not in this process — skip (graphed exec has it)");
    return { uploaded: 0, skipped: 0 };
  }
  const db = getDb();
  const due = await db
    .selectFrom("contacts")
    .innerJoin("accounts", "accounts.account_id", "contacts.account_id")
    .select([
      "contacts.contact_id",
      "contacts.email",
      "contacts.first_name",
      "contacts.last_name",
      "contacts.title",
      "contacts.module_segment",
      "accounts.account_name",
      "accounts.domain",
      "accounts.state",
    ])
    .where("contacts.mv_status", "=", "ok")
    .where("contacts.suppressed", "=", false)
    .where("contacts.sequence_status", "=", "not_started")
    .where("contacts.email", "is not", null)
    .where("accounts.suppressed", "=", false)
    .orderBy("accounts.priority_tier", "asc")
    .orderBy("contacts.title_rank", "asc")
    .limit(limit)
    .execute();

  let uploaded = 0;
  let skipped = 0;
  for (const row of due) {
    const module = row.module_segment as ModuleId | null;
    if (!module || !(module in CAMPAIGNS)) {
      skipped += 1;
      continue;
    }
    const email = row.email!;
    try {
      const created = await createLead({
        campaign: CAMPAIGNS[module],
        email,
        first_name: row.first_name,
        last_name: row.last_name,
        company_name: row.account_name,
        website: row.domain ? `https://${row.domain}` : undefined,
        skip_if_in_workspace: true,
        verify_leads_on_import: false,
        custom_variables: {
          title: row.title,
          state: row.state,
          source: "people-sequence",
        },
      });
      await db
        .updateTable("contacts")
        .set({
          sequence_id: created.id ?? CAMPAIGNS[module],
          sequence_status: "active",
        })
        .where("contact_id", "=", row.contact_id)
        .execute();
      uploaded += 1;
    } catch (error) {
      skipped += 1;
      console.warn(
        `instantly ${email}: ${error instanceof Error ? error.message : error}`,
      );
    }
    await sleep(50);
  }
  return { uploaded, skipped };
}

export async function run(opts: SequenceOpts = {}): Promise<{
  wave: string;
  websites: true;
  directories: true;
  enrich: true;
  verify?: { verified: number; ok: number };
  instantly?: { uploaded: number; skipped: number };
  status: SequenceStatus;
}> {
  await stampPriorityTiers();
  await seedArkansasEscs();
  await stampPriorityTiers();
  try {
    console.log(`db host: ${new URL(coreEnv().DATABASE_URL).host}`);
  } catch {
    console.log("db host: unparseable");
  }

  if (opts.statusOnly) {
    const status = await sequenceStatus();
    return {
      wave: status.nextWave ?? "done",
      websites: true,
      directories: true,
      enrich: true,
      status,
    };
  }

  const statusBefore = await sequenceStatus();
  const waveId =
    !opts.wave || opts.wave === "next"
      ? statusBefore.nextWave
      : opts.wave;
  if (!waveId) {
    console.log("people-sequence: every wave is complete (or t4 has no source accounts yet)");
    return {
      wave: "done",
      websites: true,
      directories: true,
      enrich: true,
      status: statusBefore,
    };
  }

  const wave = waveById(waveId);
  const limit = opts.limit ?? 40;
  const scope = scopeForWave(wave);
  console.log(`people-sequence wave=${wave.id} (${wave.label}) limit=${limit}`);

  await runWebsiteResolution(limit, scope);
  await runDirectories({ limit, scope });
  await runGetleadsEnrichment(limit, scope);
  await searchWavePeople(wave, Math.max(80, limit * 4));

  let verify: { verified: number; ok: number } | undefined;
  if (!opts.skipVerify) {
    verify = await verifyUnverified(VERIFY_CAP);
    console.log(`mv: verified=${verify.verified} ok=${verify.ok}`);
  }

  let instantly: { uploaded: number; skipped: number } | undefined;
  if (!opts.skipInstantly) {
    instantly = await pushDraftInstantly(INSTANTLY_CAP);
    console.log(`instantly draft: uploaded=${instantly.uploaded} skipped=${instantly.skipped}`);
  }

  const status = await sequenceStatus();
  return { wave: wave.id, websites: true, directories: true, enrich: true, verify, instantly, status };
}
