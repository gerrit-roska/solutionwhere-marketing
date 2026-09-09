#!/usr/bin/env node
// pipeline.mjs - the fb-ads agent orchestrator. Single entrypoint.
// Zero deps. Node >= 20. ESM. Every per-client value is read from config;
// there are no client constants in this file.
//
//   node pipeline.mjs            # real run (needs .env secrets; live paths gated)
//   DRY_RUN=1 node pipeline.mjs  # fully OFFLINE: fixtures in, real payloads out, zero network
//
// DRY_RUN is a hard contract: it NEVER touches the network and NEVER mutates
// real run state - it writes only to dry-run-output/ (a scratch root), so an
// offline smoke test can never change what a real run would do next.
import { readFileSync, existsSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { buildPayload, publishToMeta } from './adapters/index.mjs';
import { planRun } from './optimizer.mjs';

const AGENT_DIR = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = Boolean(process.env.DRY_RUN);

function loadDotEnv() {
  const p = join(AGENT_DIR, '.env');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split('\n')) {
    const m = /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(line.trim());
    if (m && !(m[1] in process.env) && m[2] !== '') process.env[m[1]] = m[2]; // existing env wins; never logged
  }
}

function loadConfig() {
  const candidates = [
    process.env.CONFIG_FILE,
    join(AGENT_DIR, 'client.config.json'),
    DRY_RUN ? join(AGENT_DIR, 'fixtures', 'client.config.json') : null,
  ].filter(Boolean);
  for (const c of candidates) if (existsSync(c)) return { config: JSON.parse(readFileSync(c, 'utf8')), path: c };
  throw new Error(`no client.config.json found (looked in: ${candidates.join(', ')})`);
}

function readJson(p) { return JSON.parse(readFileSync(p, 'utf8')); }

// PURE: compose the generation brief for one (format x persona x insight) cell.
// Offline-testable layer for the creative-gen stage (mirrors the publish
// adapter's pure buildPayload). The live model call is the only unwired seam.
export function composeBrief(config, format, persona, insight) {
  const b = config.brand;
  // A format may bind its own persona/insight (folded-tag clients,
  // whose "car-detailer-bookwork" tag IS the persona+insight); else use the
  // axis passed by planBriefs.
  const personaKey = format.persona_key ?? persona?.key ?? null;
  const insightKey = format.insight_key ?? insight?.key ?? null;
  // A format may pin an EXACT prompt (snapshot-driven creative, e.g. fixed headline cards or
  // smb-snapshots headline cards); else compose one generatively from the brand.
  const prompt = format.fixed_prompt
    ? format.fixed_prompt
    : [
        `Mission: ${b.mission}`, `Tone: ${b.tone}`,
        b.audience ? `Audience: ${b.audience}` : '',
        persona?.descriptor ? `Persona: ${persona.descriptor}` : '',
        insight?.pain_point ? `Pain point: ${insight.pain_point}` : '',
        `Layout: ${format.tag}`,
        ...(format.rules || []).map((r) => `Rule: ${r}`),
        ...(b.generation_rules || []).map((r) => `Rule: ${r}`),
        b.confidential_name ? 'Never mention or render the brand name in copy or image.' : '',
      ].filter(Boolean).join('\n');
  return {
    format: format.tag,
    media_type: format.media_type || 'image',
    persona_key: personaKey,
    insight_key: insightKey,
    segment: format.segment ?? null,
    model: (format.media_type === 'video') ? config.creative.video_model : config.creative.image_model,
    snapshot: Boolean(format.fixed_prompt),
    prompt,
  };
}

