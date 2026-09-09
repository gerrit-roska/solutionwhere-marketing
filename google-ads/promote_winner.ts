/**
 * promote_winner.ts — Step 2 of the loop (the promotion transaction).
 *
 * For one winning keyword, in ONE atomic mutate (all-or-nothing):
 *   a. add it as an EXACT campaign-level negative on TESTING
 *   b. create a new ad group in WINNERS named after the keyword
 *   c. add the keyword as EXACT match (positive) in that ad group
 *   d. create the RSA in that ad group with the keyword woven into the headlines
 *
 * c/d reference the ad group created in (b) via a temp resource name (id -1), so the
 * whole promotion either lands together or not at all.
 *
 * WRITE — gate behind approval. validateOnly defaults to true (dry-run).
 */
import { mutate, customerId, rn, titleCase, truncate, toKeywordText } from "./client";
import { loadClientFromArgs } from "./config";

const MAX_HEADLINE_LENGTH = 30;

export interface PromoteInput {
  winnerKeyword: string;
  testingCampaignId: string | number;
  winnersCampaignId: string | number;
  landingPageUrl: string;
  brandHeadline: string;
  descriptions: [string, string, ...string[]];
  validateOnly?: boolean;
}

function fitHeadline(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= MAX_HEADLINE_LENGTH) return normalized;

  const sliced = normalized.slice(0, MAX_HEADLINE_LENGTH).trimEnd();
  const lastSpace = sliced.lastIndexOf(" ");
  if (lastSpace >= 12) return sliced.slice(0, lastSpace);
  return sliced;
}

function pickHeadline(candidates: string[], used: Set<string>): string {
  for (const candidate of candidates) {
    const headline = fitHeadline(candidate);
    if (headline && !used.has(headline.toLowerCase())) {
      used.add(headline.toLowerCase());
      return headline;
    }
  }

  throw new Error("Unable to generate a unique Google Ads headline.");
}

function buildHeadlines(keyword: string, brandHeadline: string) {
  const used = new Set<string>();
  const keywordTitle = titleCase(keyword);
  const headline1 = pickHeadline([keywordTitle, "Target Keyword"], used);
  const headline2 = pickHeadline(
    [`${keywordTitle} - Free Quote`, "Get A Free Quote", "Free Quote"],
    used
  );
  const headline3 = pickHeadline(
    [brandHeadline, "Learn More Today", "Get Started"],
    used
  );

  return [
    { text: truncate(headline1, 30), pinnedField: "HEADLINE_1" },
    { text: truncate(headline2, 30) },
    { text: truncate(headline3, 30) },
  ];
}

export async function promoteWinner(input: PromoteInput): Promise<any> {
  const cid = customerId();
  // Search terms aren't always valid keyword text (length/word/symbol limits).
  const kw = toKeywordText(input.winnerKeyword);
  if (!kw) {
    throw new Error(
      `Winner "${input.winnerKeyword}" cannot be used as keyword text ` +
        "(over 80 chars / 10 words after cleaning). Promote it manually if it matters."
    );
  }
  const tempAdGroup = rn.adGroup(cid, -1); // temp id, resolved within the request
  const headlines = buildHeadlines(kw, input.brandHeadline);

  const ops = [
    // (a) stop TESTING re-spending on the proven winner
    {
      campaignCriterionOperation: {
        create: {
          campaign: rn.campaign(cid, input.testingCampaignId),
          negative: true,
          keyword: { text: kw, matchType: "EXACT" },
        },
      },
    },
    // (b) new WINNERS ad group
    {
      adGroupOperation: {
        create: {
          resourceName: tempAdGroup,
          name: `EXACT | ${kw}`,
          campaign: rn.campaign(cid, input.winnersCampaignId),
          status: "ENABLED",
          type: "SEARCH_STANDARD",
        },
      },
    },
    // (c) the EXACT positive keyword in that ad group
    {
      adGroupCriterionOperation: {
        create: {
          adGroup: tempAdGroup,
          status: "ENABLED",
          keyword: { text: kw, matchType: "EXACT" },
        },
      },
    },
    // (d) the RSA, keyword pinned into headline 1
    {
      adGroupAdOperation: {
        create: {
          adGroup: tempAdGroup,
          status: "ENABLED",
          ad: {
            finalUrls: [input.landingPageUrl],
            responsiveSearchAd: {
              headlines,
              descriptions: input.descriptions.map((text) => ({ text })),
            },
          },
        },
      },
    },
  ];

  return mutate(ops, input.validateOnly ?? true);
}

