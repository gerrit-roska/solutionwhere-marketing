import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { GraphedApiError } from "@graphed-inc/sdk";
import { graphed } from "../marketing/graphed";
import { presignGet, putText } from "../marketing/storage";
import {
  DIRECTORY_PATHS,
  extractDirectoryContacts,
  fetchDirectoryPage,
} from "../marketing/list/directories";
import { matchTitle } from "../marketing/list/titles";
import { sleep } from "../marketing/list/shared";
import { createLead } from "./instantly";

// NutraCap-shaped people waterfall (not NCES agencies):
//   1. GetLeads contacts.search — ICP titles + education industry
//   2. GetLeads decision-makers on known ESA domains (George's AR co-ops)
//   3. In-process cheerio on staff directories; Apify playwright per site if HTML is empty
//   4. GetLeads enrich.from-person when we have a name but no email
//   5. Million Verifier — GetLeads VALID is a cached flag (NutraCap: 48% fail)
//   6. POST /leads into DRAFT Instantly campaigns. Never activate.
//
// Stages checkpoint to data/leads-waterfall/snapshot.json so a timed-out
// MV run can resume without re-billing.

export const CAMPAIGNS = {
  pd: "6986113a-c215-4445-ac48-d8b2d96e138b",
  enrollments: "9b3a24ce-661f-4791-a7ee-8235bb9d8642",
  coaching: "a8df48b9-b9c6-42db-b825-f62bdc6923ef",
  referrals: "41db1d22-6d1f-4606-a3f2-0baf5a2dece0",
} as const;

export type ModuleId = keyof typeof CAMPAIGNS;

const EDUCATION_SQL =
  "org_industry_linkedin IN ('Primary and Secondary Education','Education Management','Education')";

const SKIP_TITLE = [
  "secretary",
  "clerk",
  "office assistant",
  "administrative assistant",
  "school registrar",
];

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

const SUPPRESSION = new Set([
  "1pssonline.com", "aea9.k12.ia.us", "archphila.org", "baisd.net", "bogschools.org",
  "bviu.org", "caiu.org", "cgresd.net", "charemisd.org", "clevelandcountyschools.org",
  "conneautsd.org", "copesd.org", "copperisd.org", "csiu.org", "diisd.org", "dpi.nc.gov",
  "dsisd.net", "elwyn.com", "elwyn.org", "eogschools.org", "eriercd.org", "eupschools.org",
  "gcs.k12.nc.us", "gfps.k12.mt.us", "goisd.org", "greeleyschools.org", "hcscrusaders.com",
  "hesperiausd.org", "huronisd.org", "iu28.org", "iu29.org", "iu5.org", "jci.com", "jcisd.org",
  "jklschool.org", "kresa.org", "lenoir.k12.nc.us", "lisd.us", "lpssonline.com", "maresa.org",
  "mbaea.org", "mc--isd.org", "mc-isd.org", "mcdean.com", "mimtss.org", "monroeisd.us",
  "mpsb.us", "oaisd.org", "pa.gov", "pacyber.org", "pmanetwork.com", "psdr3.org",
  "r8esc.k12.in.us", "rackspace.com", "remc.org", "rsdmo.org", "spsd.net", "svvsd.org",
  "tyco.com", "verizon.net", "vvsd.org", "waxman.com", "wearescpps.org", "wsesd.org",
  "solutionwhere.com", "wisdomwhere.com",
]);

const ARKANSAS_ESCS: { name: string; domain: string; url: string }[] = [
  { name: "Arch Ford ESC", domain: "archford.org", url: "https://www.archford.org/" },
  { name: "Arkansas River ESC", domain: "aresc.k12.ar.us", url: "http://www.aresc.k12.ar.us/" },
  { name: "Crowley's Ridge EC", domain: "crowleys.k12.ar.us", url: "http://www.crowleys.k12.ar.us/" },
  { name: "Dawson ESC", domain: "dawsonesc.com", url: "https://www.dawsonesc.com/" },
  { name: "DeQueen/Mena ESC", domain: "dmesc.org", url: "http://www.dmesc.org/" },
  { name: "Great Rivers ESC", domain: "greatrivers.net", url: "https://www.greatrivers.net/" },
  { name: "Guy Fenter ESC", domain: "gfesc.us", url: "https://www.gfesc.us/" },
  { name: "Northcentral Arkansas ESC", domain: "naesc.k12.ar.us", url: "https://www.naesc.k12.ar.us/" },
  { name: "Northeast Arkansas EC", domain: "nea.k12.ar.us", url: "http://nea.k12.ar.us/" },
  { name: "Northwest Arkansas ESC", domain: "nwaesc.org", url: "https://www.nwaesc.org/" },
  { name: "OUR ESC", domain: "oursc.k12.ar.us", url: "https://www.oursc.k12.ar.us/" },
  { name: "South Central SC", domain: "scscoop.org", url: "http://www.scscoop.org/" },
  { name: "Southeast Arkansas ESC", domain: "searkcoop.com", url: "https://www.searkcoop.com/" },
  { name: "Southwest Arkansas EC", domain: "swaec.org", url: "https://www.swaec.org/" },
  { name: "Wilbur D. Mills ESC", domain: "wilbur.k12.ar.us", url: "http://www.wilbur.k12.ar.us/" },
];

