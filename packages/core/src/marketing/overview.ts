import { graphed } from "./graphed";
import { warehouseConfig, withSchemas, wq } from "./warehouse";

// Trailing-28-day warehouse reads for the dashboard overview. SQL follows
// the tables already used by guardrails, Search Console metrics, and the
// Instantly bounce check (07 §4.3, §4.8, §5).

const WINDOW = "date >= today() - toIntervalDay(28)";

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function text(value: unknown): string {
  if (value == null) return "";
  return String(value);
}

function messageOf(error: unknown): string {
  const raw = error instanceof Error ? error.message : "warehouse query failed";
  const single = raw.replace(/\s+/g, " ").trim();
  const redacted = single.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://…");
  return redacted.length > 180 ? `${redacted.slice(0, 180)}…` : redacted;
}

export type LoadStatus =
  | "ok"
  | "empty"
  | "error"
  | "not-connected"
  | "unavailable";

export interface LoadResult<T> {
  status: LoadStatus;
  schema: string;
  message: string | null;
  data: T | null;
}

async function loadConnected<T>(
  schema: string,
  load: () => Promise<T>,
  isEmpty: (data: T) => boolean,
): Promise<LoadResult<T>> {
  if (!schema) {
    return { status: "not-connected", schema, message: null, data: null };
  }
  if (!graphed.isConfigured()) {
    return {
      status: "unavailable",
      schema,
      message: "Warehouse credentials are not available in this environment.",
      data: null,
    };
  }
  try {
    const data = await load();
    if (isEmpty(data)) {
      return { status: "empty", schema, message: null, data };
    }
    return { status: "ok", schema, message: null, data };
  } catch (error) {
    return { status: "error", schema, message: messageOf(error), data: null };
  }
}

async function tableExists(schema: string, table: string): Promise<boolean> {
  const rows = await wq<{ name: string }>(
    `SELECT name FROM system.tables WHERE database = %(schema)s AND name = %(table)s`,
    { schema, table },
  );
  return rows.length > 0;
}

export interface SearchConsoleData {
  pages: number;
  clicks: number;
  impressions: number;
  topPages: { page: string; clicks: number; impressions: number }[];
  topQueries: { query: string; clicks: number; impressions: number }[];
}

export interface Ga4Channel {
  source: string;
  medium: string;
  sessions: number;
  keyEvents: number;
}

export interface GoogleAdsCampaign {
  name: string;
  status: string;
  channel: string;
}

export interface GoogleAdsData {
  statsRows: number;
  cost: number;
  clicks: number;
  impressions: number;
  conversions: number;
  campaigns: GoogleAdsCampaign[];
}

export interface MetaAccount {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  status: string;
}

export interface MetaActivity {
  time: string;
  event: string;
  objectName: string;
  actor: string;
}

export interface MetaCampaign {
  campaign: string;
  spend: number;
  clicks: number;
  impressions: number;
}

export interface MetaData {
  account: MetaAccount | null;
  activity: MetaActivity[];
  /** Null when basic_campaign is not in the schema yet. */
  performance: MetaCampaign[] | null;
}

export interface InstantlyCampaign {
  name: string;
  status: string;
  contacted: number;
  sent: number;
  replies: number;
  bounced: number;
  unsubscribed: number;
}

export interface CrmDeal {
  module: string;
  amount: number;
}

export interface WarehouseOverview {
  searchConsole: LoadResult<SearchConsoleData>;
  ga4: LoadResult<Ga4Channel[]>;
  googleAds: LoadResult<GoogleAdsData>;
  metaAds: LoadResult<MetaData>;
  instantly: LoadResult<InstantlyCampaign[]>;
  crm: LoadResult<CrmDeal[]> & { note: string | null };
}