if (require.main === module) {
  const { config, args } = loadClientFromArgs();
  const apply = args.includes("--apply");
  const positional: string[] = [];
  const descriptions: string[] = [];
  let winnerKeyword: string | undefined;
  let testingCampaignId: string | undefined;
  let winnersCampaignId: string | undefined;
  let landingPageUrl: string | undefined;
  let brandHeadline: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--apply") continue;
    if (arg === "--keyword") {
      winnerKeyword = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--keyword=")) {
      winnerKeyword = arg.slice("--keyword=".length);
      continue;
    }
    if (arg === "--testing-campaign-id") {
      testingCampaignId = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--testing-campaign-id=")) {
      testingCampaignId = arg.slice("--testing-campaign-id=".length);
      continue;
    }
    if (arg === "--winners-campaign-id") {
      winnersCampaignId = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--winners-campaign-id=")) {
      winnersCampaignId = arg.slice("--winners-campaign-id=".length);
      continue;
    }
    if (arg === "--landing-page-url") {
      landingPageUrl = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--landing-page-url=")) {
      landingPageUrl = arg.slice("--landing-page-url=".length);
      continue;
    }
    if (arg === "--brand-headline") {
      brandHeadline = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--brand-headline=")) {
      brandHeadline = arg.slice("--brand-headline=".length);
      continue;
    }
    if (arg === "--description") {
      descriptions.push(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg.startsWith("--description=")) {
      descriptions.push(arg.slice("--description=".length));
      continue;
    }
    positional.push(arg);
  }

  winnerKeyword = winnerKeyword ?? positional[0];
  testingCampaignId = testingCampaignId ?? config?.campaigns.testing_campaign_id ?? process.env.TESTING_CAMPAIGN_ID;
  winnersCampaignId = winnersCampaignId ?? config?.campaigns.winners_campaign_id ?? process.env.WINNERS_CAMPAIGN_ID;
  landingPageUrl = landingPageUrl ?? config?.promotion.landing_page_url ?? process.env.LANDING_PAGE_URL;
  brandHeadline = brandHeadline ?? config?.promotion.brand_headline ?? process.env.BRAND_HEADLINE;
  const rsaDescriptions =
    descriptions.length > 0
      ? descriptions
      : config?.promotion.descriptions ??
        (process.env.PROMOTION_DESCRIPTIONS
          ? JSON.parse(process.env.PROMOTION_DESCRIPTIONS)
          : undefined);

  if (
    !winnerKeyword ||
    !testingCampaignId ||
    !winnersCampaignId ||
    !landingPageUrl ||
    !brandHeadline ||
    !Array.isArray(rsaDescriptions) ||
    rsaDescriptions.length < 2
  ) {
    console.error(
      "Usage: ts-node promote_winner.ts [--client <client>] --keyword <term> [--apply]"
    );
    console.error(
      "Requires testing/winners campaign IDs, landing page URL, brand headline, and at least two descriptions from client config or env."
    );
    process.exit(1);
  }

  promoteWinner({
    winnerKeyword,
    testingCampaignId,
    winnersCampaignId,
    landingPageUrl,
    brandHeadline,
    descriptions: rsaDescriptions as [string, string, ...string[]],
    validateOnly: apply ? false : config?.safety.default_validate_only ?? true,
  })
    .then((r) => {
      console.log(apply ? "Applied:" : "Dry-run OK:", JSON.stringify(r, null, 2));
      if (!apply) console.log("Dry-run only. Re-run with --apply to write changes.");
    })
    .catch((e) => { console.error(e); process.exit(1); });
}