// Spec 06 §3.4: accept Million Verifier `ok` only. Catch-all on k12/org
// (Barracuda/Proofpoint) accepts then silently discards — false delivery,
// no replies, and a bounce-rate hit on the sending domain. NutraCap's
// Shopify path sometimes allows catch_all; this ICP does not.
export const MV_ACCEPT = new Set(["ok"]);
export const TARGET_OK = 2000;
/** Observed 2026-09-22 wave: 98 ok / 192 verified ≈ 51%. Over-pull 2×. */
export const MV_PASS_RATE = 0.5;
/** Per-campaign emails into MV each run. Caps a single wave so we do not
 *  verify 16k addresses in one sitting. Repeat until Instantly holds TARGET_OK. */
export const WAVE_EMAILS = 500;

interface Segment {
  id: ModuleId;
  jobTitles: string[];
}

const SEGMENTS: Segment[] = [
  {
    id: "pd",
    jobTitles: [
      "director of professional development",
      "professional development coordinator",
      "director of professional learning",
      "director of curriculum",
      "director of teaching and learning",
      "professional development specialist",
    ],
  },
  {
    id: "enrollments",
    jobTitles: [
      "director of enrollment",
      "enrollment coordinator",
      "director of student services",
      "school choice coordinator",
      "registrar",
    ],
  },
  {
    id: "coaching",
    jobTitles: [
      "instructional coaching coordinator",
      "director of instructional coaching",
      "early childhood coordinator",
      "director of early childhood",
      "quality improvement coordinator",
      "lead instructional coach",
      "coaching specialist",
      "technical assistance specialist",
    ],
  },
  {
    id: "referrals",
    jobTitles: [
      "director of child care resource and referral",
      "ccr&r director",
      "director of family services",
      "referral services manager",
      "child care program manager",
      "director of early childhood services",
    ],
  },
];

export interface WaterfallLead {
  email: string;
  firstName: string;
  lastName: string;
  title: string;
  companyName: string;
  domain: string;
  state: string;
  module: ModuleId;
  source: string;
  mv?: string;
  instantlyId?: string;
}

interface Snapshot {
  mvRunId: string | null;
  leads: WaterfallLead[];
  updatedAt: string;
}

interface GetleadsContact {
  first_name?: string;
  last_name?: string;
  email_address?: string;
  email?: string;
  job_title?: string;
  org_company_name?: string;
  org_domain?: string;
  email_domain?: string;
  state_name?: string;
  org_industry_linkedin?: string;
  email_status?: string;
}

const SNAPSHOT_PATH = join(process.cwd(), "data/leads-waterfall/snapshot.json");

function emailOf(row: GetleadsContact): string {
  return (row.email_address || row.email || "").trim().toLowerCase();
}

function domainOf(row: GetleadsContact, fallback = ""): string {
  const fromEmail = emailOf(row).split("@")[1];
  return (row.org_domain || row.email_domain || fromEmail || fallback).toLowerCase();
}

function isSuppressed(emailOrDomain: string): boolean {
  const value = emailOrDomain.toLowerCase();
  if (SUPPRESSION.has(value)) return true;
  const at = value.lastIndexOf("@");
  if (at > 0) return SUPPRESSION.has(value.slice(at + 1));
  return false;
}

function isConsumer(email: string): boolean {
  const domain = email.split("@")[1] || "";
  return CONSUMER_MAIL.has(domain);
}

