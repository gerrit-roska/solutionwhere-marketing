import { getDb } from "../db";
import { fireAlert, postSlack } from "../marketing/alerts";
import { graphed } from "../marketing/graphed";
import { warehouseConfig, withSchemas, wq } from "../marketing/warehouse";
import {
  findCustomConversion,
  flipAdSetOptimization,
  getAdStatus,
  listAdSets,
  pauseAd,
} from "./client";
import { fbReady, loadFbConfig } from "./config";

// fb-manage-daily (04 §7, 07 §4.10) — the daily pruning loop for the Meta
// Andromeda account. Reads ad performance from the warehouse (fb_ads_*),
// joins ad names back to fb_creatives for persona/angle, and applies the
// spec's kill / scale / rotate / flip rules.
//
// Philosophy mirrors ads/guardrails.ts: read-only reporting by default,
// every mutation behind an explicit --apply (the job entrypoint gates on the
// argv flag — never env, never the manifest). Alerts and the Slack summary
// fire in both modes; Slack fails closed to stdout.
//
// The account-wide 30% daily budget-increase cap (04 §7) is enforced in
// code in planScales() — the failure mode it prevents is 10x-ing a creative
// that looked good for two hours.

// 04 §7 thresholds.
export const TARGET_CPL = 150; // $ per Lead — launch target
export const TARGET_CPQD = 500; // $ per qualified_demo — the number that matters
export const MAX_DAILY_INCREASE_PCT = 30; // account-wide, per day
export const SCALE_PCT = 20; // kept for the cap math; the daily job does not apply it
export const KILL_SPEND_NO_LEAD_USD = 2 * TARGET_CPL; // 7d, 0 leads
export const KILL_NO_QUALIFIED_SPEND_USD = 3 * TARGET_CPQD; // 30d, >=3 leads, 0 qualified
export const KILL_NO_QUALIFIED_MIN_LEADS = 3;
export const ROTATE_FREQUENCY_7D = 3.0;
export const ROTATE_CTR_DROP_PCT = 40; // vs the ad's own week-1 CTR
export const FLIP_QUALIFIED_30D = 25; // per ad set
export const TOKEN_EXPIRY_DAYS = 60; // 04 §1 item 6
export const TOKEN_ALERT_DAYS = 50;
// A persona x angle cell needs this much 30d spend before the brief ranks
// it — below that the "winner" is noise.
const BRIEF_MIN_SPEND_USD = 50;

const num = (v: unknown): number => Number(v ?? 0);

// Same transient as guardrails.ts: a connected-but-backfilling source fails
// with ClickHouse's table-missing error. That is "unavailable", not a run
// failure; genuine query errors land in report.errors and exit non-zero.
const TABLE_MISSING =
  /Unknown table expression identifier|does not exist|doesn't exist/i;

// ---------------------------------------------------------------------------
// Warehouse pulls — each independent, each degrades to "unavailable".
// ---------------------------------------------------------------------------

// Type aliases (not interfaces) so they satisfy wq's Record<string, unknown>
// constraint — interfaces get no implicit index signature.
type AdPerfRow = {
  ad_id: number | string;
  adset_id: number | string | null;
  ad_name: string | null;
  spend: number | string | null;
  impressions: number | string | null;
  clicks: number | string | null;
  leads: number | string | null;
};

/** 07 §4.10's core query, 7-day window, plus impressions/clicks for CTR. */
async function pullPerf7(): Promise<Map<string, AdPerfRow>> {
  const rows = await wq<AdPerfRow>(
    withSchemas(`
      SELECT a.ad_id, a.adset_id, a.ad_name,
             sum(a.spend) AS spend, sum(a.impressions) AS impressions,
             sum(a.clicks) AS clicks,
             sumIf(x.value, x.action_type = 'lead') AS leads
      FROM {metaAds}.basic_ad a
      LEFT JOIN {metaAds}.basic_ad_actions x ON x.ad_id = a.ad_id AND x.date = a.date
      WHERE a.date >= today() - 7
      GROUP BY a.ad_id, a.adset_id, a.ad_name
    `),
  );
  return new Map(rows.map((r) => [String(r.ad_id), r]));
}

type AdPerf30Row = {
  ad_id: number | string;
  spend: number | string | null;
  leads: number | string | null;
  qualified: number | string | null;
};

