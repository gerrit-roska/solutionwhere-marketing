/**
 * find_winners.ts — Step 1 of the loop.
 * Converting search terms in the TESTING campaign, with cost-per-conversion computed
 * client-side. Read-only. Feed approved rows to promote_winner.ts.
 *
 * Usage: ts-node find_winners.ts <TESTING_CAMPAIGN_NAME> [TARGET_CPA] [DAYS]
 */
import { search, fromMicros, gaqlStr } from "./client";
import { loadClientFromArgs } from "./config";

export interface Winner {
  searchTerm: string;
  adGroup: string;
  clicks: number;
  cost: number;
  conversions: number;
  costPerConversion: number;
}

export async function findWinners(
  testingCampaignName: string,
  targetCpa = Infinity,
  days = 30,
  minConversions = 1
): Promise<Winner[]> {
  const rows = await search(`
    SELECT
      search_term_view.search_term,
      ad_group.name,
      metrics.clicks,
      metrics.cost_micros,
      metrics.conversions
    FROM search_term_view
    WHERE campaign.name = '${gaqlStr(testingCampaignName)}'
      AND segments.date DURING LAST_${days}_DAYS
      AND metrics.conversions > 0
    ORDER BY metrics.conversions DESC
  `);

  return rows
    .map((r: any): Winner => {
      const conversions = Number(r.metrics.conversions);
      const cost = fromMicros(r.metrics.costMicros);
      return {
        searchTerm: r.searchTermView.searchTerm,
        adGroup: r.adGroup.name,
        clicks: Number(r.metrics.clicks ?? 0),
        cost,
        conversions,
        costPerConversion: conversions > 0 ? cost / conversions : Infinity,
      };
    })
    // Conversions can be fractional (view-through / data-driven attribution); a
    // 0.3-conversion term is not a proven winner. Require a real floor before
    // anything is eligible for promotion.
    .filter((w) => w.conversions >= minConversions && w.costPerConversion <= targetCpa);
}

if (require.main === module) {
  const { config, args } = loadClientFromArgs();
  const [name, cpa, days] = args;
  const testingCampaignName = name ?? config?.campaigns.testing_campaign_name;
  const targetCpa = cpa ? Number(cpa) : config?.thresholds.target_cpa ?? Infinity;
  const lookbackDays = days ? Number(days) : config?.thresholds.lookback_days ?? 30;
  if (!testingCampaignName) {
    console.error("Usage: ts-node find_winners.ts [--client <client>] [TESTING_CAMPAIGN_NAME] [TARGET_CPA] [DAYS]");
    process.exit(1);
  }
  const minConversions = config?.thresholds.min_conversions ?? 1;
  findWinners(testingCampaignName, targetCpa, lookbackDays, minConversions)
    .then((w) => console.log(JSON.stringify(w, null, 2)))
    .catch((e) => { console.error(e); process.exit(1); });
}