function titleOk(title: string, module: ModuleId): boolean {
  const lower = title.toLowerCase();
  if (SKIP_TITLE.some((s) => lower.includes(s))) return false;
  const match = matchTitle(title);
  if (!match) return false;
  if (match.module === "referrals" && module !== "referrals") return false;
  return match.module === module;
}

function fromGetleads(row: GetleadsContact, module: ModuleId, source: string): WaterfallLead | null {
  const title = row.job_title || "";
  if (!titleOk(title, module)) return null;
  const domain = domainOf(row);
  const email = emailOf(row);
  if (domain && isSuppressed(domain)) return null;
  if (email && (isSuppressed(email) || isConsumer(email))) return null;
  return {
    email,
    firstName: (row.first_name || "").trim(),
    lastName: (row.last_name || "").trim(),
    title,
    companyName: row.org_company_name || "",
    domain,
    state: row.state_name || "",
    module,
    source,
  };
}

function extractContacts(result: unknown): GetleadsContact[] {
  if (Array.isArray(result)) return result as GetleadsContact[];
  const root = result as Record<string, unknown>;
  const list = root?.contacts ?? root?.data ?? root?.results ?? root?.items ?? [];
  return Array.isArray(list) ? (list as GetleadsContact[]) : [];
}

function loadSnapshot(): Snapshot | null {
  try {
    return JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as Snapshot;
  } catch {
    return null;
  }
}

function saveSnapshot(snapshot: Snapshot): void {
  mkdirSync(dirname(SNAPSHOT_PATH), { recursive: true });
  writeFileSync(
    SNAPSHOT_PATH,
    JSON.stringify({ ...snapshot, updatedAt: new Date().toISOString() }, null, 2),
  );
}

function extractCount(result: unknown): number {
  if (typeof result === "number") return result;
  const root = result as Record<string, unknown>;
  for (const key of [
    "total_matching",
    "exportable_rows",
    "count",
    "total",
    "total_count",
    "n",
    "contacts_count",
  ]) {
    const value = root?.[key];
    if (typeof value === "number") return value;
  }
  return 0;
}

export interface TamRow {
  module: ModuleId;
  getleads: number;
  targetOk: number;
  reachableOk: number;
  needEmails: number;
  alreadyOk: number;
}

export function alreadyOkByModule(leads: WaterfallLead[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const lead of leads) {
    if (MV_ACCEPT.has(lead.mv ?? "")) out[lead.module] = (out[lead.module] ?? 0) + 1;
  }
  return out;
}

export async function mapTam(alreadyOk: Record<string, number> = {}): Promise<TamRow[]> {
  const rows: TamRow[] = [];
  for (const segment of SEGMENTS) {
    let getleads = 0;
    try {
      const result = await graphed.tools.run(
        "getleads:contacts.count",
        {
          jobTitles: segment.jobTitles,
          countries: ["US"],
          whereSql: EDUCATION_SQL,
        },
        { timeoutSeconds: 90 },
      );
      getleads = extractCount(result);
      if (getleads === 0) {
        console.warn(`tam ${segment.id}: count envelope ${JSON.stringify(result).slice(0, 240)}`);
      } else {
        console.log(`  ${segment.id}: ${getleads} matching`);
      }
    } catch (error) {
      console.warn(
        `tam ${segment.id}: ${error instanceof Error ? error.message : error}`,
      );
    }
    const have = alreadyOk[segment.id] ?? 0;
    const reachableOk = Math.min(TARGET_OK, Math.floor(getleads * MV_PASS_RATE));
    const remainingOk = Math.max(0, reachableOk - have);
    rows.push({
      module: segment.id,
      getleads,
      targetOk: TARGET_OK,
      reachableOk,
      needEmails: Math.min(getleads, Math.ceil(remainingOk / MV_PASS_RATE)),
      alreadyOk: have,
    });
  }
  return rows;
}

async function searchGetleads(segment: Segment, pull: number): Promise<WaterfallLead[]> {
  const withEmail: WaterfallLead[] = [];
  const nameless: WaterfallLead[] = [];
  let offset = 0;
  const maxPages = Math.max(8, Math.ceil(pull / 50) + 2);
  for (let page = 0; page < maxPages && withEmail.length < pull; page += 1) {
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
    const rows = extractContacts(result);
    if (rows.length === 0) break;
    for (const row of rows) {
      const lead = fromGetleads(row, segment.id, "getleads");
      if (!lead) continue;
      if (lead.email.includes("@")) {
        if (withEmail.length < pull) withEmail.push(lead);
      } else if (lead.firstName && lead.lastName && lead.domain && nameless.length < 20) {
        nameless.push(lead);
      }
    }
    const root = result as { has_more?: boolean; next_offset?: number };
    if (root.has_more === false) break;
    offset = root.next_offset ?? offset + rows.length;
    if (rows.length < 50) break;
  }
  return [...withEmail, ...nameless];
}