// Resolve which campaign segment a creative publishes to. Multi-segment clients
// set meta_ads.segments[] and tag formats with `segment`; single-segment clients
// (no segments) always get the top-level default - byte-identical behavior.
export function resolveSegment(config, creative) {
  const dflt = {
    name: null,
    adsets: config.meta_ads.adsets,
    campaigns: config.meta_ads.campaigns,
    landing_page: config.client.landing_page,
  };
  const segs = config.meta_ads?.segments;
  if (!segs || !segs.length) return dflt;
  const seg = creative.segment ? segs.find((s) => s.name === creative.segment) : null;
  if (!seg) return dflt; // unassigned formats use the top-level default segment
  return { name: seg.name, adsets: seg.adsets, campaigns: seg.campaigns, landing_page: seg.landing_page || config.client.landing_page };
}

// PURE: the full brief batch a live run would render, capped by config volume.
// A format that binds its own persona_key/insight_key contributes ONE cell (not
// a Cartesian expansion), so a client whose tags already encode who+why produces
// exactly its curated list rather than an over-generated product.
export function planBriefs(config) {
  const { formats, personas, insights, statics_per_day, videos_per_day } = config.creative;
  const pick = (arr, key) => arr.find((x) => x.key === key) || { key };
  const all = [];
  for (const format of formats) {
    const ps = format.persona_key ? [pick(personas, format.persona_key)] : personas;
    const is = format.insight_key ? [pick(insights, format.insight_key)] : insights;
    for (const persona of ps) for (const insight of is) all.push(composeBrief(config, format, persona, insight));
  }
  const imgs = all.filter((b) => b.media_type === 'image').slice(0, statics_per_day);
  const vids = all.filter((b) => b.media_type === 'video').slice(0, videos_per_day);
  return [...imgs, ...vids];
}

// Stage 1-3: produce normalized creative objects (see docs/CONTRACTS.md section 1).
// DRY_RUN loads pre-rendered fixtures; real runs compose briefs (pure, above),
// render them via the configured model, then vision-QA - the render call is the
// one seam gated behind integration-confirm.
function generateCreatives(config) {
  if (DRY_RUN) {
    // Fixtures are media-agnostic; a client without a video adset (statics-only)
    // can't publish video, so drop video fixtures rather than fail buildPayload.
    const hasVideo = Boolean(config.meta_ads?.adsets?.video) && (config.creative?.videos_per_day ?? 0) > 0;
    const all = readJson(join(AGENT_DIR, 'fixtures', 'creatives.json'));
    return hasVideo ? all : all.filter((c) => c.media_type !== 'video');
  }
  const briefs = planBriefs(config); // pure, offline-verified
  throw new Error(
    `live creative generation is not wired: ${briefs.length} brief(s) composed for ${config.client.name}. ` +
    `Render each via ${config.creative.image_model}${config.creative.video_model ? '/' + config.creative.video_model : ''} ` +
    'through OPENROUTER_API_KEY, run vision QA, and emit the docs/CONTRACTS.md section-1 shape with status="paused". ' +
    'Verify offline first: DRY_RUN=1 node pipeline.mjs.',
  );
}

