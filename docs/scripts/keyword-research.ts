/**
 * Keyword volume research — Keywords Everywhere or DataForSEO.
 *
 *   npm run keyword-research -- --kw "act 48" --kw "school registration software"
 *   npm run keyword-research -- --file ./terms.txt --out ./volumes.csv
 *   npm run keyword-research -- --related "act 48" --related "scech" --out ./related.csv
 *   npm run keyword-research -- --provider dataforseo --file ./terms.txt --out ./volumes.csv
 *   npm run keyword-research -- --provider keywordseverywhere --source cli --file ./terms.txt   # KE clickstream
 *
 * Providers
 *   keywordseverywhere (default)  env KEYWORDS_EVERYWHERE_API_KEY
 *       POST /v1/get_keyword_data      1 credit / keyword, 100 keywords / request
 *       POST /v1/get_related_keywords  ~1 credit / term returned (bare strings; volumes fetched after)
 *       POST /v1/get_pasf_keywords     same
 *   dataforseo                    env DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD (HTTP Basic)
 *       POST /v3/keywords_data/google_ads/search_volume/live         up to 1,000 keywords / task
 *       POST /v3/dataforseo_labs/google/related_keywords/live        depth 1-4, limit ≤ 1,000
 *       POST /v3/dataforseo_labs/google/keyword_suggestions/live     long-tail containing the seed
 *
 * Output CSV: keyword,volume,cpc_usd,competition,trend_12mo[,seed,source]
 * Both providers return Google Ads (Keyword Planner) volume buckets — numbers are comparable.
 */
import "dotenv/config";
import fs from "node:fs";

type Provider = "keywordseverywhere" | "dataforseo";

interface Row {
  keyword: string;
  volume: number;
  cpc: number;
  competition: number;
  trend: string;
  seed?: string;
  source?: string;
}

function parseArgs(argv: string[]) {
  const out = {
    kw: [] as string[], related: [] as string[], file: "", out: "",
    provider: (process.env.KEYWORD_PROVIDER as Provider) || "keywordseverywhere",
    source: "gkp", country: "us", num: 50,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === "--kw") out.kw.push(next());
    else if (a === "--related") out.related.push(next());
    else if (a === "--file") out.file = next();
    else if (a === "--out") out.out = next();
    else if (a === "--provider") out.provider = next() as Provider;
    else if (a === "--source") out.source = next();
    else if (a === "--country") out.country = next();
    else if (a === "--num") out.num = Number(next());
  }
  return out;
}

// ---------------------------------------------------------------- Keywords Everywhere
const KE = "https://api.keywordseverywhere.com/v1";
function keHeaders() {
  const key = process.env.KEYWORDS_EVERYWHERE_API_KEY;
  if (!key) throw new Error("KEYWORDS_EVERYWHERE_API_KEY is not set");
  return { Authorization: `Bearer ${key}`, Accept: "application/json" };
}

async function keVolumes(kws: string[], source: string, country: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let i = 0; i < kws.length; i += 100) {
    const body = new URLSearchParams();
    body.append("country", country);
    body.append("currency", "usd");
    body.append("dataSource", source);
    kws.slice(i, i + 100).forEach((k) => body.append("kw[]", k));
    const r = await fetch(`${KE}/get_keyword_data`, { method: "POST", headers: keHeaders(), body });
    if (!r.ok) throw new Error(`KE HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
    const j = (await r.json()) as { data?: any[]; credits?: number };
    if (!j.data) throw new Error(JSON.stringify(j).slice(0, 300));
    for (const d of j.data) {
      rows.push({
        keyword: d.keyword, volume: d.vol ?? 0, cpc: parseFloat(d.cpc?.value) || 0,
        competition: d.competition ?? 0,
        trend: (d.trend || []).slice(-12).map((t: any) => t.value).join("|"),
      });
    }
    console.error(`KE batch ${i / 100 + 1}: ${Math.min(i + 100, kws.length)}/${kws.length}, credits left ${j.credits}`);
  }
  return rows;
}

async function keRelated(seed: string, num: number, country: string): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const ep of ["get_related_keywords", "get_pasf_keywords"]) {
    const body = new URLSearchParams({ keyword: seed, num: String(num), country, currency: "usd" });
    const r = await fetch(`${KE}/${ep}`, { method: "POST", headers: keHeaders(), body });
    const j = (await r.json()) as { data?: unknown };
    for (const d of Array.isArray(j.data) ? j.data : []) {
      const k = typeof d === "string" ? d : (d as any)?.keyword;
      if (k && !found.has(k)) found.set(k, ep);
    }
  }
  return found;
}

// ---------------------------------------------------------------- DataForSEO
const DFS = "https://api.dataforseo.com/v3";
const DFS_LOCATION: Record<string, number> = { us: 2840, gb: 2826, ca: 2124, au: 2036 };
function dfsHeaders() {
  const login = process.env.DATAFORSEO_LOGIN, password = process.env.DATAFORSEO_PASSWORD;
  if (!login || !password) throw new Error("DATAFORSEO_LOGIN / DATAFORSEO_PASSWORD are not set");
  return {
    Authorization: `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`,
    "Content-Type": "application/json",
  };
}

async function dfsPost(path: string, task: Record<string, unknown>): Promise<any> {
  const r = await fetch(`${DFS}${path}`, { method: "POST", headers: dfsHeaders(), body: JSON.stringify([task]) });
  if (!r.ok) throw new Error(`DataForSEO HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  const j = await r.json();
  const t = j.tasks?.[0];
  if (!t || t.status_code !== 20000) throw new Error(`DataForSEO task error: ${t?.status_message ?? JSON.stringify(j).slice(0, 300)}`);
  console.error(`DFS ${path} cost $${j.cost ?? t.cost ?? "?"}`);
  return t.result;
}

async function dfsVolumes(kws: string[], country: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let i = 0; i < kws.length; i += 1000) {
    const result = await dfsPost("/keywords_data/google_ads/search_volume/live", {
      keywords: kws.slice(i, i + 1000), location_code: DFS_LOCATION[country] ?? 2840, language_code: "en",
    });
    for (const d of result ?? []) {
      rows.push({
        keyword: d.keyword, volume: d.search_volume ?? 0, cpc: d.cpc ?? 0,
        competition: d.competition_index != null ? d.competition_index / 100 : 0,
        trend: (d.monthly_searches || []).slice(0, 12).reverse().map((m: any) => m.search_volume).join("|"),
      });
    }
  }
  return rows;
}

