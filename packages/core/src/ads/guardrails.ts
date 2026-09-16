// Daily ads watchdog (07 §4.8) for the failure modes specced in
// 03-google-ads-execution.md and 04-meta-ads-execution.md.
//
// Shape:
//   - Every check is a warehouse (ClickHouse) query from 07 §4.8 against
//     verified column names, run through wq()/withSchemas(). History tables
//     are reduced to latest-per-entity in an inner query BEFORE the condition
//     is applied — the spec's `HAVING ... LIMIT 1 BY` order would keep
//     flagging drift that was already fixed.
//   - Checks are independent: a failing or alerting check never stops the
//     others (07 §4.8 acceptance). Errors are collected in the report.
//   - Each firing check writes one guardrail_alerts row per (check, subject)
//     and posts to Slack via marketing/alerts (fails closed to stdout when
//     SLACK_WEBHOOK_URL is unset). Subjects that stop firing get resolved_at
//     on the next run; checks that errored reconcile nothing.
//   - Wasted search terms (03 §4.7) are mined into proposed negatives on a
//     dedicated shared list, "NEG - Auto Guardrails", attached to every
//     non-REMOVED campaign. Mutations mirror bootstrap.ts: one atomic
//     mutate, validate-only by default, writes only with apply=true (the
//     job entrypoint gates that on an explicit `--apply` argv flag — never
//     env, never the manifest).
//   - The 03 §9 kill criteria (keyword > $400 / 0 conv / 30d, ad group 0
//     conv after 100 clicks, CPQD > $1,500) are ALERT-ONLY here: offline
//     conversion import lags weeks (03 §5.2), so a "0 conversions" row can
//     be wrong and pausing is a human call. This job never mutates budgets
//     (03 has no account-wide budget-increase cap — the 30% cap is Meta's
//     fb-manage-daily, 07 §4.10).

import { sql } from "kysely";
import { getDb } from "../db";
import { fireAlert, postSlack, type Severity } from "../marketing/alerts";
import { graphed } from "../marketing/graphed";
import { warehouseConfig, withSchemas, wq } from "../marketing/warehouse";
import { customerId, mutate, normalize, rn, search } from "./client";
import { googleAdsReady } from "./config";
import { NEGATIVE_LISTS } from "./plan";

// ---------------------------------------------------------------------------
// Check framework
// ---------------------------------------------------------------------------

export interface GuardrailFinding {
  subject: string;
  detail: Record<string, unknown>;
}

interface CheckDef {
  name: string;
  severity: Severity;
  /** Spec section that explains why the check matters — surfaced in Slack. */
  spec: string;
  /** Weekly checks run only on Mondays (America/New_York). */
  weekly?: boolean;
  run: () => Promise<GuardrailFinding[]>;
}

export interface ProposedNegative {
  term: string;
  campaignId: string;
  costUsd: number;
  clicks: number;
}

export interface GuardrailsReport {
  warehouse: "ok" | "not-configured";
  mutations: "no-credentials" | "validate-only" | "apply";
  checks: {
    name: string;
    status: "ok" | "error" | "unavailable" | "skipped";
    findings: number;
    error?: string;
  }[];
  alertsFired: number;
  alertsResolved: number;
  proposedNegatives: ProposedNegative[];
  negativeOpsValidated: number;
  negativeOpsApplied: number;
  errors: string[];
}

const isMondayET = (now = new Date()): boolean =>
  new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(now) === "Mon";

const num = (v: unknown): number => Number(v ?? 0);

// A warehouse source that is connected but still backfilling (or whose
// connector doesn't expose the table) fails with ClickHouse's
// table-missing error. That is an expected transient — the check reports
// "unavailable" instead of failing the run; genuine query errors still
// land in report.errors and exit non-zero.
const TABLE_MISSING =
  /Unknown table expression identifier|does not exist|doesn't exist/i;

// ---------------------------------------------------------------------------
// Google Ads checks (03)
// ---------------------------------------------------------------------------

