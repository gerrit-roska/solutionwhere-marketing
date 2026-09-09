/**
 * bootstrap_campaigns.ts — one-time account setup for a fresh client.
 *
 * The daily loop assumes the TESTING and WINNERS campaigns already exist (it
 * references their IDs in clients/<client>.json). This script CREATES that
 * structure from scratch in a single atomic mutate (all-or-nothing):
 *
 *   1. a STANDARD daily budget for TESTING
 *   2. a STANDARD daily budget for WINNERS
 *   3. the TESTING Search campaign  (broad-match keyword discovery)
 *   4. the WINNERS Search campaign  (one EXACT ad group per proven winner)
 *   5. the seed ad group inside TESTING (where seed_keywords.ts adds broad seeds)
 *   6. a generic responsive search ad in that seed ad group, so the TESTING
 *      campaign can actually serve once enabled (an ad group with keywords but no
 *      ad never shows). The copy is intentionally generic brand/CTA text pulled
 *      from the client's `promotion` config — TESTING is for keyword discovery,
 *      not creative testing; each promoted winner gets its own keyword-tuned RSA.
 *
 * Both campaigns are created PAUSED so nothing can spend until a human enables
 * them in the Google Ads UI. Bidding defaults to MAXIMIZE_CLICKS so creation
 * never depends on conversion tracking existing yet (a fresh account usually has
 * none). Once the conversion action is recording, switch the campaigns to
 * Maximize Conversions (or add a target CPA) in the UI — see gaql.md §0 — or pass
 * `--bidding maximize_conversions` here if the account already has conversions.
 *
 * WRITE — gated behind --apply. validateOnly (dry-run) is the default. On --apply
 * the created IDs are written back into clients/<client>.json automatically.
 *
 * Usage:
 *   ts-node bootstrap_campaigns.ts --client conduit                       # dry-run
 *   ts-node bootstrap_campaigns.ts --client conduit --daily-budget 50     # dry-run, $50/day each
 *   ts-node bootstrap_campaigns.ts --client conduit --apply               # write (PAUSED campaigns)
 */
import * as fs from "fs";
import * as path from "path";
import { mutate, customerId } from "./client";
import { loadClientFromArgs, GoogleAdsClientConfig } from "./config";

export interface BootstrapInput {
  testingCampaignName: string;
  winnersCampaignName: string;
  dailyBudgetUsd: number;
  biddingStrategy?: "MAXIMIZE_CONVERSIONS" | "MAXIMIZE_CLICKS";
  // Seed RSA copy so the TESTING campaign can serve once enabled.
  landingPageUrl: string;
  brandHeadline: string;
  descriptions: [string, string, ...string[]];
  validateOnly?: boolean;
}

export interface BootstrapResult {
  testingBudgetId?: string;
  winnersBudgetId?: string;
  testingCampaignId?: string;
  winnersCampaignId?: string;
  testingAdGroupId?: string;
  testingAdId?: string;
  raw: any;
}

const MAX_HEADLINE_LENGTH = 30;

/** Trim a headline to <=30 chars on a word boundary where possible. */
function fitHeadline(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_HEADLINE_LENGTH) return normalized;
  const sliced = normalized.slice(0, MAX_HEADLINE_LENGTH).trimEnd();
  const lastSpace = sliced.lastIndexOf(" ");
  if (lastSpace >= 12) return sliced.slice(0, lastSpace);
  return sliced;
}

/**
 * Build at least 3 unique headlines for the TESTING seed RSA. An RSA requires
 * 3–15 headlines; we only have the brand headline from config, so the rest are
 * generic CTAs. This ad exists purely so the ad group serves — winners get their
 * own keyword-tuned creative in promote_winner.ts.
 */
function buildSeedHeadlines(brandHeadline: string): { text: string }[] {
  const used = new Set<string>();
  const out: { text: string }[] = [];
  const candidates = [
    brandHeadline,
    "Official Site",
    "Get Started Today",
    "Request A Demo",
    "Learn More",
    "See How It Works",
  ];
  for (const candidate of candidates) {
    const headline = fitHeadline(candidate);
    const key = headline.toLowerCase();
    if (headline && !used.has(key)) {
      used.add(key);
      out.push({ text: headline });
    }
    if (out.length >= 3) break;
  }
  return out;
}

