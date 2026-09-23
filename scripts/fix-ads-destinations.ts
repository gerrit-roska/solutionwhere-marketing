import { mutate, search } from "../packages/core/src/ads/client";

const SITE = "https://home.solutionwhere.com";
const PD = `${SITE}/professional-development`;
const ENR = `${SITE}/enrollments`;
const CCH = `${SITE}/coaching`;
const REF = `${SITE}/referrals`;
const RECERT = `${SITE}/blog/keep-track-of-ceus-and-professional-development-records-for-recertification`;
const AZ = `${SITE}/blog/steps-to-arizona-teaching-certification`;

const EXACT: Record<string, string> = {
  [`${SITE}/act-48`]: PD,
  [`${SITE}/scech`]: PD,
  [`${SITE}/ctle`]: PD,
  [`${SITE}/lpdc`]: PD,
  [`${SITE}/blog/steps-to-arizona-teacher-certification`]: AZ,
  [`${SITE}/blog/steps-to-texas-teacher-certification`]: RECERT,
  [`${SITE}/blog/steps-to-illinois-teacher-certification`]: RECERT,
};

const COMPARE_TO_MODULE: Record<string, string> = {
  "frontline-professional-growth": PD,
  mylearningplan: PD,
  "vector-solutions": PD,
  kalpa: PD,
  escworks: PD,
  pdplanner: PD,
  "schooldata-net": PD,
  growelab: PD,
  plad: PD,
  schoolmint: ENR,
  "powerschool-enrollment": ENR,
  "infinite-campus-online-registration": ENR,
  avela: ENR,
  enrollwise: ENR,
  edbrix: ENR,
  sibme: CCH,
  "kickup-learning": CCH,
  "kickup-foundations": CCH,
  teachboost: CCH,
  "schoolstatus-coach": CCH,
  edthena: CCH,
  "iris-connect": CCH,
  "whetstone-education": CCH,
  bullseye: CCH,
  "worklife-systems": REF,
  icarol: REF,
  kindersystems: REF,
  bridgecare: REF,
  wonderschool: REF,
  insight: REF,
};

function rewriteUrl(url: string): string | null {
  const stripped = url.split("?")[0].replace(/\/$/, "");
  if (EXACT[stripped]) return EXACT[stripped];
  const compare = stripped.match(
    /^https:\/\/home\.solutionwhere\.com\/compare\/solutionwhere-vs-(.+)$/,
  );
  if (compare) return COMPARE_TO_MODULE[compare[1]] ?? PD;
  return null;
}

const dry = process.argv.includes("--validate");

interface TextAsset {
  text?: string;
  pinnedField?: string;
}

interface AdRow {
  adGroup: { resourceName: string };
  adGroupAd: {
    resourceName: string;
    ad?: {
      finalUrls?: string[];
      responsiveSearchAd?: {
        headlines?: TextAsset[];
        descriptions?: TextAsset[];
        path1?: string;
        path2?: string;
      };
    };
  };
}

interface KeywordRow {
  adGroupCriterion: {
    resourceName: string;
    finalUrls?: string[];
  };
}

async function apply(label: string, ops: unknown[]): Promise<void> {
  if (ops.length === 0) {
    console.log(`${label}: nothing to do`);
    return;
  }
  console.log(`${label}: ${ops.length} ops (${dry ? "validate" : "apply"})`);
  const result = await mutate(ops, dry);
  console.log(`${label}: ok`, JSON.stringify(result).slice(0, 600));
}