// Stage 5-6: render the real Meta payload for each creative and (real runs) publish PAUSED.
async function publishBatch(config, creatives, runDir) {
  const database = { creatives: [], last_updated: DRY_RUN ? 'dry-run' : new Date().toISOString() };
  const usingSegments = Boolean(config.meta_ads?.segments?.length);
  for (const creative0 of creatives) {
    // Resolve the creative's segment -> its adsets + landing page. Single-segment
    // clients (no segments) are untouched: pubConfig===config, creative0 unchanged.
    const seg = resolveSegment(config, creative0);
    const pubConfig = usingSegments ? { ...config, meta_ads: { ...config.meta_ads, adsets: seg.adsets } } : config;
    const creative = usingSegments ? { ...creative0, destination_link: seg.landing_page } : creative0;
    const payload = buildPayload(pubConfig, creative); // PURE; throws on bad link / missing poster
    let result;
    // THE code gate, evaluated BEFORE the DRY_RUN branch on purpose: an offline run
    // must model the same blocking a live run would do, or the dry run tells a
    // comforting lie ("15 creatives ready") about a batch nobody approved. Skipping
    // still costs zero network calls, so DRY_RUN stays a hard offline contract.
    if (creative.human_review?.status !== 'approved') {
      result = { id: null, url: null, status: 'skipped' }; // review gate: only approved creatives publish
    } else if (DRY_RUN) {
      result = { id: 'DRY', url: null, status: 'paused' }; // no network, no auth
    } else {
      result = await publishToMeta(pubConfig, creative);
    }
    const outDir = join(runDir, creative.creative_id);
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'publish.json'), JSON.stringify({
      creative_id: creative.creative_id,
      variation_name: creative.variation_name,
      status: result.status,
      result,
      payload,
    }, null, 2) + '\n');
    database.creatives.push({
      creative_id: creative.creative_id,
      variation_name: creative.variation_name,
      media_type: creative.media_type,
      format: creative.format,
      persona_key: creative.persona_key,
      insight_key: creative.insight_key,
      segment: seg.name,
      status: result.status === 'skipped' ? creative.status : (result.status === 'published' ? 'active' : 'paused'),
      // The publish VERDICT for this creative, kept distinct from the ad's lifecycle
      // `status` above (a skipped creative keeps its 'paused' lifecycle status, which
      // would otherwise make a fully-blocked batch indistinguishable from a shipped one).
      // 'skipped' = the human_review gate held it back. summarize() counts on this.
      publish_status: result.status,
      fb_ad_id: result.id === 'DRY' ? null : result.id,
      destination_link: creative.destination_link,
      // Dashboard preview (docs/CONTRACTS.md section 6): whichever asset a viewer
      // sees for this creative. video_data needs a poster; images use local_path.
      // Either may be a local filesystem path (not web-servable by dashboard/serve.mjs,
      // which only serves dashboard/) or a hosted URL from the render backend - the
      // dashboard renders an <img> only for http(s) URLs and falls back to a path label.
      thumbnail_url: (creative.media_type === 'video' ? creative.poster_path : creative.local_path) ?? null,
      // database.last_updated is 'dry-run' or an ISO timestamp; slice(0,10) yields
      // 'dry-run' unchanged (7 chars) or the YYYY-MM-DD date, no extra Date() call.
      published_at: database.last_updated.slice(0, 10),
    });
  }
  writeFileSync(join(runDir, 'database.json'), JSON.stringify(database, null, 2) + '\n');

  // CSV of every ad created (ports the reference publisher's CSV output).
  const cols = ['creative_id', 'variation_name', 'media_type', 'format', 'persona_key', 'insight_key', 'segment', 'status', 'publish_status', 'fb_ad_id', 'destination_link'];
  const csvCell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.join(','), ...database.creatives.map((c) => cols.map((k) => csvCell(c[k])).join(','))].join('\n') + '\n';
  writeFileSync(join(runDir, 'ads.csv'), csv);
  return database;
}

// Stage 7: kill/promote decisions over Meta insights.
function optimize(config, runDir) {
  const insightsPath = join(AGENT_DIR, 'fixtures', 'insights.json');
  if (DRY_RUN ? !existsSync(insightsPath) : true) {
    // real insights come from the warehouse; DRY reads the fixture. Skip if absent.
    if (!DRY_RUN) return null;
  }
  const insights = readJson(insightsPath);
  const { decisions, pauses, promotions } = planRun(insights, config);
  const audit = decisions.map((d) => JSON.stringify({ ...d, dry_run: DRY_RUN })).join('\n') + '\n';
  writeFileSync(join(runDir, 'optimization-audit.jsonl'), audit);
  // rows carry per-ad metrics for the dashboard; promotions = scale-into-winners
  // (budget scaling on the winners campaign is Meta CBO-managed, not mutated here).
  return { pauses: pauses.length, promotions: promotions.length, evaluated: decisions.length, rows: decisions };
}