const SEARCH_NETWORK = {
  targetGoogleSearch: true,
  targetSearchNetwork: false,
  targetContentNetwork: false,
  targetPartnerSearchNetwork: false,
};

// Temp resource ids (negative) are resolved within the single mutate request.
const TMP = {
  testingBudget: -1,
  winnersBudget: -2,
  testingCampaign: -3,
  winnersCampaign: -4,
  testingAdGroup: -5,
};

const lastSegment = (resourceName?: string): string | undefined =>
  resourceName ? resourceName.split("/").pop() : undefined;

/**
 * Write the freshly created campaign/ad-group IDs back into clients/<client>.json
 * so the rest of the loop (seed, daily, promote) can run with no manual edits.
 */
export function writeBackCampaignIds(
  clientKey: string,
  ids: { testingCampaignId?: string; testingAdGroupId?: string; winnersCampaignId?: string }
): string {
  const configPath = path.join(__dirname, "clients", `${clientKey}.json`);
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  raw.campaigns = raw.campaigns ?? {};
  if (ids.testingCampaignId) raw.campaigns.testing_campaign_id = ids.testingCampaignId;
  if (ids.testingAdGroupId) raw.campaigns.testing_ad_group_id = ids.testingAdGroupId;
  if (ids.winnersCampaignId) raw.campaigns.winners_campaign_id = ids.winnersCampaignId;
  fs.writeFileSync(configPath, `${JSON.stringify(raw, null, 2)}\n`);
  return configPath;
}

export async function bootstrapCampaigns(input: BootstrapInput): Promise<BootstrapResult> {
  const cid = customerId();
  const amountMicros = Math.round(input.dailyBudgetUsd * 1_000_000);
  const bidding = input.biddingStrategy ?? "MAXIMIZE_CLICKS";
  const biddingField = bidding === "MAXIMIZE_CLICKS"
    ? { targetSpend: {} }
    : { maximizeConversions: {} };

  const budgetRn = (id: number) => `customers/${cid}/campaignBudgets/${id}`;
  const campaignRn = (id: number) => `customers/${cid}/campaigns/${id}`;
  const adGroupRn = (id: number) => `customers/${cid}/adGroups/${id}`;

  const ops = [
    {
      campaignBudgetOperation: {
        create: {
          resourceName: budgetRn(TMP.testingBudget),
          name: `${input.testingCampaignName} budget`,
          amountMicros,
          deliveryMethod: "STANDARD",
          explicitlyShared: false,
        },
      },
    },
    {
      campaignBudgetOperation: {
        create: {
          resourceName: budgetRn(TMP.winnersBudget),
          name: `${input.winnersCampaignName} budget`,
          amountMicros,
          deliveryMethod: "STANDARD",
          explicitlyShared: false,
        },
      },
    },
    {
      campaignOperation: {
        create: {
          resourceName: campaignRn(TMP.testingCampaign),
          name: input.testingCampaignName,
          status: "PAUSED",
          advertisingChannelType: "SEARCH",
          campaignBudget: budgetRn(TMP.testingBudget),
          networkSettings: SEARCH_NETWORK,
          ...biddingField,
        },
      },
    },
    {
      campaignOperation: {
        create: {
          resourceName: campaignRn(TMP.winnersCampaign),
          name: input.winnersCampaignName,
          status: "PAUSED",
          advertisingChannelType: "SEARCH",
          campaignBudget: budgetRn(TMP.winnersBudget),
          networkSettings: SEARCH_NETWORK,
          ...biddingField,
        },
      },
    },
    {
      adGroupOperation: {
        create: {
          resourceName: adGroupRn(TMP.testingAdGroup),
          name: `${input.testingCampaignName}_seed`,
          campaign: campaignRn(TMP.testingCampaign),
          status: "ENABLED",
          type: "SEARCH_STANDARD",
        },
      },
    },
    {
      adGroupAdOperation: {
        create: {
          adGroup: adGroupRn(TMP.testingAdGroup),
          status: "ENABLED",
          ad: {
            finalUrls: [input.landingPageUrl],
            responsiveSearchAd: {
              headlines: buildSeedHeadlines(input.brandHeadline),
              descriptions: input.descriptions.map((text) => ({ text })),
            },
          },
        },
      },
    },
  ];

  const raw = await mutate(ops, input.validateOnly ?? true);
  const responses: any[] = raw?.mutateOperationResponses ?? [];

  return {
    testingBudgetId: lastSegment(responses[0]?.campaignBudgetResult?.resourceName),
    winnersBudgetId: lastSegment(responses[1]?.campaignBudgetResult?.resourceName),
    testingCampaignId: lastSegment(responses[2]?.campaignResult?.resourceName),
    winnersCampaignId: lastSegment(responses[3]?.campaignResult?.resourceName),
    testingAdGroupId: lastSegment(responses[4]?.adGroupResult?.resourceName),
    testingAdId: lastSegment(responses[5]?.adGroupAdResult?.resourceName),
    raw,
  };
}