async function dfsRelated(seed: string, limit: number, country: string): Promise<Row[]> {
  const rows: Row[] = [];
  const loc = DFS_LOCATION[country] ?? 2840;
  const related = await dfsPost("/dataforseo_labs/google/related_keywords/live", {
    keyword: seed, location_code: loc, language_code: "en", depth: 2, limit,
  });
  for (const it of related?.[0]?.items ?? []) {
    const kd = it.keyword_data;
    rows.push({ keyword: kd.keyword, volume: kd.keyword_info?.search_volume ?? 0, cpc: kd.keyword_info?.cpc ?? 0,
      competition: kd.keyword_info?.competition ?? 0, trend: "", seed, source: "related_keywords" });
  }
  const sugg = await dfsPost("/dataforseo_labs/google/keyword_suggestions/live", {
    keyword: seed, location_code: loc, language_code: "en", limit,
  });
  for (const it of sugg?.[0]?.items ?? []) {
    rows.push({ keyword: it.keyword, volume: it.keyword_info?.search_volume ?? 0, cpc: it.keyword_info?.cpc ?? 0,
      competition: it.keyword_info?.competition ?? 0, trend: "", seed, source: "keyword_suggestions" });
  }
  return rows;
}

// ---------------------------------------------------------------- main
function toCsv(rows: Row[], withSeed: boolean): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const head = "keyword,volume,cpc_usd,competition,trend_12mo" + (withSeed ? ",seed,source" : "");
  return head + "\n" + rows.map((r) =>
    [q(r.keyword), r.volume, r.cpc, r.competition, q(r.trend), ...(withSeed ? [q(r.seed ?? ""), r.source ?? ""] : [])].join(","),
  ).join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let rows: Row[] = [];

  if (args.related.length) {
    if (args.provider === "dataforseo") {
      const seen = new Map<string, Row>();
      for (const seed of args.related) for (const r of await dfsRelated(seed, args.num, args.country))
        if (!seen.has(r.keyword) || seen.get(r.keyword)!.volume < r.volume) seen.set(r.keyword, r);
      rows = [...seen.values()];
    } else {
      const seen = new Map<string, { seed: string; source: string }>();
      for (const seed of args.related) for (const [k, source] of await keRelated(seed, args.num, args.country))
        if (!seen.has(k)) seen.set(k, { seed, source });
      const vols = await keVolumes([...seen.keys()], args.source, args.country);
      rows = vols.map((v) => ({ ...v, ...seen.get(v.keyword) }));
    }
  } else {
    const kws = [...args.kw];
    if (args.file) kws.push(...fs.readFileSync(args.file, "utf8").split("\n").map((s) => s.trim()).filter(Boolean));
    if (!kws.length) { console.error("Provide --kw, --file, or --related"); process.exit(1); }
    const unique = [...new Set(kws)];
    rows = args.provider === "dataforseo" ? await dfsVolumes(unique, args.country) : await keVolumes(unique, args.source, args.country);
  }

  rows.sort((a, b) => b.volume - a.volume);
  const csv = toCsv(rows, args.related.length > 0);
  if (args.out) { fs.writeFileSync(args.out, csv); console.error(`wrote ${rows.length} rows → ${args.out}`); }
  console.log("   vol |    cpc | comp | keyword");
  for (const r of rows) console.log(`${String(r.volume).padStart(6)} | $${r.cpc.toFixed(2).padStart(6)} | ${String(r.competition).padStart(4)} | ${r.keyword}${r.seed ? `   [${r.seed}]` : ""}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
