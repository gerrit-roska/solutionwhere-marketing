import { getDb } from "../../db";
import { graphed } from "../graphed";
import { matchTitleLoose } from "./titles";
import {
  buildEmail,
  isCatchAllDomain,
  observedPattern,
  type Pattern,
} from "./patterns";
import { emailDomain, recordRun, sleep, suppressedDomains } from "./shared";
import { applyAccountScope, type AccountScope } from "./waves";

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

function extractRows(result: unknown): GetleadsContact[] {
  if (Array.isArray(result)) return result as GetleadsContact[];
  const root = result as Record<string, unknown>;
  const list = root?.data ?? root?.contacts ?? root?.results ?? root?.items ?? [];
  return Array.isArray(list) ? (list as GetleadsContact[]) : [];
}

async function searchDomain(domain: string): Promise<GetleadsContact[]> {
  try {
    const result = await graphed.tools.run(
      "getleads:contacts.search",
      { domains: [domain], countries: ["US"], limit: 50, maxPerCompany: MAX_PER_ACCOUNT * 3 },
      { timeoutSeconds: 120 },
    );
    return extractRows(result);
  } catch (error) {
    console.warn(
      `getleads search ${domain}: ${error instanceof Error ? error.message : error}`,
    );
    return [];
  }
}

async function decisionMakers(domain: string): Promise<GetleadsContact[]> {
  try {
    const result = await graphed.tools.run(
      "getleads:contacts.decision-makers",
      { domain, limit: 8, requireEmail: true },
      { timeoutSeconds: 90 },
    );
    return extractRows(result);
  } catch (error) {
    console.warn(
      `getleads dm ${domain}: ${error instanceof Error ? error.message : error}`,
    );
    return [];
  }
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
  scope?: AccountScope,
): Promise<void> {
  await recordRun("getleads-enrichment", async () => {
    const db = getDb();
    let seen = 0;
    let added = 0;

    // Accounts with a resolved domain where the directory crawl already ran
    // (last_verified set) and produced zero contacts.
    const due = await applyAccountScope(
      db
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
        .orderBy("priority_tier", "asc"),
      scope,
    )
      .limit(limit)
      .execute();

    for (const account of due) {
      seen += 1;
      const domain = account.domain!;
      let rows = await searchDomain(domain);
      if (rows.length === 0) rows = await decisionMakers(domain);
      console.log(`getleads ${domain}: ${rows.length} rows`);
      let skippedTitle: string | null = null;

      let imported = 0;
      // §3.3 fallback state for this domain: never probe a catch-all, and
      // prefer the pattern already observed in the account's directory.
      const catchAll = account.domain
        ? await isCatchAllDomain(account.domain)
        : true;
      const observed =
        account.domain && !catchAll
          ? await observedPattern(account.domain)
          : null;
      const patternCandidates: Pattern[] = observed
        ? [observed]
        : ["first.last", "first"];

      // 07 §4.2: one suppression lookup per account, covering the account
      // domain and any email domain GetLeads returned. Matches are written
      // suppressed = true, never dropped.
      const suppressed = await suppressedDomains([
        account.domain,
        ...rows.map((row) => emailDomain(contactFields(row).email)),
      ]);
      const isSuppressed = (email: string | null): boolean => {
        const d = emailDomain(email);
        return (
          (account.domain != null && suppressed.has(account.domain)) ||
          (d != null && suppressed.has(d))
        );
      };

      for (const row of rows) {
        if (imported >= MAX_PER_ACCOUNT) break;
        const c = contactFields(row);
        if (!c.title) continue;
        const match = matchTitleLoose(c.title);
        if (!match) {
          skippedTitle ??= c.title;
          continue;
        }
        if (match.module === "referrals" && account.account_type !== "ccrr") {
          if (/executive director/i.test(c.title)) continue;
        }
        // Only import contacts for modules the account actually fits.
        if (!account.modules_fit.includes(match.module)) continue;

        // GetLeads knows the person but sometimes not the address — infer
        // it per §3.3 (max two probes; guesses stay mv_status NULL so the
        // verify job remains the gate before anything is sendable).
        const candidates: { email: string; source: string }[] = [];
        if (c.email) {
          candidates.push({ email: c.email, source: "getleads" });
        } else if (c.firstName && c.lastName && account.domain && !catchAll) {
          for (const pattern of patternCandidates) {
            if (candidates.length >= 2) break;
            const guess = buildEmail(pattern, c.firstName, c.lastName, account.domain);
            if (guess) candidates.push({ email: guess, source: "pattern" });
          }
        }

        for (const { email, source } of candidates) {
          if (imported >= MAX_PER_ACCOUNT) break;
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
                email,
                email_source: source,
                linkedin_url: c.linkedin,
                suppressed: isSuppressed(email),
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
      }
      await sleep(250);
      if (imported === 0 && skippedTitle) {
        console.log(`  ${domain}: 0 imported, e.g. "${skippedTitle}"`);
      }
    }

    return { seen, added, updated: 0 };
  });
}