async function checkCampaignType(): Promise<GuardrailFinding[]> {
  const rows = await wq<{
    id: number | string;
    name: string | null;
    advertising_channel_type: string | null;
    advertising_channel_subtype: string | null;
  }>(
    withSchemas(`
      SELECT id, name, advertising_channel_type, advertising_channel_subtype
      FROM (
        SELECT id, name, advertising_channel_type, advertising_channel_subtype, status, updated_at
        FROM {googleAds}.campaign_history
        ORDER BY updated_at DESC LIMIT 1 BY id
      )
      WHERE status = 'ENABLED'
        AND (advertising_channel_type != 'SEARCH'
             OR advertising_channel_subtype IN ('SEARCH_MOBILE_APP','SHOPPING_SMART_ADS'))
    `),
  );
  return rows.map((r) => ({
    subject: `campaign ${r.id} ${r.name ?? ""}`.trim(),
    detail: {
      campaign_id: String(r.id),
      advertising_channel_type: r.advertising_channel_type,
      advertising_channel_subtype: r.advertising_channel_subtype,
    },
  }));
}

async function checkNetworkDrift(): Promise<GuardrailFinding[]> {
  const rows = await wq<{
    campaign_id: number | string;
    target_content_network: number | null;
    target_partner_search_network: number | null;
  }>(
    withSchemas(`
      SELECT campaign_id, target_content_network, target_partner_search_network
      FROM (
        SELECT campaign_id, target_content_network, target_partner_search_network, updated_at
        FROM {googleAds}.campaign_network_setting_history
        ORDER BY updated_at DESC LIMIT 1 BY campaign_id
      )
      WHERE target_content_network = 1 OR target_partner_search_network = 1
    `),
  );
  return rows.map((r) => ({
    subject: `campaign ${r.campaign_id}`,
    detail: {
      campaign_id: String(r.campaign_id),
      target_content_network: r.target_content_network,
      target_partner_search_network: r.target_partner_search_network,
    },
  }));
}

async function checkBiddingDrift(): Promise<GuardrailFinding[]> {
  const rows = await wq<{
    campaign_id: number | string;
    type: string | null;
    enhanced_cpc_enabled: number | null;
  }>(
    withSchemas(`
      SELECT campaign_id, type, enhanced_cpc_enabled
      FROM (
        SELECT campaign_id, type, enhanced_cpc_enabled, updated_at
        FROM {googleAds}.campaign_bidding_strategy_history
        ORDER BY updated_at DESC LIMIT 1 BY campaign_id
      )
      WHERE type != 'MANUAL_CPC' OR enhanced_cpc_enabled = 1
    `),
  );
  return rows.map((r) => ({
    subject: `campaign ${r.campaign_id}`,
    detail: {
      campaign_id: String(r.campaign_id),
      bidding_type: r.type,
      enhanced_cpc_enabled: r.enhanced_cpc_enabled,
    },
  }));
}

async function checkBroadMatch(): Promise<GuardrailFinding[]> {
  const rows = await wq<{
    ad_group_id: number | string;
    criterion_id: number | string;
    keyword_text: string | null;
    keyword_match_type: string | null;
  }>(
    withSchemas(`
      SELECT ad_group_id, criterion_id, keyword_text, keyword_match_type
      FROM (
        SELECT ad_group_id, id AS criterion_id, keyword_text, keyword_match_type,
               negative, status, updated_at
        FROM {googleAds}.ad_group_criterion_history
        ORDER BY updated_at DESC LIMIT 1 BY ad_group_id, id
      )
      WHERE keyword_text != '' AND negative = 0 AND status = 'ENABLED'
        AND keyword_match_type = 'BROAD'
    `),
  );
  return rows.map((r) => ({
    subject: `keyword "${r.keyword_text ?? ""}" (ad group ${r.ad_group_id})`,
    detail: {
      ad_group_id: String(r.ad_group_id),
      criterion_id: String(r.criterion_id),
      keyword_text: r.keyword_text,
      keyword_match_type: r.keyword_match_type,
    },
  }));
}