async function main(): Promise<void> {
  const ads = (await search(`
    SELECT
      ad_group.resource_name,
      ad_group_ad.resource_name,
      ad_group_ad.ad.final_urls,
      ad_group_ad.ad.responsive_search_ad.headlines,
      ad_group_ad.ad.responsive_search_ad.descriptions,
      ad_group_ad.ad.responsive_search_ad.path1,
      ad_group_ad.ad.responsive_search_ad.path2
    FROM ad_group_ad
    WHERE campaign.status != "REMOVED"
      AND ad_group_ad.status != "REMOVED"
      AND ad_group_ad.ad.type = "RESPONSIVE_SEARCH_AD"
  `)) as AdRow[];

  const adOps: unknown[] = [];
  for (const row of ads) {
    const urls = row.adGroupAd.ad?.finalUrls ?? [];
    const next = urls.map((u) => rewriteUrl(u) ?? u);
    if (!next.some((u, i) => u !== urls[i])) continue;
    const rsa = row.adGroupAd.ad?.responsiveSearchAd;
    if (!rsa) {
      console.warn("skip (no RSA payload)", row.adGroupAd.resourceName);
      continue;
    }
    console.log(`replace ${urls.join(",")} → ${next.join(",")}`);
    adOps.push({
      adGroupAdOperation: {
        create: {
          adGroup: row.adGroup.resourceName,
          status: "ENABLED",
          ad: {
            finalUrls: next,
            responsiveSearchAd: {
              headlines: (rsa.headlines ?? []).map((h) => ({
                text: h.text,
                ...(h.pinnedField ? { pinnedField: h.pinnedField } : {}),
              })),
              descriptions: (rsa.descriptions ?? []).map((d) => ({
                text: d.text,
                ...(d.pinnedField ? { pinnedField: d.pinnedField } : {}),
              })),
              ...(rsa.path1 ? { path1: rsa.path1 } : {}),
              ...(rsa.path2 ? { path2: rsa.path2 } : {}),
            },
          },
        },
      },
    });
    adOps.push({
      adGroupAdOperation: {
        update: {
          resourceName: row.adGroupAd.resourceName,
          status: "PAUSED",
        },
        updateMask: "status",
      },
    });
  }

  const keywords = (await search(`
    SELECT
      ad_group_criterion.resource_name,
      ad_group_criterion.final_urls
    FROM ad_group_criterion
    WHERE campaign.status != "REMOVED"
      AND ad_group_criterion.type = "KEYWORD"
      AND ad_group_criterion.status != "REMOVED"
  `)) as KeywordRow[];

  const kwOps: unknown[] = [];
  for (const row of keywords) {
    const urls = row.adGroupCriterion.finalUrls ?? [];
    if (urls.length === 0) continue;
    const next = urls.map((u) => rewriteUrl(u) ?? u);
    if (!next.some((u, i) => u !== urls[i])) continue;
    kwOps.push({
      adGroupCriterionOperation: {
        update: {
          resourceName: row.adGroupCriterion.resourceName,
          finalUrls: next,
        },
        updateMask: "final_urls",
      },
    });
  }

  await apply("keywords", kwOps);
  await apply("ads replace+pause", adOps);

  console.log("Skipping conversion_action mutate for Google-hosted/codeless actions.");
  const goals = (await search(`
    SELECT
      customer_conversion_goal.resource_name,
      customer_conversion_goal.category,
      customer_conversion_goal.origin,
      customer_conversion_goal.biddable
    FROM customer_conversion_goal
  `)) as {
    customerConversionGoal: {
      resourceName: string;
      category?: string;
      origin?: string;
      biddable?: boolean;
    };
  }[];
  console.log("customer conversion goals:", JSON.stringify(goals, null, 2));

  const goalOps: unknown[] = [];
  for (const row of goals) {
    const g = row.customerConversionGoal;
    const demoteGoal =
      (g.category === "SUBMIT_LEAD_FORM" && g.origin === "GOOGLE_HOSTED") ||
      (g.category === "SUBMIT_LEAD_FORM" && g.origin === "WEBSITE");
    if (!demoteGoal || g.biddable === false) continue;
    goalOps.push({
      customerConversionGoalOperation: {
        update: {
          resourceName: g.resourceName,
          biddable: false,
        },
        updateMask: "biddable",
      },
    });
  }
  await apply("customer conversion goals", goalOps);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
