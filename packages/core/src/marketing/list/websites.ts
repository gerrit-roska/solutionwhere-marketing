import { getDb } from "../../db";
import { graphed } from "../graphed";
import { domainOf, recordRun, sleep } from "./shared";
import { applyAccountScope, type AccountScope } from "./waves";

// Website resolution (FDE-530): the Urban CCD API carries no usable website
// field, so accounts arrive with website NULL and the staff-directory crawl
// (which requires a website) processed nothing — contacts stayed at 0.
//
// This pass resolves the official site for accounts missing one through
// Graphed Tools (`serper:search`, 0.115 credits/query), then the directory
// crawl has something to work with. One query per account, results filtered
// against a blocklist of domains that are never an agency's own site.
//
// Cost math: ~8,200-account backlog × 0.115 cr ≈ 950 credits one-time;
// the nightly batch only handles newly-arrived accounts after that.

const BATCH_LIMIT = 300;

// Never an agency's own website — search results pointing here are about
// the agency, not its site.
const BLOCKED_DOMAINS = new Set([
  "facebook.com", "twitter.com", "x.com", "linkedin.com", "instagram.com",
  "youtube.com", "wikipedia.org", "greatschools.org", "niche.com",
  "usnews.com", "patch.com", "indeed.com", "glassdoor.com", "ziprecruiter.com",
  "google.com", "bing.com", "yahoo.com", "yelp.com", "mapquest.com",
  "whitepages.com", "apple.com", "amazon.com", "pinterest.com", "tiktok.com",
  "reddit.com", "quora.com", "tripadvisor.com", "zoominfo.com", "dnb.com",
  "ballotpedia.org", "census.gov", "nces.ed.gov", "educationdata.urban.org",
]);

interface SerperOrganic {
  link?: string;
  title?: string;
}

interface SerperResult {
  organic?: SerperOrganic[];
}

const AGENCY_NOUN: Record<string, string> = {
  district: "school district",
  esa: "education service agency",
  ccrr: "child care resource and referral",
  head_start: "head start",
  sea: "state education agency",
  cmo: "charter school network",
  county_network: "county education",
};

/** First organic result whose domain is a plausible official site. */
function pickOfficialSite(result: SerperResult): string | null {
  for (const hit of result.organic ?? []) {
    if (!hit.link) continue;
    const domain = domainOf(hit.link);
    if (!domain || BLOCKED_DOMAINS.has(domain)) continue;
    // Agency sites skew .org/.us/.k12/.gov/.edu; a bare .com is fine too
    // (many districts) — the blocklist already removed the junk.
    return hit.link;
  }
  return null;
}

export async function runWebsiteResolution(
  limit: number = BATCH_LIMIT,
  scope?: AccountScope,
): Promise<void> {
  await recordRun("website-resolution", async () => {
    const db = getDb();
    let seen = 0;
    let added = 0;
    let updated = 0;

    const due = await applyAccountScope(
      db
        .selectFrom("accounts")
        .select(["account_id", "account_name", "account_type", "state", "city"])
        .where("suppressed", "=", false)
        .where("website", "is", null)
        .orderBy("priority_tier", "asc")
        .orderBy("enrollment", "desc"),
      scope,
    )
      .limit(limit)
      .execute();

    for (const account of due) {
      seen += 1;
      const noun = AGENCY_NOUN[account.account_type] ?? "agency";
      const where = [account.city, account.state].filter(Boolean).join(", ");
      const q = `${account.account_name} ${noun} ${where} official website`;

      let site: string | null = null;
      try {
        const result = (await graphed.tools.run(
          "serper:search",
          { q, gl: "us", num: 5 },
          { timeoutSeconds: 60 },
        )) as SerperResult;
        site = pickOfficialSite(result);
      } catch (error) {
        console.warn(
          `serper failed for "${account.account_name}": ${error instanceof Error ? error.message : error}`,
        );
      }

      if (!site) {
        // Stamp last_verified so the rotation doesn't retry the same
        // unresolvable accounts every night; they re-enter after 90 days.
        await db
          .updateTable("accounts")
          .set({ last_verified: new Date().toISOString().slice(0, 10) })
          .where("account_id", "=", account.account_id)
          .execute();
        await sleep(250);
        continue;
      }

      const domain = domainOf(site);
      if (domain) {
        // Domain is the dedupe key (06 §4): if another account already owns
        // it, this row is a duplicate — suppress rather than violate the
        // unique index.
        const existing = await db
          .selectFrom("accounts")
          .select("account_id")
          .where("domain", "=", domain)
          .executeTakeFirst();
        if (existing) {
          await db
            .updateTable("accounts")
            .set({
              suppressed: true,
              suppression_reason: `duplicate of ${domain}`,
              last_verified: new Date().toISOString().slice(0, 10),
            })
            .where("account_id", "=", account.account_id)
            .execute();
          updated += 1;
          await sleep(250);
          continue;
        }
      }

      await db
        .updateTable("accounts")
        .set({ website: site, domain })
        .where("account_id", "=", account.account_id)
        .execute();
      added += 1;
      await sleep(250); // gentle on the tools backend
    }

    return { seen, added, updated };
  });
}
