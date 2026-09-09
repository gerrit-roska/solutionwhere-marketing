import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDb } from "../db";
import { graphed } from "./graphed";
import { warehouseConfig, withSchemas, wq } from "./warehouse";
import { fireAlert } from "./alerts";

// Quarterly keyword-volume refresh (08-keyword-research.md §7), run through
// Graphed Tools (`dataforseo:google_ads.search_volume.live`, up to 1,000
// keywords per call) — no vendor keys. Terms = the master list in
// data/keyword-terms.txt plus every Search Console query with >= 5
// impressions in 90 days (once GSC is connected). Costs credits: retries: 0.

interface DfsVolumeRow {
  keyword?: string;
  search_volume?: number | null;
  cpc?: number | null;
  competition?: number | null;
  monthly_searches?: { search_volume?: number }[];
}

const CLUSTER_RULES: [RegExp, string][] = [
  [/solutionwhere|wisdomwhere|coursewhere|solutionware|central pd/i, "brand"],
  [
    /frontline|mylearningplan|my learning plan|vector solutions|schoolmint|sibme|kickup|kalpa|escworks|teachboost|icarol|worklife|powerschool|avela|edthena|whetstone|bullseye|kindersystems|bridgecare|wonderschool|tootris/i,
    "competitor",
  ],
  [/act 48|scech|ctle|lpdc|moecs|lvis|elis|adeconnect|epsb|ksde|plu georgia|cpe (hours|texas)|clock hour/i, "credit_system"],
  [/license renewal|certification renewal|recertification|relicensure|teacher certification/i, "state"],
  [/enroll|registration|lottery|waitlist|residency/i, "enr"],
  [/coach|mentor|walkthrough|observation|induction/i, "cch"],
  [/referral|ccr|child care/i, "ref"],
  [/professional development|professional learning|\bpd\b|ceu/i, "pd"],
];

function clusterOf(keyword: string): string {
  for (const [pattern, cluster] of CLUSTER_RULES) {
    if (pattern.test(keyword)) return cluster;
  }
  return "adjacent";
}

function loadTermList(): string[] {
  const path = resolve(process.cwd(), "data/keyword-terms.txt");
  try {
    return readFileSync(path, "utf-8")
      .split("\n")
      .map((line) => line.trim().toLowerCase())
      .filter((line) => line.length > 0 && !line.startsWith("#"));
  } catch {
    console.warn(`No term list at ${path}; using Search Console terms only.`);
    return [];
  }
}

async function searchConsoleTerms(): Promise<string[]> {
  if (!warehouseConfig().searchConsole) {
    console.log("Search Console source not connected yet — skipping GSC terms.");
    return [];
  }
  const rows = await wq<{ query: string }>(
    withSchemas(
      `SELECT query, sum(impressions) AS imp
       FROM {searchConsole}.keyword_site_report_by_site
       WHERE date >= today() - 90
       GROUP BY query HAVING imp >= 5`,
    ),
  );
  return rows.map((row) => row.query.toLowerCase());
}

export async function run(): Promise<void> {
  const db = getDb();
  const pulledOn = new Date().toISOString().slice(0, 10);

  const terms = [...new Set([...loadTermList(), ...(await searchConsoleTerms())])];
  if (terms.length === 0) {
    console.log("No terms to refresh.");
    return;
  }
  console.log(`Refreshing volume for ${terms.length} terms via Graphed Tools.`);

  // Previous pull for threshold-crossing alerts (08 §7.5).
  const previous = new Map<string, number>();
  const prior = await db
    .selectFrom("keyword_volumes")
    .select(["keyword", "volume", "pulled_on"])
    .where("provider", "=", "dataforseo")
    .orderBy("pulled_on", "desc")
    .execute();
  for (const row of prior) {
    if (!previous.has(row.keyword)) previous.set(row.keyword, row.volume);
  }

  let inserted = 0;
  for (let start = 0; start < terms.length; start += 1000) {
    const batch = terms.slice(start, start + 1000);
    const result = (await graphed.tools.run(
      "dataforseo:google_ads.search_volume.live",
      { keywords: batch, location_name: "United States", language_name: "English" },
      { timeoutSeconds: 600 },
    )) as { tasks?: { result?: DfsVolumeRow[] }[] } | DfsVolumeRow[];

    const rows: DfsVolumeRow[] = Array.isArray(result)
      ? result
      : (result.tasks ?? []).flatMap((task) => task.result ?? []);

    for (const row of rows) {
      if (!row.keyword) continue;
      const keyword = row.keyword.toLowerCase();
      const volume = row.search_volume ?? 0;
      await db
        .insertInto("keyword_volumes")
        .values({
          keyword,
          pulled_on: pulledOn,
          provider: "dataforseo",
          data_source: "live",
          volume,
          cpc_usd: row.cpc ?? null,
          competition: row.competition ?? null,
          trend_12mo:
            row.monthly_searches?.map((m) => m.search_volume ?? 0) ?? null,
          cluster: clusterOf(keyword),
        })
        .onConflict((oc) => oc.doNothing())
        .execute();
      inserted += 1;

      // Threshold crossings (08 §7.5).
      const before = previous.get(keyword) ?? 0;
      const cluster = clusterOf(keyword);
      if (before < 50 && volume >= 50) {
        await fireAlert("keyword-crossed-50", "info", keyword, { before, volume, cluster });
      }
      if (cluster === "competitor" && before < 1000 && volume >= 1000) {
        await fireAlert("competitor-brand-crossed-1000", "info", keyword, { before, volume });
      }
      if (cluster === "credit_system" && before < 500 && volume >= 500) {
        await fireAlert("credit-system-crossed-500", "info", keyword, { before, volume });
      }
    }
  }

  // Re-rank the pending SEO queue so the kit drafts highest-volume pages
  // first (07 §4.9 step 4).
  const latest = await db
    .selectFrom("keyword_volumes")
    .select(["keyword", "volume"])
    .where("pulled_on", "=", pulledOn)
    .execute();
  const volumeByKeyword = new Map(latest.map((r) => [r.keyword, r.volume]));
  const pending = await db
    .selectFrom("seo_keywords")
    .select(["id", "keyword"])
    .where("status", "=", "pending")
    .execute();
  const ranked = pending
    .map((row) => ({ id: row.id, volume: volumeByKeyword.get(row.keyword.toLowerCase()) ?? -1 }))
    .filter((row) => row.volume >= 0)
    .sort((a, b) => b.volume - a.volume);
  for (const [index, row] of ranked.entries()) {
    await db
      .updateTable("seo_keywords")
      .set({ priority: index + 1 })
      .where("id", "=", row.id)
      .execute();
  }

  console.log(
    `Keyword refresh complete: ${inserted} rows for ${pulledOn}; re-ranked ${ranked.length} pending seo keywords.`,
  );
}