async function loadSearchConsole(schema: string): Promise<SearchConsoleData> {
  const [totals, topPages, topQueries] = await Promise.all([
    wq<{ pages: unknown; clicks: unknown; impressions: unknown }>(
      withSchemas(`
        SELECT uniqExact(page) AS pages, sum(clicks) AS clicks, sum(impressions) AS impressions
        FROM {searchConsole}.page_report
        WHERE ${WINDOW}
      `),
    ),
    wq<{ page: string; clicks: unknown; impressions: unknown }>(
      withSchemas(`
        SELECT page, sum(clicks) AS clicks, sum(impressions) AS impressions
        FROM {searchConsole}.page_report
        WHERE ${WINDOW}
        GROUP BY page
        ORDER BY impressions DESC
        LIMIT 8
      `),
    ),
    wq<{ query: string; clicks: unknown; impressions: unknown }>(
      withSchemas(`
        SELECT query, sum(clicks) AS clicks, sum(impressions) AS impressions
        FROM {searchConsole}.keyword_site_report_by_site
        WHERE ${WINDOW}
        GROUP BY query
        ORDER BY impressions DESC
        LIMIT 8
      `),
    ),
  ]);
  const total = totals[0];
  return {
    pages: num(total?.pages),
    clicks: num(total?.clicks),
    impressions: num(total?.impressions),
    topPages: topPages.map((row) => ({
      page: text(row.page),
      clicks: num(row.clicks),
      impressions: num(row.impressions),
    })),
    topQueries: topQueries.map((row) => ({
      query: text(row.query),
      clicks: num(row.clicks),
      impressions: num(row.impressions),
    })),
  };
}

async function loadGa4(): Promise<Ga4Channel[]> {
  const rows = await wq<{
    session_source: string;
    session_medium: string;
    sessions: unknown;
    key_events: unknown;
  }>(
    withSchemas(`
      SELECT session_source, session_medium,
             sum(sessions) AS sessions, sum(key_events) AS key_events
      FROM {ga4}.traffic_acquisition_session_source_medium_report
      WHERE ${WINDOW}
      GROUP BY session_source, session_medium
      ORDER BY sessions DESC
      LIMIT 8
    `),
  );
  return rows.map((row) => ({
    source: text(row.session_source) || "(not set)",
    medium: text(row.session_medium) || "(not set)",
    sessions: num(row.sessions),
    keyEvents: num(row.key_events),
  }));
}

async function loadGoogleAds(): Promise<GoogleAdsData> {
  const [stats, campaigns] = await Promise.all([
    wq<{
      rows: unknown;
      cost: unknown;
      clicks: unknown;
      impressions: unknown;
      conversions: unknown;
    }>(
      withSchemas(`
        SELECT count() AS rows,
               sum(cost_micros) / 1e6 AS cost,
               sum(clicks) AS clicks,
               sum(impressions) AS impressions,
               sum(conversions) AS conversions
        FROM {googleAds}.campaign_stats
        WHERE ${WINDOW}
      `),
    ),
    wq<{ name: string | null; status: string | null; advertising_channel_type: string | null }>(
      withSchemas(`
        SELECT name, status, advertising_channel_type
        FROM {googleAds}.campaign_history
        ORDER BY updated_at DESC
        LIMIT 1 BY id
        LIMIT 20
      `),
    ),
  ]);
  const stat = stats[0];
  return {
    statsRows: num(stat?.rows),
    cost: num(stat?.cost),
    clicks: num(stat?.clicks),
    impressions: num(stat?.impressions),
    conversions: num(stat?.conversions),
    campaigns: campaigns.map((row) => ({
      name: text(row.name) || "(unnamed)",
      status: text(row.status) || "UNKNOWN",
      channel: text(row.advertising_channel_type) || "",
    })),
  };
}

