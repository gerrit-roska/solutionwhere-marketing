import * as cheerio from "cheerio";
import { CRAWL_USER_AGENT, domainOf, recordRun, sleep, upsertAccount } from "./shared";
import { priorityFor } from "./waves";

// AESA member directory — regional education service agencies (06 §2.2).
// ~482 members across 39 states; the Find page caps at 50/page, so iterate
// the state filter. Detail pages follow /directory/Details/{slug}-{id}.
// Membership is voluntary (482 of ~550 nationally); NCES LEA_TYPE=3 rows and
// the state association lists fill gaps.

const STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: { "User-Agent": CRAWL_USER_AGENT },
  });
  if (!response.ok) throw new Error(`AESA fetch failed: ${response.status} ${url}`);
  return response.text();
}

export async function runAesa(): Promise<void> {
  await recordRun("aesa-directory", async () => {
    let seen = 0;
    let added = 0;
    let updated = 0;
    const detailUrls = new Set<string>();

    for (const state of STATES) {
      const listUrl = `https://members.aesa.us/directory/Find?state=${state}`;
      let html = "";
      try {
        html = await fetchPage(listUrl);
      } catch (error) {
        console.warn(`AESA state ${state} failed: ${error instanceof Error ? error.message : error}`);
        continue;
      }
      const $ = cheerio.load(html);
      for (const el of $("a[href*='/directory/Details/']").toArray()) {
        const href = $(el).attr("href");
        if (href) detailUrls.add(new URL(href, "https://members.aesa.us").toString());
      }
      await sleep(1000);
    }

    for (const url of detailUrls) {
      seen += 1;
      let html = "";
      try {
        html = await fetchPage(url);
      } catch {
        continue;
      }
      const $ = cheerio.load(html);
      const name = $("h1, h2").first().text().trim();
      if (!name) continue;
      const bodyText = $("body").text();
      const stateMatch = /\b([A-Z]{2})\s+\d{5}/.exec(bodyText);
      const websiteHref = $("a[href^='http']")
        .toArray()
        .map((el) => $(el).attr("href") ?? "")
        .find((href) => !href.includes("aesa.us") && !href.includes("facebook") && !href.includes("linkedin"));

      const { isNew } = await upsertAccount({
        account_name: name,
        account_type: "esa",
        domain: domainOf(websiteHref ?? null),
        website: websiteHref ?? null,
        state: stateMatch?.[1] ?? "US",
        modules_fit: ["pd", "coaching"],
        priority_tier: priorityFor(stateMatch?.[1] ?? "US", "esa"),
        source: "aesa-directory",
        source_url: url,
      });
      if (isNew) added += 1;
      else updated += 1;
      await sleep(1000);
    }
    return { seen, added, updated };
  });
}
