/**
 * report.ts — read-only dashboard snapshot for the client.
 *
 * Queries campaign totals + winner/waste candidates over the configured lookback
 * window and writes dashboard/data.json. The static dashboard/index.html fetches
 * that co-located JSON (embed pattern: nothing hits the live API on page load;
 * re-run this on cron to keep the dashboard current). Zero mutations.
 *
 * Usage: ts-node report.ts --client <client>   (or: npm run report -- --client <client>)
 */
import * as fs from "fs";
import * as path from "path";
import { search, fromMicros, gaqlStr } from "./client";
import { findWinners } from "./find_winners";
import { findWaste } from "./find_waste";
import { loadClientFromArgs, assertCampaignsBootstrapped } from "./config";

interface CampaignReportRow {
  name: string;
  status: string;
  dailyBudget: number | null;
  cost: number;
  clicks: number;
  impressions: number;
  conversions: number;
}

// Brand tokens live in clients/<slug>.json under the optional `dashboard` block;
// the typed engine config doesn't carry it, so read the raw file for it here.
function dashboardBlock(clientKey: string): { title?: string; brand?: { initials?: string; primary?: string; accent?: string } } {
  const raw = JSON.parse(
    fs.readFileSync(path.join(__dirname, "clients", `${clientKey}.json`), "utf8")
  );
  return raw.dashboard ?? {};
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

async function campaignStats(names: string[], days: number): Promise<CampaignReportRow[]> {
  const nameList = names.map((n) => `'${gaqlStr(n)}'`).join(", ");
  // Attributes first (always returns both campaigns, even with zero traffic)...
  const attrRows = await search(`
    SELECT campaign.name, campaign.status, campaign_budget.amount_micros
    FROM campaign
    WHERE campaign.name IN (${nameList})
      AND campaign.status != 'REMOVED'
  `);
  // ...then window metrics (rows may be absent for zero-impression campaigns).
  const metricRows = await search(`
    SELECT campaign.name, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions
    FROM campaign
    WHERE campaign.name IN (${nameList})
      AND segments.date DURING LAST_${days}_DAYS
  `);
  const metricsByName = new Map<string, any>(
    metricRows.map((r: any) => [String(r.campaign.name), r.metrics])
  );
  return attrRows.map((r: any): CampaignReportRow => {
    const m = metricsByName.get(String(r.campaign.name)) ?? {};
    return {
      name: String(r.campaign.name),
      status: String(r.campaign.status ?? "UNKNOWN"),
      dailyBudget: r.campaignBudget?.amountMicros != null ? fromMicros(r.campaignBudget.amountMicros) : null,
      cost: fromMicros(m.costMicros ?? 0),
      clicks: Number(m.clicks ?? 0),
      impressions: Number(m.impressions ?? 0),
      conversions: Number(m.conversions ?? 0),
    };
  });
}

async function main(): Promise<void> {
  const { config } = loadClientFromArgs();
  if (!config) {
    throw new Error("Usage: ts-node report.ts --client <client>");
  }
  assertCampaignsBootstrapped(config);

  const days = config.thresholds.lookback_days;
  const campaignNames = [
    config.campaigns.testing_campaign_name,
    config.campaigns.winners_campaign_name,
  ];

  const campaigns = await campaignStats(campaignNames, days);
  const winners = await findWinners(
    config.campaigns.testing_campaign_name,
    config.thresholds.target_cpa,
    days
  );
  const waste = await findWaste(
    config.campaigns.testing_campaign_name,
    config.thresholds.waste_min_spend,
    days
  );

  const totals = campaigns.reduce(
    (acc, c) => ({
      cost: acc.cost + c.cost,
      clicks: acc.clicks + c.clicks,
      impressions: acc.impressions + c.impressions,
      conversions: acc.conversions + c.conversions,
    }),
    { cost: 0, clicks: 0, impressions: 0, conversions: 0 }
  );

  const dash = dashboardBlock(config.client_key);
  const data = {
    client: config.display_name,
    title: dash.title ?? `${config.display_name} Google Ads`,
    brand: {
      initials: dash.brand?.initials ?? initialsOf(config.display_name),
      primary: dash.brand?.primary ?? "#1a1a1a",
      accent: dash.brand?.accent ?? "#4a4a4a",
    },
    generatedAt: new Date().toISOString(),
    lookbackDays: days,
    targetCpa: config.thresholds.target_cpa,
    totals,
    campaigns,
    winners,
    waste,
  };

  const outPath = path.join(__dirname, "dashboard", "data.json");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(data, null, 2)}\n`);

  // Self-contained snapshot: inline the data into a copy of index.html so
  // dashboard/report.html opens directly from disk (file://, no server needed).
  const indexHtml = fs.readFileSync(path.join(__dirname, "dashboard", "index.html"), "utf8");
  const payload = JSON.stringify(data).replace(/</g, "\\u003c");
  const htmlPath = path.join(__dirname, "dashboard", "report.html");
  fs.writeFileSync(
    htmlPath,
    indexHtml.replace(
      '<script type="module">',
      `<script>window.__DASHBOARD_DATA__ = ${payload};</script>\n  <script type="module">`
    )
  );

  console.log(
    `Report written -> ${outPath}\n` +
      `  spend=$${totals.cost.toFixed(2)} clicks=${totals.clicks} conversions=${totals.conversions} ` +
      `winners=${winners.length} waste=${waste.length} (last ${days} days)\n` +
      `View: open ${htmlPath} directly, or npm run dashboard`
  );
}

main().catch((error) => {
  console.error("Report failed:");
  console.error(error);
  process.exit(1);
});