/** 30-day window for the qualified_demo kill rule (04 §7 row 2). The custom
 *  event action_type string is per 07 §4.10 — confirm in Events Manager on
 *  the first live run. */
async function pullPerf30(): Promise<Map<string, AdPerf30Row>> {
  const rows = await wq<AdPerf30Row>(
    withSchemas(`
      SELECT a.ad_id,
             sum(a.spend) AS spend,
             sumIf(x.value, x.action_type = 'lead') AS leads,
             sumIf(x.value, x.action_type = 'offsite_conversion.custom.qualified_demo') AS qualified
      FROM {metaAds}.basic_ad a
      LEFT JOIN {metaAds}.basic_ad_actions x ON x.ad_id = a.ad_id AND x.date = a.date
      WHERE a.date >= today() - 30
      GROUP BY a.ad_id
    `),
  );
  return new Map(rows.map((r) => [String(r.ad_id), r]));
}

async function pullFrequency7(): Promise<Map<string, number>> {
  const rows = await wq<{ ad_id: number | string; freq: number | string | null }>(
    withSchemas(`
      SELECT ad_id, avg(frequency) AS freq
      FROM {metaAds}.basic_ad
      WHERE date >= today() - 7
      GROUP BY ad_id
    `),
  );
  return new Map(rows.map((r) => [String(r.ad_id), num(r.freq)]));
}

/** Per-ad daily delivery for the CTR-vs-week-1 rotate signal. */
async function pullDaily60(): Promise<
  Map<string, { date: string; impressions: number; clicks: number }[]>
> {
  const rows = await wq<{
    ad_id: number | string;
    date: string;
    impressions: number | string | null;
    clicks: number | string | null;
  }>(
    withSchemas(`
      SELECT ad_id, date, sum(impressions) AS impressions, sum(clicks) AS clicks
      FROM {metaAds}.basic_ad
      WHERE date >= today() - 60
      GROUP BY ad_id, date
      ORDER BY ad_id, date
    `),
  );
  const byAd = new Map<string, { date: string; impressions: number; clicks: number }[]>();
  for (const r of rows) {
    const key = String(r.ad_id);
    const list = byAd.get(key) ?? [];
    list.push({ date: String(r.date), impressions: num(r.impressions), clicks: num(r.clicks) });
    byAd.set(key, list);
  }
  return byAd;
}