/** Wasted search terms — also the feed for the negative-list proposals. */
async function wastedSearchTerms(): Promise<
  (ProposedNegative & { conversions: number })[]
> {
  const rows = await wq<{
    search_term: string | null;
    campaign_id: number | string | null;
    cost: number | string | null;
    clicks: number | string | null;
    conv: number | string | null;
  }>(
    withSchemas(`
      SELECT search_term, campaign_id, sum(cost_micros)/1e6 AS cost,
             sum(clicks) AS clicks, sum(conversions) AS conv
      FROM {googleAds}.search_term_keyword_stats
      WHERE date >= today() - 7
      GROUP BY search_term, campaign_id
      HAVING cost >= 25 AND conv = 0
         AND multiSearchAnyCaseInsensitive(search_term,
              ['daycare','near me','jobs','salary','free','tuition','parent',
               'babysitter','nanny','brightwheel','procare','lms','sis']) > 0
      ORDER BY cost DESC
    `),
  );
  return rows
    .filter((r) => r.search_term && r.campaign_id != null)
    .map((r) => ({
      term: String(r.search_term),
      campaignId: String(r.campaign_id),
      costUsd: num(r.cost),
      clicks: num(r.clicks),
      conversions: num(r.conv),
    }));
}

async function checkKeywordKill(): Promise<GuardrailFinding[]> {
  const rows = await wq<{
    criterion_id: number | string | null;
    ad_group_id: number | string | null;
    campaign_id: number | string | null;
    cost: number | string | null;
    clicks: number | string | null;
    conv: number | string | null;
  }>(
    withSchemas(`
      SELECT ad_group_criterion_criterion_id AS criterion_id, ad_group_id, campaign_id,
             sum(cost_micros)/1e6 AS cost, sum(clicks) AS clicks, sum(conversions) AS conv
      FROM {googleAds}.keyword_stats
      WHERE date >= today() - 30
      GROUP BY 1, 2, 3
      HAVING cost > 400 AND conv = 0
    `),
  );
  return rows.map((r) => ({
    subject: `keyword criterion ${r.criterion_id} (ad group ${r.ad_group_id})`,
    detail: {
      criterion_id: String(r.criterion_id),
      ad_group_id: String(r.ad_group_id),
      campaign_id: String(r.campaign_id),
      cost_30d_usd: num(r.cost),
      clicks_30d: num(r.clicks),
      action: "alert-only: pause is a human call (offline conversions lag, 03 §5.2)",
    },
  }));
}

async function checkAdGroupKill(): Promise<GuardrailFinding[]> {
  const rows = await wq<{
    ad_group_id: number | string;
    campaign_id: number | string | null;
    clicks: number | string | null;
    conv: number | string | null;
    cost: number | string | null;
  }>(
    withSchemas(`
      SELECT id AS ad_group_id, campaign_id,
             sum(clicks) AS clicks, sum(conversions) AS conv, sum(cost_micros)/1e6 AS cost
      FROM {googleAds}.ad_group_stats
      WHERE id IS NOT NULL
      GROUP BY 1, 2
      HAVING clicks >= 100 AND conv = 0
    `),
  );
  return rows.map((r) => ({
    subject: `ad group ${r.ad_group_id}`,
    detail: {
      ad_group_id: String(r.ad_group_id),
      campaign_id: String(r.campaign_id),
      clicks: num(r.clicks),
      cost_usd: num(r.cost),
      action: "alert-only: pause and re-examine the landing page (03 §9)",
    },
  }));
}

/** Account-level cost per qualified demo, MTD (07 §4.8 note: campaign-level
 *  attribution waits on campaign_id on offline_conversion_uploads). */