// PURE: the publish arithmetic of one batch. A BLOCKED run is not a successful run:
// if every creative in a non-empty batch was held back by the human_review gate, the
// agent produced zero publishable ads and must say so (report.blocked + exit 2), not
// print 'done.' and exit 0. `total` keeps the dashboard's row count honest while
// creatives_created counts only what actually made it past the gate.
export function summarize(database) {
  const rows = database.creatives || [];
  const total = rows.length;
  const skipped = rows.filter((c) => c.publish_status === 'skipped').length;
  const published = total - skipped;
  return { total, published, skipped, blocked: total > 0 && published === 0 };
}

// Stage 7b: daily report. Written every run; delivered to Slack only when
// SLACK_WEBHOOK_URL is set and not DRY_RUN (offline never posts).
function writeReport(config, database, opt, runDir) {
  const counts = summarize(database);
  const created = counts.published; // creatives_created = what cleared the review gate
  const rows = opt?.rows || [];
  const top = rows.filter((r) => r.leads > 0).sort((a, b) => b.leads - a.leads)[0] || null;
  const totalSpend = rows.reduce((s, r) => s + (r.spend || 0), 0);
  const report = {
    date: DRY_RUN ? 'dry-run' : new Date().toISOString().slice(0, 10),
    client: config.client.name,
    creatives_created: created,
    // Machine-readable batch state (docs/CONTRACTS.md section 5). total = every row the
    // dashboard renders; published = cleared the review gate; skipped = held by it;
    // blocked = a non-empty batch where NOTHING cleared it (pipeline exits 2).
    total: counts.total,
    published: counts.published,
    skipped: counts.skipped,
    blocked: counts.blocked,
    all_paused: database.creatives.every((c) => c.status !== 'active'),
    optimizer: opt ? { pauses: opt.pauses, promotions: opt.promotions, evaluated: opt.evaluated } : null,
    total_spend: Number(totalSpend.toFixed(2)),
    top_creative: top ? { ad_name: top.ad_name, leads: top.leads, cpl: top.cpl } : null,
  };
  writeFileSync(join(runDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  const md = [
    `# ${report.client} - Meta Ads daily report (${report.date})`, '',
    report.blocked
      ? `- **BLOCKED: 0 of ${report.total} creative(s) published.** Every creative was held by the human_review gate (human_review.status != "approved"). Nothing was sent to Meta.`
      : '',
    `- Creatives created: ${created} of ${report.total} (${report.skipped} skipped at the review gate; all PAUSED: ${report.all_paused})`,
    opt ? `- Optimizer: ${opt.pauses} pause(s), ${opt.promotions} promotion(s)/scale-into-winners over ${opt.evaluated} ads` : '- Optimizer: no insights this run',
    `- Total spend (window): $${report.total_spend}`,
    top ? `- Top creative: ${top.ad_name} (${top.leads} leads, CPL $${top.cpl})` : '- Top creative: none converting yet',
    '', '_Budget scaling on the winners campaign is managed by Meta CBO (no manual budget mutation)._',
  ].join('\n') + '\n';
  writeFileSync(join(runDir, 'report.md'), md);
  return report;
}

// Gated Slack delivery seam. Never posts offline; needs SLACK_WEBHOOK_URL.
async function deliverReport(report, runDir) {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (DRY_RUN || !url) { console.log('[fb-ads] Slack delivery skipped (offline or SLACK_WEBHOOK_URL unset)'); return; }
  const text = readFileSync(join(runDir, 'report.md'), 'utf8');
  await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }) });
  console.log('[fb-ads] report posted to Slack');
}

