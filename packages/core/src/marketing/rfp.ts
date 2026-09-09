import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as cheerio from "cheerio";
import { getDb } from "../db";
import { postSlack } from "./alerts";

// RFP / procurement watch (06-cold-email-execution.md §2.7, 07 §4.7).
// Sources are a hand-curated list of public procurement pages in
// data/rfp-sources.json ({name, url} rows — state portals, large-agency
// purchasing pages). A hit never enters a sequence: it goes to Slack for the
// AE the same day.

const KEYWORDS = [
  "professional development management",
  "pd registration",
  "professional development registration",
  "online student registration",
  "student registration",
  "school choice lottery",
  "enrollment management",
  "online enrollment",
  "instructional coaching",
  "coaching platform",
  "child care referral",
  "resource and referral",
  "learning management", // noisy but occasionally right (06 §2.7)
];

interface RfpSource {
  name: string;
  url: string;
}

function loadSources(): RfpSource[] {
  const path = resolve(process.cwd(), "data/rfp-sources.json");
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as RfpSource[];
  } catch {
    console.warn(`No RFP source list at ${path}; nothing to watch yet.`);
    return [];
  }
}

function matchKeyword(text: string): string | null {
  const lower = text.toLowerCase();
  for (const keyword of KEYWORDS) {
    if (lower.includes(keyword)) return keyword;
  }
  return null;
}

export async function run(): Promise<void> {
  const db = getDb();
  const sources = loadSources();
  let found = 0;

  for (const source of sources) {
    let html = "";
    try {
      const response = await fetch(source.url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Graphed-RFP-Watch",
        },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      html = await response.text();
    } catch (error) {
      console.warn(
        `RFP source ${source.name} failed: ${error instanceof Error ? error.message : error}`,
      );
      continue;
    }

    const $ = cheerio.load(html);
    const seen = new Set<string>();
    for (const el of $("a[href]").toArray()) {
      const text = $(el).text().trim();
      if (text.length < 15) continue;
      const keyword = matchKeyword(text);
      if (!keyword) continue;
      const href = $(el).attr("href") ?? "";
      const url = new URL(href, source.url).toString();
      if (seen.has(url)) continue;
      seen.add(url);

      const insertedRow = await db
        .insertInto("rfp_signals")
        .values({
          source: source.name,
          title: text.slice(0, 500),
          url,
          matched_keyword: keyword,
          alerted_at: new Date(),
        })
        .onConflict((oc) => oc.column("url").doNothing())
        .returning("id")
        .executeTakeFirst();
      if (insertedRow) {
        found += 1;
        await postSlack(
          `RFP signal — ${source.name}: "${text.slice(0, 200)}" (matched "${keyword}")\n${url}\nRoute to the AE; never into a sequence.`,
        );
      }
    }
  }
  console.log(`RFP watch complete: ${found} new signals from ${sources.length} sources.`);
}