async function checkCostPerQualifiedDemo(): Promise<GuardrailFinding[]> {
  const spend = await wq<{ cost: number | string | null }>(
    withSchemas(`
      SELECT sum(cost_micros)/1e6 AS cost
      FROM {googleAds}.campaign_stats
      WHERE date >= toStartOfMonth(today())
    `),
  );
  const cost = num(spend[0]?.cost);
  const qualifiedRow = await getDb()
    .selectFrom("offline_conversion_uploads")
    .select((eb) => eb.fn.countAll().as("n"))
    .where("conversion_name", "=", "qualified_demo")
    .where("conversion_time", ">=", sql<Date>`date_trunc('month', now())`)
    .executeTakeFirst();
  const qualified = num(qualifiedRow?.n);
  const cpqd = qualified > 0 ? cost / qualified : null;
  if (cpqd !== null && cpqd <= 1500) return [];
  if (cpqd === null && cost <= 1500) return [];
  return [
    {
      subject: "account",
      detail: {
        mtd_cost_usd: cost,
        mtd_qualified_demos: qualified,
        cpqd_usd: cpqd,
        threshold_usd: 1500,
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// GA4 / Meta checks (03 §6.4, 04)
// ---------------------------------------------------------------------------

async function checkInstalledBaseContamination(): Promise<GuardrailFinding[]> {
  const rows = await wq<{ share: number | string | null }>(
    withSchemas(`
      SELECT sumIf(event_count, event_name = 'support_or_login_click')
             / nullif(sumIf(event_count, event_name = 'session_start'), 0) AS share
      FROM {ga4}.events_report
      WHERE date >= today() - 7
    `),
  );
  const share = num(rows[0]?.share);
  if (share <= 0.15) return [];
  return [
    {
      subject: "ga4 property",
      detail: {
        support_or_login_share_7d: share,
        threshold: 0.15,
        note: "property-level; paid-only share needs a paid-session dimension (07 §4.8)",
      },
    },
  ];
}

async function checkMetaFrequency(): Promise<GuardrailFinding[]> {
  const rows = await wq<{
    adset_id: number | string;
    adset_name: string | null;
    campaign_name: string | null;
    freq: number | string | null;
  }>(
    withSchemas(`
      SELECT adset_id, adset_name, campaign_name, avg(frequency) AS freq
      FROM {metaAds}.basic_ad_set
      WHERE date >= today() - 7
      GROUP BY 1,2,3
      HAVING freq > 4.0
    `),
  );
  return rows.map((r) => ({
    subject: `ad set ${r.adset_name ?? r.adset_id}`,
    detail: {
      adset_id: String(r.adset_id),
      campaign_name: r.campaign_name,
      frequency_7d: num(r.freq),
    },
  }));
}

async function checkMetaTargetingExclusions(): Promise<GuardrailFinding[]> {
  const rows = await wq<{
    id: number | string;
    name: string | null;
    targeting_exclusions: string | null;
  }>(
    withSchemas(`
      SELECT id, name, targeting_exclusions
      FROM (
        SELECT id, name, targeting_exclusions, effective_status, updated_time
        FROM {metaAds}.ad_set_history
        ORDER BY updated_time DESC LIMIT 1 BY id
      )
      WHERE effective_status = 'ACTIVE'
        AND (targeting_exclusions = '' OR targeting_exclusions IS NULL)
    `),
  );
  return rows.map((r) => ({
    subject: `ad set ${r.name ?? r.id}`,
    detail: { adset_id: String(r.id), targeting_exclusions: r.targeting_exclusions },
  }));
}

async function checkMetaObjective(): Promise<GuardrailFinding[]> {
  const rows = await wq<{
    id: number | string;
    name: string | null;
    objective: string | null;
  }>(
    withSchemas(`
      SELECT id, name, objective
      FROM (
        SELECT id, name, objective, effective_status, updated_time
        FROM {metaAds}.campaign_history
        ORDER BY updated_time DESC LIMIT 1 BY id
      )
      WHERE effective_status = 'ACTIVE'
        AND objective NOT IN ('OUTCOME_SALES','OUTCOME_AWARENESS')
    `),
  );
  return rows.map((r) => ({
    subject: `campaign ${r.name ?? r.id}`,
    detail: { campaign_id: String(r.id), objective: r.objective },
  }));
}

async function checkMetaVsGa4(): Promise<GuardrailFinding[]> {
  const meta = await wq<{ meta_leads: number | string | null }>(
    withSchemas(`
      SELECT sum(value) AS meta_leads
      FROM {metaAds}.basic_campaign_actions
      WHERE action_type = 'lead' AND date >= today() - 28
    `),
  );
  const ga4 = await wq<{ ga4_meta_leads: number | string | null }>(
    withSchemas(`
      SELECT sum(key_events) AS ga4_meta_leads
      FROM {ga4}.traffic_acquisition_session_source_medium_report
      WHERE session_source IN ('facebook','fb','instagram','ig')
        AND session_medium = 'paid_social' AND date >= today() - 28
    `),
  );
  const metaLeads = num(meta[0]?.meta_leads);
  const ga4Leads = num(ga4[0]?.ga4_meta_leads);
  if (metaLeads <= 0 || metaLeads <= 2 * ga4Leads) return [];
  return [
    {
      subject: "meta vs ga4, trailing 28d",
      detail: {
        meta_self_reported_leads: metaLeads,
        ga4_attributed_meta_leads: ga4Leads,
        ratio: ga4Leads > 0 ? metaLeads / ga4Leads : null,
        rule: "show GA4 where Meta exceeds it by more than 2x (07 §5)",
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Check registry
// ---------------------------------------------------------------------------

const CHECKS: CheckDef[] = [
  { name: "google-campaign-type", severity: "critical", spec: "03 §2 — only Search campaigns may exist; PMax/Display/Video/Smart are banned", run: checkCampaignType },
  { name: "google-network-drift", severity: "critical", spec: "03 §6.1 — Search network only; partners and Display off", run: checkNetworkDrift },
  { name: "google-bidding-drift", severity: "warn", spec: "03 §6.1 — Manual CPC, enhanced CPC off", run: checkBiddingDrift },
  { name: "google-broad-match", severity: "critical", spec: "03 §0 — broad match is banned account-wide", run: checkBroadMatch },
  { name: "google-wasted-search-terms", severity: "warn", spec: "03 §4.7 — wasted terms get negated same-day", run: async () => [] }, // findings built in run()
  { name: "google-keyword-kill", severity: "warn", spec: "03 §9 — keyword > $400 spend, 0 conversions, 30 days", run: checkKeywordKill },
  { name: "google-adgroup-kill", severity: "warn", spec: "03 §9 — ad group with 0 conversions after 100 clicks", run: checkAdGroupKill },
  { name: "google-cost-per-qualified-demo", severity: "warn", spec: "03 §9 — kill/cut above $1,500 cost per qualified demo", run: checkCostPerQualifiedDemo },
  { name: "ga4-installed-base-contamination", severity: "warn", spec: "03 §6.4/§9 — >15% support/login share means the exclusions are broken", run: checkInstalledBaseContamination },
  { name: "meta-frequency", severity: "warn", spec: "04 §7 — frequency above 4.0/7d fatigues the audience", run: checkMetaFrequency },
  { name: "meta-targeting-exclusions", severity: "critical", spec: "04 — every active ad set excludes the installed base", run: checkMetaTargetingExclusions },
  { name: "meta-objective", severity: "critical", spec: "04 — allowed objectives: OUTCOME_SALES, OUTCOME_AWARENESS", run: checkMetaObjective },
  { name: "meta-vs-ga4-attribution", severity: "info", spec: "07 §4.8 — Meta self-report vs GA4-attributed, > 2x", weekly: true, run: checkMetaVsGa4 },
];

// ---------------------------------------------------------------------------
// Alert reconciliation: fire new (check, subject) rows, resolve cleared ones.
// A check that errored reconciles nothing — its last known state stands.
// ---------------------------------------------------------------------------

async function reconcileAlerts(
  check: CheckDef,
  findings: GuardrailFinding[],
  report: GuardrailsReport,
): Promise<void> {
  const db = getDb();
  const open = await db
    .selectFrom("guardrail_alerts")
    .select(["id", "subject"])
    .where("check_name", "=", check.name)
    .where("resolved_at", "is", null)
    .execute();

  const firing = new Set(findings.map((f) => f.subject));
  for (const row of open) {
    if (firing.has(row.subject)) continue;
    await db
      .updateTable("guardrail_alerts")
      .set({ resolved_at: new Date() })
      .where("id", "=", row.id)
      .execute();
    report.alertsResolved += 1;
    await postSlack(`[RESOLVED] ${check.name} — ${row.subject}`);
  }

  const openSubjects = new Set(open.map((r) => r.subject));
  for (const finding of findings) {
    if (openSubjects.has(finding.subject)) continue;
    await fireAlert(check.name, check.severity, finding.subject, {
      ...finding.detail,
      spec: check.spec,
    });
    report.alertsFired += 1;
  }
}

// ---------------------------------------------------------------------------
// Negative keyword mining (03 §4.7) — dedicated shared list, validate-only
// unless apply=true. The static plan lists stay owned by bootstrap.ts.
// ---------------------------------------------------------------------------

const AUTO_LIST_NAME = "NEG - Auto Guardrails";

const STATIC_NEGATIVE_TERMS = new Set(
  NEGATIVE_LISTS.flatMap((l) => l.terms).map(normalize),
);

interface SharedCriterionRow {
  sharedCriterion?: { sharedSet?: string; keyword?: { text?: string } };
}

async function applyNegatives(
  proposed: ProposedNegative[],
  apply: boolean,
  report: GuardrailsReport,
): Promise<void> {
  if (proposed.length === 0) return;
  if (!googleAdsReady()) {
    report.mutations = "no-credentials";
    console.log(
      `No Google Ads credentials — ${proposed.length} proposed negative(s) logged only.`,
    );
    return;
  }

  const cid = customerId();
  const validateOnly = !apply;

  const setRows = (await search(`
    SELECT shared_set.id, shared_set.name FROM shared_set
    WHERE shared_set.status != 'REMOVED'
  `)) as { sharedSet: { id: string; name: string } }[];
  const existingSetId = setRows.find(
    (r) => String(r.sharedSet.name) === AUTO_LIST_NAME,
  )?.sharedSet.id;

  // Dedupe against every shared criterion already in the account, not just
  // the auto list — re-adding a term Google already has errors the batch.
  const criteriaRows = (await search(`
    SELECT shared_criterion.shared_set, shared_criterion.keyword.text
    FROM shared_criterion
  `)) as SharedCriterionRow[];
  const existingTerms = new Set(
    criteriaRows
      .map((r) => r.sharedCriterion?.keyword?.text)
      .filter((t): t is string => Boolean(t))
      .map(normalize),
  );

  const newTerms = [
    ...new Map(
      proposed
        .map((p) => ({ ...p, normalized: normalize(p.term) }))
        .filter(
          (p) =>
            p.normalized.length > 0 &&
            !STATIC_NEGATIVE_TERMS.has(p.normalized) &&
            !existingTerms.has(p.normalized),
        )
        .map((p) => [p.normalized, p] as const),
    ).values(),
  ];

  const ops: unknown[] = [];
  let setRn: string;
  if (existingSetId) {
    setRn = rn.sharedSet(cid, existingSetId);
  } else {
    setRn = rn.sharedSet(cid, -1);
    ops.push({
      sharedSetOperation: {
        create: { resourceName: setRn, name: AUTO_LIST_NAME, type: "NEGATIVE_KEYWORDS" },
      },
    });
  }

  // The list only acts where it is attached — cover every non-REMOVED
  // campaign (paused included; they get enabled later).
  const campaignRows = (await search(`
    SELECT campaign.id, campaign.name FROM campaign
    WHERE campaign.status != 'REMOVED'
  `)) as { campaign: { id: string; name: string } }[];
  const attachedRows = (await search(`
    SELECT campaign_shared_set.campaign, campaign_shared_set.shared_set
    FROM campaign_shared_set
    WHERE campaign_shared_set.status != 'REMOVED'
  `)) as { campaignSharedSet: { campaign: string; sharedSet: string } }[];
  const attached = new Set(
    attachedRows.map((r) => `${r.campaignSharedSet.campaign}|${r.campaignSharedSet.sharedSet}`),
  );
  if (existingSetId) {
    for (const row of campaignRows) {
      const campaignRn = rn.campaign(cid, row.campaign.id);
      if (attached.has(`${campaignRn}|${setRn}`)) continue;
      ops.push({
        campaignSharedSetOperation: { create: { campaign: campaignRn, sharedSet: setRn } },
      });
    }
  } else {
    // Set is being created in this same atomic request — no attachments can
    // exist yet; add one per campaign against the temp resource name.
    for (const row of campaignRows) {
      ops.push({
        campaignSharedSetOperation: {
          create: { campaign: rn.campaign(cid, row.campaign.id), sharedSet: setRn },
        },
      });
    }
  }

  // PHRASE match for mined full queries: blocks the exact wording without
  // the over-blocking a broad negative of a multi-word term would cause.
  for (const p of newTerms) {
    ops.push({
      sharedCriterionOperation: {
        create: { sharedSet: setRn, keyword: { text: p.term, matchType: "PHRASE" } },
      },
    });
  }

  if (ops.length === 0) {
    console.log("Negative list already up to date — no ops needed.");
    return;
  }
  await mutate(ops, validateOnly);
  if (apply) {
    report.negativeOpsApplied = ops.length;
  } else {
    report.negativeOpsValidated = ops.length;
  }
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

export async function runAdsGuardrails(apply = false): Promise<GuardrailsReport> {
  const report: GuardrailsReport = {
    warehouse: "ok",
    mutations: apply ? "apply" : "validate-only",
    checks: [],
    alertsFired: 0,
    alertsResolved: 0,
    proposedNegatives: [],
    negativeOpsValidated: 0,
    negativeOpsApplied: 0,
    errors: [],
  };

  if (!graphed.isConfigured()) {
    // No Graphed credentials (plain `npm run` outside `graphed dev run`):
    // the checks are warehouse queries, so there is nothing to do.
    report.warehouse = "not-configured";
    report.mutations = "no-credentials";
    console.log("Graphed client not configured — skipping warehouse checks.");
    return report;
  }
  const schemas = warehouseConfig();
  if (!schemas.googleAds && !schemas.ga4 && !schemas.metaAds) {
    report.warehouse = "not-configured";
    report.mutations = "no-credentials";
    console.log("No warehouse sources in warehouse.json — skipping checks.");
    return report;
  }

  const monday = isMondayET();
  let wasted: (ProposedNegative & { conversions: number })[] = [];

  for (const check of CHECKS) {
    if (check.weekly && !monday) {
      report.checks.push({ name: check.name, status: "skipped", findings: 0 });
      continue;
    }
    try {
      // The wasted-terms check is special-cased: its rows feed both the
      // alert stream and the negative-list proposals.
      const findings =
        check.name === "google-wasted-search-terms"
          ? (wasted = await wastedSearchTerms()).map((w) => ({
              subject: `"${w.term}" (campaign ${w.campaignId})`,
              detail: {
                search_term: w.term,
                campaign_id: w.campaignId,
                cost_7d_usd: w.costUsd,
                clicks_7d: w.clicks,
                action: "proposed as negative on NEG - Auto Guardrails",
              },
            }))
          : await check.run();
      report.checks.push({ name: check.name, status: "ok", findings: findings.length });
      await reconcileAlerts(check, findings, report);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (TABLE_MISSING.test(message)) {
        report.checks.push({ name: check.name, status: "unavailable", findings: 0, error: message });
        console.warn(`${check.name}: source table not available yet — ${message}`);
      } else {
        report.checks.push({ name: check.name, status: "error", findings: 0, error: message });
        report.errors.push(`${check.name}: ${message}`);
      }
    }
  }

  report.proposedNegatives = wasted.map(({ term, campaignId, costUsd, clicks }) => ({
    term,
    campaignId,
    costUsd,
    clicks,
  }));

  try {
    await applyNegatives(report.proposedNegatives, apply, report);
  } catch (error) {
    report.errors.push(
      `negatives: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return report;
}