/** Flip rule input: qualified_demo per ad set, trailing 30 days. */
async function pullQualifiedByAdSet30(): Promise<Map<string, number>> {
  const rows = await wq<{
    adset_id: number | string | null;
    qualified: number | string | null;
  }>(
    withSchemas(`
      SELECT a.adset_id,
             sumIf(x.value, x.action_type = 'offsite_conversion.custom.qualified_demo') AS qualified
      FROM {metaAds}.basic_ad a
      LEFT JOIN {metaAds}.basic_ad_actions x ON x.ad_id = a.ad_id AND x.date = a.date
      WHERE a.date >= today() - 30
      GROUP BY a.adset_id
    `),
  );
  const out = new Map<string, number>();
  for (const r of rows) {
    if (r.adset_id != null) out.set(String(r.adset_id), num(r.qualified));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

interface AdEvaluation {
  adId: string;
  adsetId: string | null;
  adName: string;
  creativeId: string | null;
  persona: string | null;
  angle: string | null;
  spend7: number;
  leads7: number;
  impressions7: number;
  clicks7: number;
  spend30: number;
  leads30: number;
  qualified30: number;
  freq7: number | null;
  ctr7: number | null;
  ctrWeek1: number | null;
}

export type ProposedAction =
  | { kind: "kill"; ad: AdEvaluation; reason: string }
  | { kind: "scale"; adsetId: string; cpl7: number; leads7: number; ads: string[] }
  | { kind: "rotate"; ad: AdEvaluation; reason: string }
  | { kind: "flip"; adsetId: string; qualified30: number };

function week1Ctr(days: { impressions: number; clicks: number }[]): number | null {
  const active = days.filter((d) => d.impressions > 0).slice(0, 7);
  const impressions = active.reduce((n, d) => n + d.impressions, 0);
  if (impressions < 100) return null; // too little delivery to call a baseline
  return active.reduce((n, d) => n + d.clicks, 0) / impressions;
}

function evaluate(
  perf7: Map<string, AdPerfRow>,
  perf30: Map<string, AdPerf30Row>,
  freq7: Map<string, number> | null,
  daily60: Map<string, { date: string; impressions: number; clicks: number }[]> | null,
  creativesById: Map<string, { persona: string; angle: string }>,
): AdEvaluation[] {
  const out: AdEvaluation[] = [];
  for (const [adId, row] of perf7) {
    // Only ads that delivered are managed — paused drafts never accrue
    // impressions, so they fall out here naturally.
    if (num(row.impressions) === 0 && num(row.spend) === 0) continue;
    const adName = row.ad_name ?? "";
    const creativeId = adName.split(" | ")[0] || null;
    const creative = creativeId ? creativesById.get(creativeId) : undefined;
    const thirty = perf30.get(adId);
    const impressions7 = num(row.impressions);
    const clicks7 = num(row.clicks);
    out.push({
      adId,
      adsetId: row.adset_id != null ? String(row.adset_id) : null,
      adName,
      creativeId,
      persona: creative?.persona ?? null,
      angle: creative?.angle ?? null,
      spend7: num(row.spend),
      leads7: num(row.leads),
      impressions7,
      clicks7,
      spend30: num(thirty?.spend),
      leads30: num(thirty?.leads),
      qualified30: num(thirty?.qualified),
      freq7: freq7?.get(adId) ?? null,
      ctr7: impressions7 > 0 ? clicks7 / impressions7 : null,
      ctrWeek1: daily60 ? week1Ctr(daily60.get(adId) ?? []) : null,
    });
  }
  return out;
}

function proposeActions(ads: AdEvaluation[], qualifiedByAdSet: Map<string, number> | null): ProposedAction[] {
  const actions: ProposedAction[] = [];
  const killed = new Set<string>();

  for (const ad of ads) {
    // 04 §7 kill rules.
    if (ad.spend7 > KILL_SPEND_NO_LEAD_USD && ad.leads7 === 0) {
      actions.push({
        kind: "kill",
        ad,
        reason: `spend $${ad.spend7.toFixed(2)} > 2x TARGET_CPL ($${KILL_SPEND_NO_LEAD_USD}) with 0 leads in 7d`,
      });
      killed.add(ad.adId);
      continue;
    }
    if (
      ad.leads30 >= KILL_NO_QUALIFIED_MIN_LEADS &&
      ad.qualified30 === 0 &&
      ad.spend30 > KILL_NO_QUALIFIED_SPEND_USD
    ) {
      actions.push({
        kind: "kill",
        ad,
        reason:
          `${ad.leads30} leads and 0 qualified_demo in 30d at $${ad.spend30.toFixed(2)} ` +
          `(> 3x TARGET_CPQD $${KILL_NO_QUALIFIED_SPEND_USD}) — finds form-fillers, not buyers`,
      });
      killed.add(ad.adId);
      continue;
    }

    // Rotate is a flag for the next factory batch, not a mutation.
    const rotateReasons: string[] = [];
    if (ad.freq7 !== null && ad.freq7 > ROTATE_FREQUENCY_7D) {
      rotateReasons.push(`frequency ${ad.freq7.toFixed(2)} > ${ROTATE_FREQUENCY_7D}/7d`);
    }
    if (
      ad.ctr7 !== null &&
      ad.ctrWeek1 !== null &&
      ad.ctr7 < ad.ctrWeek1 * (1 - ROTATE_CTR_DROP_PCT / 100)
    ) {
      rotateReasons.push(
        `CTR down ${Math.round((1 - ad.ctr7 / ad.ctrWeek1) * 100)}% from week-1`,
      );
    }
    if (rotateReasons.length > 0) {
      actions.push({ kind: "rotate", ad, reason: rotateReasons.join("; ") });
    }
  }

  // Scale: CPL <= target over 7d with >= 3 leads -> ad-set budget +20%.
  // Grouped per ad set; the 30% account cap is applied in planScales().
  const byAdSet = new Map<string, AdEvaluation[]>();
  for (const ad of ads) {
    if (killed.has(ad.adId) || !ad.adsetId) continue;
    if (ad.leads7 >= 3 && ad.spend7 / ad.leads7 <= TARGET_CPL) {
      const list = byAdSet.get(ad.adsetId) ?? [];
      list.push(ad);
      byAdSet.set(ad.adsetId, list);
    }
  }
  for (const [adsetId, winners] of byAdSet) {
    const spend = winners.reduce((n, a) => n + a.spend7, 0);
    const leads = winners.reduce((n, a) => n + a.leads7, 0);
    actions.push({
      kind: "scale",
      adsetId,
      cpl7: leads > 0 ? spend / leads : 0,
      leads7: leads,
      ads: winners.map((a) => a.adId),
    });
  }

  // Flip: qualified_demo >= 25 in 30d on an ad set -> optimize for it.
  if (qualifiedByAdSet) {
    for (const [adsetId, qualified] of qualifiedByAdSet) {
      if (qualified >= FLIP_QUALIFIED_30D) {
        actions.push({ kind: "flip", adsetId, qualified30: qualified });
      }
    }
  }

  return actions;
}

// ---------------------------------------------------------------------------
// The 30% account-wide daily budget-increase cap (04 §7). Pure function —
// the acceptance test ("manage run never increases total daily budget >
// 30%") exercises this directly.
// ---------------------------------------------------------------------------

export interface ScalePlan {
  adsetId: string;
  currentBudgetUsd: number;
  newBudgetUsd: number;
  increaseUsd: number;
  cpl7: number;
  leads7: number;
  deferred: boolean;
  deferReason: string | null;
}

export function planScales(
  scales: (ProposedAction & { kind: "scale" })[],
  currentBudgetsUsd: Map<string, number>,
): ScalePlan[] {
  const totalBudget = [...currentBudgetsUsd.values()].reduce((n, b) => n + b, 0);
  const allowedIncrease = (MAX_DAILY_INCREASE_PCT / 100) * totalBudget;
  // Best CPL first; the cap is account-wide, so ordering decides who gets it.
  const sorted = [...scales].sort((a, b) => a.cpl7 - b.cpl7);
  let used = 0;
  return sorted.map((scale) => {
    const current = currentBudgetsUsd.get(scale.adsetId);
    if (current === undefined || current <= 0) {
      return {
        adsetId: scale.adsetId,
        currentBudgetUsd: current ?? 0,
        newBudgetUsd: current ?? 0,
        increaseUsd: 0,
        cpl7: scale.cpl7,
        leads7: scale.leads7,
        deferred: true,
        deferReason: "no current daily budget known for this ad set",
      };
    }
    const increase = current * (SCALE_PCT / 100);
    if (used + increase > allowedIncrease) {
      return {
        adsetId: scale.adsetId,
        currentBudgetUsd: current,
        newBudgetUsd: current,
        increaseUsd: 0,
        cpl7: scale.cpl7,
        leads7: scale.leads7,
        deferred: true,
        deferReason: `30% account-wide daily increase cap ($${allowedIncrease.toFixed(2)} of $${totalBudget.toFixed(2)}) exhausted`,
      };
    }
    used += increase;
    return {
      adsetId: scale.adsetId,
      currentBudgetUsd: current,
      newBudgetUsd: Math.round((current + increase) * 100) / 100,
      increaseUsd: increase,
      cpl7: scale.cpl7,
      leads7: scale.leads7,
      deferred: false,
      deferReason: null,
    };
  });
}

// ---------------------------------------------------------------------------
// Brief: next week's matrix.json weights (04 §7). Applied to disk only with
// --apply — and note the file write is only durable locally; in cloud the
// fb_actions 'brief' row is the record and a human commits the weights.
// ---------------------------------------------------------------------------

export function briefWeights(
  cells: { key: string; spend30: number; leads30: number; qualified30: number }[],
): Map<string, number> {
  const ranked = cells
    .filter((c) => c.spend30 >= BRIEF_MIN_SPEND_USD)
    .map((c) => ({
      key: c.key,
      // Judge on CPQD once any cell has qualified volume, else CPL (04 §0:
      // judged on cost per qualified demo, never cost per lead).
      metric:
        c.qualified30 > 0
          ? c.spend30 / c.qualified30
          : c.leads30 > 0
            ? c.spend30 / c.leads30
            : Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.metric - b.metric);

  const weights = new Map<string, number>();
  const bottomStart = ranked.length - Math.floor(ranked.length / 4);
  ranked.forEach((cell, index) => {
    if (index < 2) weights.set(cell.key, 2); // double the winners
    else if (index >= bottomStart) weights.set(cell.key, 0); // drop the bottom quartile
  });
  return weights;
}

// ---------------------------------------------------------------------------
// Report + run
// ---------------------------------------------------------------------------

export interface ManageReport {
  mode: "no-credentials" | "read-only" | "apply";
  warehouse: "ok" | "not-configured" | "unavailable";
  tokenDaysRemaining: number | null;
  adsEvaluated: number;
  spend7d: number;
  leads7d: number;
  qualified30d: number;
  blendedCpl: number | null;
  blendedCpqd: number | null;
  topPersonas: { persona: string; cpl: number }[];
  topAngles: { angle: string; cpl: number }[];
  actions: {
    kind: string;
    subject: string;
    reason: string;
    applied: boolean;
    detail?: Record<string, unknown>;
  }[];
  brief: { weights: Record<string, number>; appliedToMatrix: boolean } | null;
  unavailable: string[];
  alertsFired: number;
  errors: string[];
}

const runDate = (): string => new Date().toISOString().slice(0, 10);

/** Days since the system-user token was issued (config), for the day-50
 *  alert (04 §1 item 6: tokens expire ~60 days). */
function tokenDaysRemaining(config: { tokenIssuedAt: string }): number {
  const issued = Date.parse(`${config.tokenIssuedAt}T00:00:00Z`);
  const ageDays = Math.floor((Date.now() - issued) / 86_400_000);
  return TOKEN_EXPIRY_DAYS - ageDays;
}

export async function runFbManageDaily(
  options: { apply?: boolean } = {},
): Promise<ManageReport> {
  const apply = options.apply === true;
  const config = loadFbConfig();
  const db = getDb();
  const report: ManageReport = {
    mode: apply ? "apply" : "read-only",
    warehouse: "ok",
    tokenDaysRemaining: null,
    adsEvaluated: 0,
    spend7d: 0,
    leads7d: 0,
    qualified30d: 0,
    blendedCpl: null,
    blendedCpqd: null,
    topPersonas: [],
    topAngles: [],
    actions: [],
    brief: null,
    unavailable: [],
    alertsFired: 0,
    errors: [],
  };

  // Token age — needs no credentials, runs in every mode.
  const daysLeft = tokenDaysRemaining(config);
  report.tokenDaysRemaining = daysLeft;
  if (daysLeft <= TOKEN_EXPIRY_DAYS - TOKEN_ALERT_DAYS) {
    await fireAlert("fb-token-expiry", "warn", "FB_ACCESS_TOKEN", {
      token_issued_at: config.tokenIssuedAt,
      days_remaining: daysLeft,
      spec: "04 §1 item 6 — Meta tokens expire ~60 days; rotate before expiry",
    });
    report.alertsFired += 1;
  }

  const slackSummary = async (): Promise<void> => {
    await postSlack(
      [
        `fb-manage-daily ${runDate()} (${report.mode})`,
        `Spend 7d: $${report.spend7d.toFixed(2)} | leads 7d: ${report.leads7d} | ` +
          `CPL: ${report.blendedCpl === null ? "—" : `$${report.blendedCpl.toFixed(2)}`} | ` +
          `CPQD 30d: ${report.blendedCpqd === null ? "—" : `$${report.blendedCpqd.toFixed(2)}`}`,
        `Killed: ${report.actions.filter((a) => a.kind === "kill").length} | ` +
          `scaled: ${report.actions.filter((a) => a.kind === "scale" && !a.detail?.deferred).length} | ` +
          `rotate flags: ${report.actions.filter((a) => a.kind === "rotate").length} | ` +
          `flip: ${report.actions.some((a) => a.kind === "flip") ? "threshold met" : "no"}`,
        `Top personas: ${report.topPersonas.map((p) => `${p.persona} ($${p.cpl.toFixed(0)})`).join(", ") || "—"} | ` +
          `top angles: ${report.topAngles.map((a) => `${a.angle} ($${a.cpl.toFixed(0)})`).join(", ") || "—"}`,
        `Token: ${daysLeft}d remaining | warehouse: ${report.warehouse}`,
      ].join("\n"),
    );
  };

  if (!graphed.isConfigured() || !warehouseConfig().metaAds) {
    report.warehouse = "not-configured";
    console.log("Warehouse/Meta source not configured — token check only.");
    await slackSummary();
    return report;
  }

  // Independent pulls; a backfilling source degrades that signal to
  // "unavailable" without failing the run (guardrails.ts pattern).
  let perf7: Map<string, AdPerfRow> | null = null;
  let perf30: Map<string, AdPerf30Row> | null = null;
  let freq7: Map<string, number> | null = null;
  let daily60: Map<string, { date: string; impressions: number; clicks: number }[]> | null = null;
  let qualifiedByAdSet: Map<string, number> | null = null;

  const pulls: [string, () => Promise<void>][] = [
    ["perf7", async () => { perf7 = await pullPerf7(); }],
    ["perf30", async () => { perf30 = await pullPerf30(); }],
    ["frequency7", async () => { freq7 = await pullFrequency7(); }],
    ["daily60", async () => { daily60 = await pullDaily60(); }],
    ["qualifiedByAdSet30", async () => { qualifiedByAdSet = await pullQualifiedByAdSet30(); }],
  ];
  for (const [name, pull] of pulls) {
    try {
      await pull();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (TABLE_MISSING.test(message)) {
        report.unavailable.push(name);
        console.warn(`${name}: source table not available yet — ${message}`);
      } else {
        report.errors.push(`${name}: ${message}`);
      }
    }
  }

  if (!perf7 || !perf30) {
    // Without the core performance pull there is nothing to evaluate.
    report.warehouse = "unavailable";
    await slackSummary();
    return report;
  }

  const creativeRows = await db
    .selectFrom("fb_creatives")
    .select(["creative_id", "persona", "angle"])
    .execute();
  const creativesById = new Map(creativeRows.map((r) => [r.creative_id, r]));

  const ads = evaluate(perf7, perf30, freq7, daily60, creativesById);
  report.adsEvaluated = ads.length;
  report.spend7d = ads.reduce((n, a) => n + a.spend7, 0);
  report.leads7d = ads.reduce((n, a) => n + a.leads7, 0);
  report.qualified30d = ads.reduce((n, a) => n + a.qualified30, 0);
  report.blendedCpl = report.leads7d > 0 ? report.spend7d / report.leads7d : null;
  const spend30 = ads.reduce((n, a) => n + a.spend30, 0);
  report.blendedCpqd = report.qualified30d > 0 ? spend30 / report.qualified30d : null;

  // Aggregates: CPL by persona and by angle, top 2 of each (04 §7).
  const aggregate = (key: (a: AdEvaluation) => string | null) => {
    const groups = new Map<string, { spend: number; leads: number }>();
    for (const ad of ads) {
      const k = key(ad);
      if (!k) continue;
      const g = groups.get(k) ?? { spend: 0, leads: 0 };
      g.spend += ad.spend7;
      g.leads += ad.leads7;
      groups.set(k, g);
    }
    return [...groups.entries()]
      .filter(([, g]) => g.leads > 0)
      .map(([name, g]) => ({ name, cpl: g.spend / g.leads }))
      .sort((a, b) => a.cpl - b.cpl)
      .slice(0, 2);
  };
  report.topPersonas = aggregate((a) => a.persona).map((p) => ({ persona: p.name, cpl: p.cpl }));
  report.topAngles = aggregate((a) => a.angle).map((a) => ({ angle: a.name, cpl: a.cpl }));

  const proposed = proposeActions(ads, qualifiedByAdSet);

  // Current budgets for the scale plan: live from the API when we can
  // mutate, otherwise the warehouse's latest ad_set_history is best-effort
  // (units are Meta minor units = cents).
  const currentBudgets = new Map<string, number>();
  const scaleProposals = proposed.filter((p): p is ProposedAction & { kind: "scale" } => p.kind === "scale");
  if (scaleProposals.length > 0) {
    if (fbReady()) {
      try {
        for (const adSet of await listAdSets()) {
          if (adSet.dailyBudgetUsd !== null) currentBudgets.set(adSet.id, adSet.dailyBudgetUsd);
        }
      } catch (error) {
        report.errors.push(`budgets(api): ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      try {
        const rows = await wq<{ id: number | string; daily_budget: number | string | null }>(
          withSchemas(`
            SELECT id, daily_budget FROM (
              SELECT id, daily_budget, updated_time
              FROM {metaAds}.ad_set_history
              ORDER BY updated_time DESC LIMIT 1 BY id
            )
          `),
        );
        for (const r of rows) currentBudgets.set(String(r.id), num(r.daily_budget) / 100);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (TABLE_MISSING.test(message)) report.unavailable.push("adSetBudgets");
        else report.errors.push(`budgets(warehouse): ${message}`);
      }
    }
  }
  const scalePlans = planScales(scaleProposals, currentBudgets);

  // --- record + (maybe) apply ------------------------------------------------

  const killAds = proposed.filter((p): p is ProposedAction & { kind: "kill" } => p.kind === "kill");
  if (killAds.length > 0) {
    await fireAlert("fb-kill-candidates", "info", `${killAds.length} ad(s) hit a kill rule`, {
      ads: killAds.map((k) => ({ ad_id: k.ad.adId, name: k.ad.adName, reason: k.reason })),
      spec: "04 §7 — kill thresholds",
      mode: report.mode,
    });
    report.alertsFired += 1;
  }

  for (const kill of killAds) {
    const subject = `ad ${kill.ad.adId} ${kill.ad.adName}`.trim();
    let applied = false;
    if (apply) {
      try {
        const status = await getAdStatus(kill.ad.adId);
        if (status === "ACTIVE") {
          await pauseAd(kill.ad.adId);
          applied = true;
          await db.insertInto("fb_actions").values({
            run_date: runDate(),
            ad_id: kill.ad.adId,
            creative_id: kill.ad.creativeId,
            action: "kill",
            reason: kill.reason,
            before: JSON.stringify({ status, spend7: kill.ad.spend7, leads7: kill.ad.leads7, spend30: kill.ad.spend30, qualified30: kill.ad.qualified30 }),
            after: JSON.stringify({ status: "PAUSED" }),
          }).execute();
          if (kill.ad.creativeId) {
            await db.updateTable("fb_creatives")
              .set({ status: "killed" })
              .where("creative_id", "=", kill.ad.creativeId)
              .execute();
          }
        }
      } catch (error) {
        report.errors.push(`kill ${kill.ad.adId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    report.actions.push({ kind: "kill", subject, reason: kill.reason, applied });
  }

  for (const plan of scalePlans) {
    const subject = `ad set ${plan.adsetId}`;
    // One $50/day campaign budget. A winning ad set is recorded for next
    // week's weights and is not given its own raise.
    const reason = `CPL $${plan.cpl7.toFixed(2)} <= $${TARGET_CPL} with ${plan.leads7} leads/7d — noted, campaign budget stays $${config.campaign.dailyBudgetUsd}/day`;
    report.actions.push({
      kind: "scale",
      subject,
      reason,
      applied: false,
      detail: {
        current_budget_usd: plan.currentBudgetUsd,
        new_budget_usd: plan.currentBudgetUsd,
        deferred: true,
        defer_reason: "campaign budget is fixed",
      },
    });
  }

  // Rotate flags are the deliverable, not a mutation — they are written in
  // both modes, deduped per ad per week so a fatiguing ad isn't re-flagged
  // every day.
  const rotateAds = proposed.filter((p): p is ProposedAction & { kind: "rotate" } => p.kind === "rotate");
  for (const rotate of rotateAds) {
    const subject = `ad ${rotate.ad.adId} ${rotate.ad.adName}`.trim();
    const recent = await db
      .selectFrom("fb_actions")
      .select("id")
      .where("action", "=", "rotate")
      .where("ad_id", "=", rotate.ad.adId)
      .where("run_date", ">=", new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10))
      .executeTakeFirst();
    if (!recent) {
      await db.insertInto("fb_actions").values({
        run_date: runDate(),
        ad_id: rotate.ad.adId,
        creative_id: rotate.ad.creativeId,
        action: "rotate",
        reason: rotate.reason,
        before: JSON.stringify({ freq7: rotate.ad.freq7, ctr7: rotate.ad.ctr7, ctr_week1: rotate.ad.ctrWeek1 }),
        after: JSON.stringify({ flag: "replace in next factory batch" }),
      }).execute();
    }
    report.actions.push({ kind: "rotate", subject, reason: rotate.reason, applied: !recent });
  }

  const flips = proposed.filter((p): p is ProposedAction & { kind: "flip" } => p.kind === "flip");
  for (const flip of flips) {
    const subject = `ad set ${flip.adsetId}`;
    await fireAlert("fb-flip-threshold", "info", subject, {
      qualified_30d: flip.qualified30,
      threshold: FLIP_QUALIFIED_30D,
      spec: "04 §7 — flip optimization to qualified_demo at >= 25 events/30d",
      mode: report.mode,
    });
    report.alertsFired += 1;
    let applied = false;
    if (apply) {
      try {
        const conversionId = await findCustomConversion(config.campaign.flipToCustomConversion);
        if (!conversionId) {
          report.errors.push(
            `flip ${flip.adsetId}: custom conversion '${config.campaign.flipToCustomConversion}' not found on the account`,
          );
        } else {
          await flipAdSetOptimization(flip.adsetId, conversionId);
          applied = true;
          await db.insertInto("fb_actions").values({
            run_date: runDate(),
            ad_id: null,
            creative_id: null,
            action: "flip",
            reason: `qualified_demo ${flip.qualified30} >= ${FLIP_QUALIFIED_30D} in 30d`,
            before: JSON.stringify({ adset_id: flip.adsetId, optimization: config.campaign.optimizationEvent }),
            after: JSON.stringify({ adset_id: flip.adsetId, optimization: config.campaign.flipToCustomConversion, custom_conversion_id: conversionId }),
          }).execute();
        }
      } catch (error) {
        report.errors.push(`flip ${flip.adsetId}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    report.actions.push({
      kind: "flip",
      subject,
      reason: `qualified_demo ${flip.qualified30} >= ${FLIP_QUALIFIED_30D} in 30d`,
      applied,
    });
  }

  // Brief: persona x angle cells from 30d numbers; weights proposed always,
  // written to matrix.json only with --apply (read-only default).
  const cells = new Map<string, { spend30: number; leads30: number; qualified30: number }>();
  for (const ad of ads) {
    if (!ad.persona || !ad.angle) continue;
    const key = `${ad.persona}-${ad.angle}`;
    const cell = cells.get(key) ?? { spend30: 0, leads30: 0, qualified30: 0 };
    cell.spend30 += ad.spend30;
    cell.leads30 += ad.leads30;
    cell.qualified30 += ad.qualified30;
    cells.set(key, cell);
  }
  const weights = briefWeights([...cells.entries()].map(([key, c]) => ({ key, ...c })));
  if (weights.size > 0) {
    report.brief = { weights: Object.fromEntries(weights), appliedToMatrix: false };
    if (apply) {
      try {
        const { readFileSync, writeFileSync } = await import("node:fs");
        const { resolve } = await import("node:path");
        const { projectRoot } = await import("../config");
        const matrixPath = resolve(projectRoot(), "clients/solutionwhere/creative/matrix.json");
        const matrix = JSON.parse(readFileSync(matrixPath, "utf-8")) as {
          rows: { creative_id: string }[];
        };
        const before: Record<string, number> = {};
        for (const row of matrix.rows) {
          const cellKey = row.creative_id.replace(/-v\d+$/, ""); // P2-A3-v1 -> P2-A3
          const weight = weights.get(cellKey);
          if (weight === undefined) continue;
          before[cellKey] = (row as { weight?: number }).weight ?? 1;
          (row as { weight?: number }).weight = weight;
        }
        writeFileSync(matrixPath, `${JSON.stringify(matrix, null, 2)}\n`);
        report.brief.appliedToMatrix = true;
        await db.insertInto("fb_actions").values({
          run_date: runDate(),
          ad_id: null,
          creative_id: null,
          action: "brief",
          reason: "next factory batch weights: double the winning persona x angle cells, drop the bottom quartile (04 §7)",
          before: JSON.stringify(before),
          after: JSON.stringify(Object.fromEntries(weights)),
        }).execute();
      } catch (error) {
        report.errors.push(`brief: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  await slackSummary();
  return report;
}
