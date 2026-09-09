/**
 * find_waste.ts — Step 3 of the loop.
 * TESTING search terms that spent over a threshold with zero conversions. Read-only.
 * Feed .searchTerm values to negate_testing.ts.
 *
 * Usage: ts-node find_waste.ts <TESTING_CAMPAIGN_NAME> [MIN_SPEND_USD] [DAYS]
 */
import { search, fromMicros, gaqlStr } from "./client";
import { loadClientFromArgs } from "./config";

export interface WastedTerm {
  searchTerm: string;
  clicks: number;
  cost: number;
}

export async function findWaste(
  testingCampaignName: string,
  minSpendUsd = 10,
  days = 30
): Promise<WastedTerm[]> {
  const minMicros = Math.round(minSpendUsd * 1_000_000);
  const rows = await search(`
    SELECT
      search_term_view.search_term,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM search_term_view
    WHERE campaign.name = '${gaqlStr(testingCampaignName)}'
      AND segments.date DURING LAST_${days}_DAYS
      AND metrics.conversions = 0
      AND metrics.cost_micros > ${minMicros}
    ORDER BY metrics.cost_micros DESC
  `);

  return rows.map((r: any): WastedTerm => ({
    searchTerm: r.searchTermView.searchTerm,
    clicks: Number(r.metrics.clicks ?? 0),
    cost: fromMicros(r.metrics.costMicros),
  }));
}

if (require.main === module) {
  const { config, args } = loadClientFromArgs();
  const [name, minSpend, days] = args;
  const testingCampaignName = name ?? config?.campaigns.testing_campaign_name;
  const minSpendUsd = minSpend ? Number(minSpend) : config?.thresholds.waste_min_spend ?? 10;
  const lookbackDays = days ? Number(days) : config?.thresholds.lookback_days ?? 30;
  if (!testingCampaignName) {
    console.error("Usage: ts-node find_waste.ts [--client <client>] [TESTING_CAMPAIGN_NAME] [MIN_SPEND_USD] [DAYS]");
    process.exit(1);
  }
  findWaste(testingCampaignName, minSpendUsd, lookbackDays)
    .then((w) => console.log(JSON.stringify(w, null, 2)))
    .catch((e) => { console.error(e); process.exit(1); });
}