if (require.main === module) {
  const { config, args } = loadClientFromArgs();
  if (!config) {
    console.error("Usage: ts-node bootstrap_campaigns.ts --client <client> [--daily-budget USD] [--bidding maximize_conversions] [--apply]");
    process.exit(1);
  }
  const c: GoogleAdsClientConfig = config;
  const apply = args.includes("--apply");

  let dailyBudgetUsd = 50;
  let biddingStrategy: "MAXIMIZE_CONVERSIONS" | "MAXIMIZE_CLICKS" = "MAXIMIZE_CLICKS";
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--daily-budget") {
      dailyBudgetUsd = Number(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--daily-budget=")) {
      dailyBudgetUsd = Number(arg.slice("--daily-budget=".length));
      continue;
    }
    if (arg === "--bidding") {
      biddingStrategy = args[i + 1] === "maximize_conversions" ? "MAXIMIZE_CONVERSIONS" : "MAXIMIZE_CLICKS";
      i += 1;
      continue;
    }
  }
  if (!Number.isFinite(dailyBudgetUsd) || dailyBudgetUsd <= 0) {
    console.error("Invalid --daily-budget; pass a positive number of USD.");
    process.exit(1);
  }

  bootstrapCampaigns({
    testingCampaignName: c.campaigns.testing_campaign_name,
    winnersCampaignName: c.campaigns.winners_campaign_name,
    dailyBudgetUsd,
    biddingStrategy,
    landingPageUrl: c.promotion.landing_page_url,
    brandHeadline: c.promotion.brand_headline,
    descriptions: c.promotion.descriptions,
    validateOnly: !apply,
  })
    .then((r) => {
      console.log(apply ? "Applied:" : "Dry-run OK (validateOnly):");
      console.log(JSON.stringify(r.raw, null, 2));
      if (apply) {
        const ids = {
          testing_campaign_id: r.testingCampaignId,
          testing_ad_group_id: r.testingAdGroupId,
          winners_campaign_id: r.winnersCampaignId,
        };
        if (r.testingCampaignId && r.testingAdGroupId && r.winnersCampaignId) {
          const configPath = writeBackCampaignIds(c.client_key, r);
          console.log(`\nWrote campaign IDs back into ${configPath}:`);
          console.log(JSON.stringify(ids, null, 2));
        } else {
          console.warn("\nCould not parse all created IDs from the response. Set these manually in clients/" + c.client_key + ".json:");
          console.warn(JSON.stringify(ids, null, 2));
        }
        console.log("\nCampaigns were created PAUSED. Next: `npm run seed -- --client " + c.client_key + " --seeds seeds/" + c.client_key + ".json --apply`, then enable the campaigns in the Google Ads UI.");
      } else {
        console.log("\nDry-run only. Re-run with --apply to create the campaigns (PAUSED) and write their IDs into clients/" + c.client_key + ".json.");
      }
    })
    .catch((e) => { console.error(e); process.exit(1); });
}
