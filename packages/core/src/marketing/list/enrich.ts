import { getDb } from "../../db";
import { graphed } from "../graphed";
import { allDictionaryTitles, matchTitle } from "./titles";
import { recordRun, sleep } from "./shared";

// GetLeads enrichment (06 §3.5): the fallback for accounts whose staff
// directory yielded nothing — in practice most district directories are
// JS-rendered apps (Apptegy/Finalsite) with no emails in the raw HTML, so
// this is the path that actually fills the contacts table.
//
// Two spec rules are load-bearing here:
//   1. Titles still pass through the §3.2 dictionary (matchTitle) — we do
//      not import everyone GetLeads knows at the domain.
//   2. GetLeads' own VALID flag is unreliable (§3.5 measured 10/33 actually
//      deliverable), so every imported address stays mv_status NULL and the
//      verify-emails-daily job re-verifies through Million Verifier before
//      anything is sendable. Never mark these ok on import.

const ACCOUNTS_PER_NIGHT = 150;
const MAX_PER_ACCOUNT = 8;

interface GetleadsContact {
  first_name?: string;
  last_name?: string;
  name?: string;
  full_name?: string;
  title?: string;
  job_title?: string;
  email?: string;
  email_address?: string;
  linkedin_url?: string;
  person_linkedin_url?: string;
  linkedin?: string;
}

function contactFields(row: GetleadsContact): {
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  email: string | null;
  linkedin: string | null;
} {
  const full = row.name ?? row.full_name ?? "";
  const [first, ...rest] = full.split(" ").filter(Boolean);
  return {
    firstName: row.first_name ?? first ?? null,
    lastName: row.last_name ?? (rest.length ? rest.join(" ") : null),
    title: row.title ?? row.job_title ?? null,
    email: (row.email ?? row.email_address ?? "").toLowerCase() || null,
    linkedin: row.linkedin_url ?? row.person_linkedin_url ?? row.linkedin ?? null,
  };
}

export async function runGetleadsEnrichment(
  limit: number = ACCOUNTS_PER_NIGHT,
): Promise<void> {
  await recordRun("getleads-enrichment", async () => {
    const db = getDb();
    let seen = 0;
    let added = 0;

    // Accounts with a resolved domain where the directory crawl already ran
    // (last_verified set) and produced zero contacts.
    const due = await db
      .selectFrom("accounts")
      .select(["account_id", "account_name", "account_type", "domain", "modules_fit"])
      .where("suppressed", "=", false)
      .where("domain", "is not", null)
      .where("last_verified", "is not", null)
      .where(({ not, exists, selectFrom, lit }) =>
        not(
          exists(
            selectFrom("contacts")
              .select(lit(1).as("one"))
              .whereRef("contacts.account_id", "=", "accounts.account_id"),
          ),
        ),
      )
      .orderBy("priority_tier", "asc")
      .limit(limit)
      .execute();

    for (const account of due) {
      seen += 1;
      let rows: GetleadsContact[] = [];
      try {
        const result = (await graphed.tools.run(
          "getleads:contacts.search",
          {
            domains: [account.domain],
            countries: ["US"],
            jobTitles: allDictionaryTitles(),
            limit: 50,
            maxPerCompany: MAX_PER_ACCOUNT * 3,
          },
          { timeoutSeconds: 120 },
        )) as unknown;
        // Tolerate the common envelopes: bare array, {data: []}, {contacts: []}.
        const root = result as Record<string, unknown>;
        const list = Array.isArray(result)
          ? result
          : ((root?.data ?? root?.contacts ?? root?.results ?? []) as unknown[]);
        rows = list as GetleadsContact[];
      } catch (error) {
        console.warn(
          `getleads failed for ${account.domain}: ${error instanceof Error ? error.message : error}`,
        );
        continue;
      }

      let imported = 0;
      for (const row of rows) {
        if (imported >= MAX_PER_ACCOUNT) break;
        const c = contactFields(row);
        if (!c.email || !c.title) continue;
        const match = matchTitle(c.title);
        if (!match) continue;
        if (match.module === "referrals" && account.account_type !== "ccrr") {
          if (/executive director/i.test(c.title)) continue;
        }
        // Only import contacts for modules the account actually fits.
        if (!account.modules_fit.includes(match.module)) continue;
        try {
          const result = await db
            .insertInto("contacts")
            .values({
              account_id: account.account_id,
              first_name: c.firstName,
              last_name: c.lastName,
              title: c.title.slice(0, 200),
              title_rank: match.rank,
              module_segment: match.module,
              email: c.email,
              email_source: "getleads",
              linkedin_url: c.linkedin,
            })
            .onConflict((oc) => oc.doNothing())
            .executeTakeFirst();
          if (Number(result.numInsertedOrUpdatedRows ?? 0) > 0) {
            imported += 1;
            added += 1;
          }
        } catch {
          // unique-email race; skip
        }
      }
      await sleep(250);
    }

    return { seen, added, updated: 0 };
  });
}