// Fallback logo-badge initials when config.dashboard.brand.initials is unset
// (mirrors the google-ads-agent-factory report.ts helper of the same name).
function initialsOf(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

// Stage 8: embed dashboard data (see docs/CONTRACTS.md section 6).
function writeDashboardData(config, database, opt) {
  const dir = join(AGENT_DIR, 'dashboard');
  mkdirSync(dir, { recursive: true });
  const data = {
    title: config.dashboard?.title || `${config.client.name} - Meta Ads`,
    // Brand tokens (fleet dashboard standard): the static index.html applies these
    // as CSS variables. Absent config.dashboard.brand -> fleet-neutral navy/green.
    brand: {
      initials: config.dashboard?.brand?.initials || initialsOf(config.client.name),
      primary: config.dashboard?.brand?.primary || '#1a1a1a',
      accent: config.dashboard?.brand?.accent || '#4a4a4a',
    },
    generated: DRY_RUN ? 'dry-run' : new Date().toISOString(),
    // Non-secret; needed client-side to build Facebook Ads Manager deep links
    // (act= param). The access token stays in .env and is never in this file.
    adAccountId: config.meta_ads?.ad_account_id || null,
    rows: database.creatives,
    // per-ad insight metrics (docs/CONTRACTS.md section 6). In production these
    // join to rows by fb_ad_id -> creative_id via database.json; the embedded
    // data.json carries the metrics directly so the dashboard needs no live fetch.
    insights: (opt?.rows || []).map((r) => ({
      ad_name: r.ad_name, spend: r.spend, impressions: r.impressions,
      ctr: r.ctr, leads: r.leads, cpl: r.cpl, decision: r.decision, reason: r.reason,
    })),
    optimization: opt ? { pauses: opt.pauses, promotions: opt.promotions, evaluated: opt.evaluated } : null,
  };
  writeFileSync(join(dir, 'data.json'), JSON.stringify(data, null, 2) + '\n');
}

async function main() {
  loadDotEnv();
  const { config, path } = loadConfig();
  const runRoot = join(AGENT_DIR, DRY_RUN ? 'dry-run-output' : 'creatives');
  const date = DRY_RUN ? 'dry-run' : new Date().toISOString().slice(0, 10);
  const runDir = join(runRoot, date);
  if (DRY_RUN && existsSync(runRoot)) rmSync(runRoot, { recursive: true, force: true }); // fresh scratch each dry run
  mkdirSync(runDir, { recursive: true });

  console.log(`[fb-ads] ${DRY_RUN ? 'DRY_RUN' : 'LIVE'} run for ${config.client.name} (config: ${path})`);
  const creatives = generateCreatives(config);
  console.log(`[fb-ads] ${creatives.length} creatives`);
  const database = await publishBatch(config, creatives, runDir);
  const opt = optimize(config, runDir);
  writeDashboardData(config, database, opt);
  const report = writeReport(config, database, opt, runDir);
  await deliverReport(report, runDir);
  console.log(`[fb-ads] wrote ${database.creatives.length} publish payloads + ads.csv + report.md -> ${runDir}`);
  if (opt) console.log(`[fb-ads] optimizer: ${opt.pauses} pause(s), ${opt.promotions} promotion(s) over ${opt.evaluated} ads`);

  // A blocked run is NEVER a successful run. Every artifact is written first (so the
  // acceptance checks can grade the blocked state), then the process exits 2: distinct
  // from success (0) and from an error/crash (1), so a cron/pod can tell "nothing was
  // approved" apart from "the agent broke".
  const counts = summarize(database);
  if (counts.blocked) {
    console.error(
      `[fb-ads] FULLY BLOCKED: 0 of ${counts.total} creative(s) published.\n` +
      '[fb-ads] gate: review (human_review.status != "approved" on every creative in the batch).\n' +
      '[fb-ads] owner: the human reviewer. Approve creatives in the batch, then re-run.\n' +
      `[fb-ads] evidence: ${join(runDir, 'report.json')} -> {"blocked": true, "published": 0, "skipped": ${counts.skipped}}`,
    );
    process.exit(2);
  }
  console.log('[fb-ads] done.');
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  main().catch((e) => { console.error(`FAIL: ${e.message}`); process.exit(1); });
}

export { loadConfig, generateCreatives, publishBatch, optimize };