async function loadMeta(schema: string): Promise<MetaData> {
  const [accounts, activity, hasPerformance] = await Promise.all([
    wq<{
      id: unknown;
      name: string | null;
      currency: string | null;
      timezone_name: string | null;
      account_status: string | null;
    }>(
      withSchemas(`
        SELECT id, name, currency, timezone_name, account_status
        FROM {metaAds}.account_history
        LIMIT 1
      `),
    ),
    wq<{
      event_time: unknown;
      translated_event_type: string | null;
      object_name: string | null;
      actor_name: string | null;
    }>(
      withSchemas(`
        SELECT event_time, translated_event_type, object_name, actor_name
        FROM {metaAds}.ad_activity
        ORDER BY event_time DESC
        LIMIT 8
      `),
    ),
    tableExists(schema, "basic_campaign"),
  ]);
  const account = accounts[0];
  let performance: MetaCampaign[] | null = null;
  if (hasPerformance) {
    const rows = await wq<{
      campaign_name: string | null;
      spend: unknown;
      clicks: unknown;
      impressions: unknown;
    }>(
      withSchemas(`
        SELECT campaign_name, sum(spend) AS spend, sum(clicks) AS clicks, sum(impressions) AS impressions
        FROM {metaAds}.basic_campaign
        WHERE ${WINDOW}
        GROUP BY campaign_name
        ORDER BY spend DESC
        LIMIT 12
      `),
    );
    performance = rows.map((row) => ({
      campaign: text(row.campaign_name) || "(unnamed)",
      spend: num(row.spend),
      clicks: num(row.clicks),
      impressions: num(row.impressions),
    }));
  }
  return {
    account: account
      ? {
          id: text(account.id),
          name: text(account.name),
          currency: text(account.currency),
          timezone: text(account.timezone_name),
          status: text(account.account_status),
        }
      : null,
    activity: activity.map((row) => ({
      time: text(row.event_time).replace("T", " ").slice(0, 16),
      event: text(row.translated_event_type) || "Activity",
      objectName: text(row.object_name),
      actor: text(row.actor_name),
    })),
    performance,
  };
}

async function loadInstantly(): Promise<InstantlyCampaign[]> {
  const rows = await wq<{
    campaign_name: string | null;
    campaign_status: unknown;
    contacted_count: unknown;
    emails_sent_count: unknown;
    reply_count_unique: unknown;
    bounced_count: unknown;
    unsubscribed_count: unknown;
  }>(
    withSchemas(`
      SELECT campaign_name, campaign_status, contacted_count, emails_sent_count,
             reply_count_unique, bounced_count, unsubscribed_count
      FROM {instantly}.campaign_analytics
      ORDER BY emails_sent_count DESC
      LIMIT 12
    `),
  );
  return rows.map((row) => ({
    name: text(row.campaign_name) || "(unnamed)",
    status: text(row.campaign_status),
    contacted: num(row.contacted_count),
    sent: num(row.emails_sent_count),
    replies: num(row.reply_count_unique),
    bounced: num(row.bounced_count),
    unsubscribed: num(row.unsubscribed_count),
  }));
}

async function loadCrm(): Promise<CrmDeal[]> {
  const rows = await wq<{ module: string | null; amount: unknown }>(
    withSchemas(`
      SELECT property_interested_products AS module,
             sum(toFloat64OrZero(property_amount)) AS amount
      FROM {crm}.deal
      WHERE property_hs_is_closed = 'false'
      GROUP BY module
      ORDER BY amount DESC
      LIMIT 12
    `),
  );
  return rows.map((row) => ({
    module: text(row.module) || "(unset)",
    amount: num(row.amount),
  }));
}

export async function loadWarehouseOverview(): Promise<WarehouseOverview> {
  const config = warehouseConfig();
  const [searchConsole, ga4, googleAds, metaAds, instantly, crmLoaded] =
    await Promise.all([
    loadConnected(
      config.searchConsole,
      () => loadSearchConsole(config.searchConsole),
      (data) =>
        data.pages === 0 &&
        data.clicks === 0 &&
        data.impressions === 0 &&
        data.topPages.length === 0 &&
        data.topQueries.length === 0,
    ),
    loadConnected(config.ga4, loadGa4, (rows) => rows.length === 0),
    loadConnected(
      config.googleAds,
      loadGoogleAds,
      (data) => data.statsRows === 0 && data.campaigns.length === 0,
    ),
    loadConnected(
      config.metaAds,
      () => loadMeta(config.metaAds),
      (data) =>
        data.account == null &&
        data.activity.length === 0 &&
        (data.performance == null || data.performance.length === 0),
    ),
    loadConnected(config.instantly, loadInstantly, (rows) => rows.length === 0),
    loadConnected(config.crm, loadCrm, (rows) => rows.length === 0),
  ]);

  return {
    searchConsole,
    ga4,
    googleAds,
    metaAds,
    instantly,
    crm: { ...crmLoaded, note: config.notes?.crm ?? null },
  };
}