async function decisionMakers(): Promise<WaterfallLead[]> {
  const out: WaterfallLead[] = [];
  for (const esc of ARKANSAS_ESCS) {
    if (isSuppressed(esc.domain)) continue;
    try {
      const result = await graphed.tools.run(
        "getleads:contacts.decision-makers",
        { domain: esc.domain, limit: 8, requireEmail: true },
        { timeoutSeconds: 90 },
      );
      for (const row of extractContacts(result)) {
        const title = row.job_title || "";
        const match = matchTitle(title);
        const module = (match?.module ?? "pd") as ModuleId;
        if (!CAMPAIGNS[module]) continue;
        const lead = fromGetleads(row, module, "getleads-dm");
        if (lead?.email.includes("@")) out.push(lead);
      }
    } catch (error) {
      console.warn(
        `decision-makers ${esc.domain}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  return out;
}

const STAFF_PAGE_FN = `async function pageFunction(context) {
  const { request } = context;
  const html = context.body || '';
  const rows = [];
  const seen = new Set();
  const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}/g;
  const text = String(html).replace(/<[^>]+>/g, ' ');
  let m;
  while ((m = re.exec(text))) {
    const email = m[0].toLowerCase();
    if (seen.has(email)) continue;
    seen.add(email);
    rows.push({ email, text: text.slice(Math.max(0, m.index - 80), m.index + 80), url: request.url });
  }
  return rows;
}`;

async function apifyOneEsc(esc: { name: string; url: string }): Promise<WaterfallLead[]> {
  try {
    const result = await graphed.tools.run(
      "apify:apify~playwright-scraper",
      {
        startUrls: [{ url: esc.url }, { url: new URL("/staff", esc.url).toString() }],
        pageFunction: STAFF_PAGE_FN,
        proxyConfiguration: { useApifyProxy: true },
        maxPagesPerCrawl: 4,
        maxRequestRetries: 0,
        linkSelector: "",
      },
      { timeoutSeconds: 180 },
    );
    const items = Array.isArray(result)
      ? result
      : ((result as { results?: unknown[] })?.results ?? []);
    const out: WaterfallLead[] = [];
    for (const item of items as Array<{ email?: string; text?: string }>) {
      const email = (item.email || "").toLowerCase();
      if (!email.includes("@") || isSuppressed(email) || isConsumer(email)) continue;
      const text = item.text || "";
      const match = matchTitle(text);
      if (!match || !CAMPAIGNS[match.module as ModuleId]) continue;
      const [local] = email.split("@");
      const domain = email.split("@")[1] || "";
      out.push({
        email,
        firstName: local.split(".")[0] ?? "",
        lastName: local.split(".")[1] ?? "",
        title: text.replace(/\s+/g, " ").trim().slice(0, 160),
        companyName: esc.name,
        domain,
        state: "Arkansas",
        module: match.module as ModuleId,
        source: "apify-directory",
      });
    }
    return out;
  } catch (error) {
    console.warn(`apify ${esc.name}: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}

async function scrapeStaffDirectories(useApify: boolean): Promise<WaterfallLead[]> {
  const out: WaterfallLead[] = [];
  let apifyTries = 0;
  for (const esc of ARKANSAS_ESCS) {
    if (isSuppressed(esc.domain)) continue;
    let contacts = extractDirectoryContacts((await fetchDirectoryPage(esc.url)) ?? "");
    for (const path of DIRECTORY_PATHS) {
      if (contacts.length > 0) break;
      const html = await fetchDirectoryPage(new URL(path, esc.url).toString());
      await sleep(400);
      if (html) contacts = extractDirectoryContacts(html);
    }
    let source = "directory";
    let extras: WaterfallLead[] = [];
    if (contacts.length === 0 && useApify && apifyTries < 3) {
      apifyTries += 1;
      extras = await apifyOneEsc(esc);
      source = "apify-directory";
    }
    const rows =
      extras.length > 0
        ? extras
        : contacts.flatMap((c) => {
            const match = matchTitle(c.title);
            if (!match || !CAMPAIGNS[match.module as ModuleId]) return [];
            if (isSuppressed(c.email) || isConsumer(c.email)) return [];
            const parts = c.name.split(" ").filter(Boolean);
            return [
              {
                email: c.email.toLowerCase(),
                firstName: parts[0] ?? "",
                lastName: parts.slice(1).join(" "),
                title: c.title.slice(0, 160),
                companyName: esc.name,
                domain: c.email.split("@")[1] || esc.domain,
                state: "Arkansas",
                module: match.module as ModuleId,
                source,
              } satisfies WaterfallLead,
            ];
          });
    console.log(`  ${esc.domain}: ${rows.length}`);
    out.push(...rows);
  }
  return out;
}

async function enrichMissing(leads: WaterfallLead[]): Promise<void> {
  const missing = leads.filter(
    (l) => !l.email.includes("@") && l.firstName && l.lastName && l.domain,
  );
  for (let i = 0; i < missing.length; i += 10) {
    const chunk = missing.slice(i, i + 10);
    try {
      const result = await graphed.tools.run(
        "getleads:enrich.from-person",
        {
          items: chunk.map((l) => ({
            firstName: l.firstName,
            lastName: l.lastName,
            emailDomain: l.domain,
            companyName: l.companyName,
          })),
        },
        { timeoutSeconds: 90 },
      );
      const rows = Array.isArray(result)
        ? result
        : ((result as { results?: unknown[]; items?: unknown[] }).results ??
          (result as { items?: unknown[] }).items ??
          []);
      for (const row of rows as Array<Record<string, string>>) {
        const fn = (row.firstName || row.first_name || "").toLowerCase();
        const ln = (row.lastName || row.last_name || "").toLowerCase();
        const em = (row.email || row.email_address || row.work_email || "").toLowerCase();
        const person = chunk.find(
          (l) => l.firstName.toLowerCase() === fn && l.lastName.toLowerCase() === ln,
        );
        if (person && em.includes("@") && !isSuppressed(em) && !isConsumer(em)) {
          person.email = em;
          person.source = `${person.source}+enrich`;
        }
      }
    } catch (error) {
      console.warn(`enrich.from-person: ${error instanceof Error ? error.message : error}`);
    }
  }
}

function parseMvCsv(csvText: string): Map<string, string> {
  const lines = csvText.split("\n").filter((line) => line.trim());
  const header = (lines[0] ?? "")
    .toLowerCase()
    .split(",")
    .map((h) => h.trim().replace(/"/g, ""));
  const emailIdx = header.findIndex((h) => h.includes("email"));
  const resultIdx = header.findIndex((h) => h === "result");
  const statusIdx =
    resultIdx >= 0
      ? resultIdx
      : header.findIndex((h) => h.includes("result") || h.includes("status"));
  const out = new Map<string, string>();
  if (emailIdx < 0 || statusIdx < 0) return out;
  for (const line of lines.slice(1)) {
    const cols = line.split(",").map((c) => c.trim().replace(/"/g, ""));
    const email = cols[emailIdx]?.toLowerCase();
    const result = cols[statusIdx]?.toLowerCase().replace(/\s+/g, "_");
    if (email && result) out.set(email, result);
  }
  return out;
}

async function downloadMvCsv(runId: string): Promise<string> {
  try {
    const csv = (await graphed.tools.downloadResult(runId)) as unknown;
    return typeof csv === "string"
      ? csv
      : Buffer.isBuffer(csv)
        ? csv.toString("utf-8")
        : String(csv);
  } catch (error) {
    if (
      error instanceof GraphedApiError &&
      error.code === "INVALID_RESULT" &&
      typeof error.body === "string"
    ) {
      return error.body;
    }
    throw error;
  }
}

async function verifyOne(email: string): Promise<string> {
  const res = (await graphed.tools.run(
    "million-verifier:validate",
    { email, timeout: 10 },
    { timeoutSeconds: 45 },
  )) as { result?: string };
  return String(res.result ?? "unknown").toLowerCase();
}

async function verifyMillion(
  leads: WaterfallLead[],
  opts: { resumeMv?: string; bulk?: boolean } = {},
): Promise<WaterfallLead[]> {
  const withEmail = leads.filter((l) => l.email.includes("@") && !isConsumer(l.email));
  if (withEmail.length === 0) return [];

  if (opts.resumeMv || opts.bulk) {
    let runId = opts.resumeMv ?? loadSnapshot()?.mvRunId ?? undefined;
    if (!runId) {
      const key = `mv/waterfall-${Date.now()}.txt`;
      await putText(key, withEmail.map((l) => l.email).join("\n"), "text/plain");
      const url = await presignGet(key, 3600);
      const started = await graphed.tools.start("million-verifier:bulk", {
        url,
        filter: "all",
      });
      runId = started.id;
      console.log(`  started bulk ${runId}`);
    } else {
      console.log(`  resuming bulk ${runId}`);
    }
    const existing = loadSnapshot();
    saveSnapshot({
      mvRunId: runId,
      leads: existing?.leads?.length ? existing.leads : withEmail,
      updatedAt: new Date().toISOString(),
    });
    await graphed.tools.wait(runId, { timeoutSeconds: 3000 });
    const report = await downloadMvCsv(runId);
    const byEmail = parseMvCsv(report);
    for (const lead of withEmail) lead.mv = byEmail.get(lead.email);
    const ok = withEmail.filter((l) => MV_ACCEPT.has(l.mv ?? ""));
    console.log(`  mv results: ${byEmail.size} rows, ${ok.length} ok`);
    return ok;
  }

  // NutraCap Shopify path: per-address validate, 5 at a time. Bulk sat
  // pending 12+ minutes on 100 addresses with no billed credits.
  const queue = [...withEmail];
  let done = 0;
  await Promise.all(
    Array.from({ length: 5 }, async () => {
      while (queue.length) {
        const lead = queue.shift();
        if (!lead) return;
        try {
          lead.mv = await verifyOne(lead.email);
        } catch (error) {
          lead.mv = "error";
          console.warn(
            `mv ${lead.email}: ${error instanceof Error ? error.message : error}`,
          );
        }
        done += 1;
        if (done % 25 === 0) console.log(`  mv ${done}/${withEmail.length}`);
      }
    }),
  );
  const ok = withEmail.filter((l) => MV_ACCEPT.has(l.mv ?? ""));
  const tally: Record<string, number> = {};
  for (const lead of withEmail) tally[lead.mv ?? "none"] = (tally[lead.mv ?? "none"] ?? 0) + 1;
  console.log(`  mv tally`, tally);
  return ok;
}

function dedupe(leads: WaterfallLead[]): WaterfallLead[] {
  const seen = new Set<string>();
  const perDomain = new Map<string, number>();
  const out: WaterfallLead[] = [];
  for (const lead of leads) {
    const key = lead.email || `${lead.firstName}|${lead.lastName}|${lead.domain}`;
    if (seen.has(key)) continue;
    const n = perDomain.get(lead.domain) ?? 0;
    if (lead.domain && n >= 2) continue;
    seen.add(key);
    if (lead.domain) perDomain.set(lead.domain, n + 1);
    out.push(lead);
  }
  return out;
}

async function uploadDraft(leads: WaterfallLead[]): Promise<WaterfallLead[]> {
  for (const lead of leads) {
    try {
      const created = await createLead({
        campaign: CAMPAIGNS[lead.module],
        email: lead.email,
        first_name: lead.firstName,
        last_name: lead.lastName,
        company_name: lead.companyName,
        website: lead.domain ? `https://${lead.domain}` : undefined,
        skip_if_in_workspace: true,
        verify_leads_on_import: false,
        custom_variables: {
          title: lead.title,
          state: lead.state,
          source: lead.source,
        },
      });
      lead.instantlyId = created.id ?? "ok";
    } catch (error) {
      console.warn(
        `instantly ${lead.email}: ${error instanceof Error ? error.message : error}`,
      );
    }
  }
  return leads;
}

export async function run(opts: {
  skipApify?: boolean;
  resumeMv?: string;
  fromSnapshot?: boolean;
  bulk?: boolean;
  uploadOnly?: boolean;
  tam?: boolean;
  waveEmails?: number;
} = {}): Promise<{
  searched: number;
  enriched: number;
  verified: number;
  uploaded: number;
  byModule: Record<string, number>;
  mvRunId: string | null;
  tam?: TamRow[];
}> {
  let searched: WaterfallLead[] = [];
  const prior = loadSnapshot();
  const have = alreadyOkByModule(prior?.leads ?? []);
  const wave = opts.waveEmails ?? WAVE_EMAILS;

  if (opts.tam) {
    console.log("TAM GetLeads count (education industry + titles)");
    const rows = await mapTam(have);
    console.log(JSON.stringify({ targetOk: TARGET_OK, mvPassRate: MV_PASS_RATE, wave, rows }, null, 2));
    return {
      searched: 0,
      enriched: 0,
      verified: 0,
      uploaded: 0,
      byModule: have,
      mvRunId: prior?.mvRunId ?? null,
      tam: rows,
    };
  }

  if (opts.uploadOnly) {
    const verified = (prior?.leads ?? []).filter((l) => MV_ACCEPT.has(l.mv ?? ""));
    if (verified.length === 0) throw new Error("No mv=ok leads in snapshot");
    console.log(`upload-only ${verified.length} verified people`);
    await uploadDraft(verified);
    const uploaded = verified.filter((l) => l.instantlyId).length;
    const byModule: Record<string, number> = {};
    for (const lead of verified.filter((l) => l.instantlyId)) {
      byModule[lead.module] = (byModule[lead.module] ?? 0) + 1;
    }
    saveSnapshot({
      mvRunId: prior?.mvRunId ?? null,
      leads: (prior?.leads ?? []).map((l) => verified.find((v) => v.email === l.email) ?? l),
      updatedAt: new Date().toISOString(),
    });
    return {
      searched: prior?.leads.length ?? 0,
      enriched: prior?.leads.length ?? 0,
      verified: verified.length,
      uploaded,
      byModule,
      mvRunId: prior?.mvRunId ?? null,
    };
  }

  if (opts.fromSnapshot && prior?.leads?.length) {
    console.log(`1/6 snapshot (${prior.leads.length} people, mv ${prior.mvRunId ?? "none"})`);
    searched = prior.leads;
  } else {
    console.log("1/6 GetLeads ICP search (education industry + titles)");
    for (const segment of SEGMENTS) {
      const remainingOk = Math.max(0, TARGET_OK - (have[segment.id] ?? 0));
      const pull = Math.min(wave, Math.ceil(remainingOk / MV_PASS_RATE));
      if (pull === 0) {
        console.log(`  ${segment.id}: already at ${TARGET_OK} ok`);
        continue;
      }
      const rows = await searchGetleads(segment, pull);
      console.log(
        `  ${segment.id}: ${rows.filter((r) => r.email.includes("@")).length} emails (wave ${pull}, remaining ok ${remainingOk})`,
      );
      searched.push(...rows);
    }

    console.log("2/6 GetLeads decision-makers on Arkansas ESC domains");
    const dms = await decisionMakers();
    console.log(`  decision-makers: ${dms.length}`);
    searched.push(...dms);

    console.log("3/6 staff directories (in-process cheerio, Apify if empty)");
    const scraped = await scrapeStaffDirectories(!opts.skipApify);
    console.log(`  directories: ${scraped.length}`);
    searched.push(...scraped);
  }

  const merged = dedupe(searched);
  console.log(`4/6 enrich.from-person (${merged.filter((l) => !l.email.includes("@")).length} missing)`);
  await enrichMissing(merged);

  const withEmail = merged.filter(
    (l) => l.email.includes("@") && !isSuppressed(l.email) && !isConsumer(l.email),
  );
  saveSnapshot({
    mvRunId: opts.resumeMv ?? prior?.mvRunId ?? null,
    leads: withEmail,
    updatedAt: new Date().toISOString(),
  });

  console.log(`5/6 Million Verifier on ${withEmail.length} addresses`);
  const verified = await verifyMillion(withEmail, {
    resumeMv: opts.resumeMv,
    bulk: opts.bulk,
  });
  console.log(`  ok: ${verified.length}`);

  saveSnapshot({
    mvRunId: loadSnapshot()?.mvRunId ?? opts.resumeMv ?? null,
    leads: withEmail.map((l) => verified.find((v) => v.email === l.email) ?? l),
    updatedAt: new Date().toISOString(),
  });

  console.log("6/6 Instantly draft upload (no activate)");
  await uploadDraft(verified);
  const uploaded = verified.filter((l) => l.instantlyId).length;
  const byModule: Record<string, number> = {};
  for (const lead of verified.filter((l) => l.instantlyId)) {
    byModule[lead.module] = (byModule[lead.module] ?? 0) + 1;
  }
  return {
    searched: searched.length,
    enriched: withEmail.length,
    verified: verified.length,
    uploaded,
    byModule,
    mvRunId: loadSnapshot()?.mvRunId ?? null,
  };
}
