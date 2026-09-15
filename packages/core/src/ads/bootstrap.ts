// Bootstrap/reconcile for the Solutionwhere Google Ads account, following
// the Conduit reference: ADOPT-FIRST (never duplicate an existing campaign),
// PAUSED-first creation, one atomic mutate per campaign, validate-only by
// default, writes gated behind an explicit apply flag.
//
// The plan being reconciled is docs/03-google-ads-execution.md encoded in
// ./plan.ts. Hard gates from the spec that this module enforces:
//   - Search network only, partners + display off (03 §6.1)
//   - Manual CPC, enhanced CPC off (03 §6.1)
//   - Presence-only geo targeting (03 §6.1)
//   - Mon–Fri 6:00–18:00 ad schedule (03 §6.1)
//   - Everything created PAUSED; REF campaign is neverLaunch (03 §3.6)
//   - Shared negative lists exist before any campaign attaches them (03 §4)

import { getDb } from "../db";
import {
  customerId,
  mutate,
  rn,
  search,
  suggestGeoTargets,
  toMicros,
} from "./client";
import { googleAdsReady } from "./config";
import {
  AD_SCHEDULE,
  CALL_ASSET,
  CALLOUTS,
  CAMPAIGNS,
  GEO_MODIFIERS,
  NEGATIVE_LISTS,
  SITELINKS,
  STRUCTURED_SNIPPETS,
  validatePlan,
  type AdGroupPlan,
  type CampaignPlan,
  type NegativeListPlan,
} from "./plan";

const US_GEO_TARGET = "geoTargetConstants/2840";
const ENGLISH = "languageConstants/1000";

export interface ReconcileReport {
  mode: "no-credentials" | "validate-only" | "apply";
  planErrors: string[];
  campaignsPlanned: number;
  adGroupsPlanned: number;
  keywordsPlanned: number;
  negativeListsPlanned: number;
  adopted: string[];
  created: string[];
  errors: string[];
}

async function ledger(
  resourceType: string,
  planKey: string,
  name: string,
  status: string,
  resourceName?: string,
  detail?: unknown,
): Promise<void> {
  const db = getDb();
  await db
    .insertInto("ads_resources")
    .values({
      resource_type: resourceType,
      plan_key: planKey,
      name,
      status,
      resource_name: resourceName ?? null,
      detail: detail ? JSON.stringify(detail) : null,
    })
    .onConflict((oc) =>
      oc.columns(["resource_type", "plan_key", "name"]).doUpdateSet({
        status,
        resource_name: resourceName ?? null,
        detail: detail ? JSON.stringify(detail) : null,
        updated_at: new Date(),
      }),
    )
    .execute();
}

/** Adopt-first: campaigns and shared sets that already exist, by name. */
async function findExisting(): Promise<{
  campaigns: Map<string, string>;
  sharedSets: Map<string, string>;
}> {
  const campaignRows = (await search(`
    SELECT campaign.id, campaign.name FROM campaign
    WHERE campaign.status != 'REMOVED'
  `)) as { campaign: { id: string; name: string } }[];
  const setRows = (await search(`
    SELECT shared_set.id, shared_set.name FROM shared_set
    WHERE shared_set.status != 'REMOVED'
  `)) as { sharedSet: { id: string; name: string } }[];
  return {
    campaigns: new Map(
      campaignRows.map((r) => [String(r.campaign.name), String(r.campaign.id)]),
    ),
    sharedSets: new Map(
      setRows.map((r) => [String(r.sharedSet.name), String(r.sharedSet.id)]),
    ),
  };
}

function campaignOps(
  campaign: CampaignPlan,
  cid: string,
  geoTargets: Map<string, string>,
  tmp: { budget: number; campaign: number },
): unknown[] {
  const budgetRn = rn.campaignBudget(cid, tmp.budget);
  const campaignRn = rn.campaign(cid, tmp.campaign);
  const ops: unknown[] = [
    {
      campaignBudgetOperation: {
        create: {
          resourceName: budgetRn,
          name: `${campaign.name} budget`,
          amountMicros: toMicros(campaign.monthlyBudgetUsd / 30.4),
          deliveryMethod: "STANDARD",
          explicitlyShared: false,
        },
      },
    },
    {
      campaignOperation: {
        create: {
          resourceName: campaignRn,
          name: campaign.name,
          status: "PAUSED",
          advertisingChannelType: "SEARCH",
          campaignBudget: budgetRn,
          containsEuPoliticalAdvertising: "DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING",
          networkSettings: {
            targetGoogleSearch: true,
            targetSearchNetwork: false,
            targetContentNetwork: false,
            targetPartnerSearchNetwork: false,
          },
          manualCpc: { enhancedCpcEnabled: false },
          geoTargetTypeSetting: {
            positiveGeoTargetType: "PRESENCE",
            negativeGeoTargetType: "PRESENCE",
          },
        },
      },
    },
    // US targeting, presence-only (03 §6.1)
    {
      campaignCriterionOperation: {
        create: {
          campaign: campaignRn,
          location: { geoTargetConstant: US_GEO_TARGET },
        },
      },
    },
    {
      campaignCriterionOperation: {
        create: {
          campaign: campaignRn,
          language: { languageConstant: ENGLISH },
        },
      },
    },
    // Ad schedule Mon–Fri 6:00–18:00, account timezone (03 §6.1)
    ...AD_SCHEDULE.days.map((day) => ({
      campaignCriterionOperation: {
        create: {
          campaign: campaignRn,
          adSchedule: {
            dayOfWeek: day,
            startHour: AD_SCHEDULE.startHour,
            startMinute: "ZERO",
            endHour: AD_SCHEDULE.endHour,
            endMinute: "ZERO",
          },
        },
      },
    })),
  ];
  // §6.2 geo bid modifiers — only where the name resolved to a constant.
  for (const geo of GEO_MODIFIERS) {
    const target = geoTargets.get(geo.name);
    if (!target) continue;
    ops.push({
      campaignCriterionOperation: {
        create: {
          campaign: campaignRn,
          location: { geoTargetConstant: target },
          bidModifier: geo.modifier,
        },
      },
    });
  }
  return ops;
}

function adGroupOps(
  group: AdGroupPlan,
  cid: string,
  campaignRn: string,
  tmpAdGroupId: number,
): unknown[] {
  const adGroupRn = rn.adGroup(cid, tmpAdGroupId);
  const ops: unknown[] = [
    {
      adGroupOperation: {
        create: {
          resourceName: adGroupRn,
          name: group.name,
          campaign: campaignRn,
          status: "ENABLED",
          type: "SEARCH_STANDARD",
          cpcBidMicros: toMicros(group.cpcUsd),
        },
      },
    },
    ...group.keywords.map((keyword) => ({
      adGroupCriterionOperation: {
        create: {
          adGroup: adGroupRn,
          status: "ENABLED",
          keyword: { text: keyword.text, matchType: keyword.match },
          cpcBidMicros: toMicros(keyword.cpcUsd ?? group.cpcUsd),
          ...(keyword.finalUrl ? { finalUrls: [keyword.finalUrl] } : {}),
        },
      },
    })),
    ...(group.negatives ?? []).map((term) => ({
      adGroupCriterionOperation: {
        create: {
          adGroup: adGroupRn,
          negative: true,
          keyword: { text: term, matchType: "BROAD" },
        },
      },
    })),
    {
      adGroupAdOperation: {
        create: {
          adGroup: adGroupRn,
          status: "ENABLED",
          ad: {
            finalUrls: [group.finalUrl],
            responsiveSearchAd: {
              headlines: group.rsa.headlines.map((text) => ({ text })),
              descriptions: group.rsa.descriptions.map((text) => ({ text })),
              ...(group.rsa.path1 ? { path1: group.rsa.path1 } : {}),
              ...(group.rsa.path2 ? { path2: group.rsa.path2 } : {}),
            },
          },
        },
      },
    },
  ];
  return ops;
}

function sharedSetOps(
  cid: string,
  lists: NegativeListPlan[],
  tmpStart: number,
): unknown[] {
  const ops: unknown[] = [];
  let next = tmpStart;
  for (const list of lists) {
    const setRn = rn.sharedSet(cid, next);
    next -= 1;
    ops.push({
      sharedSetOperation: {
        create: {
          resourceName: setRn,
          name: list.name,
          type: "NEGATIVE_KEYWORDS",
        },
      },
    });
    for (const term of list.terms) {
      ops.push({
        sharedCriterionOperation: {
          create: {
            sharedSet: setRn,
            keyword: { text: term, matchType: "BROAD" },
          },
        },
      });
    }
  }
  return ops;
}

function assetOps(cid: string, tmpStart: number): unknown[] {
  const ops: unknown[] = [];
  let next = tmpStart;
  const link = (assetRn: string, fieldType: string) => ({
    customerAssetOperation: { create: { asset: assetRn, fieldType } },
  });
  for (const s of SITELINKS) {
    const assetRn = rn.asset(cid, next);
    next -= 1;
    ops.push(
      {
        assetOperation: {
          create: {
            resourceName: assetRn,
            sitelinkAsset: {
              linkText: s.text,
              description1: s.desc1,
              description2: s.desc2,
            },
            finalUrls: [s.url],
          },
        },
      },
      link(assetRn, "SITELINK"),
    );
  }
  for (const text of CALLOUTS) {
    const assetRn = rn.asset(cid, next);
    next -= 1;
    ops.push(
      { assetOperation: { create: { resourceName: assetRn, calloutAsset: { calloutText: text } } } },
      link(assetRn, "CALLOUT"),
    );
  }
  for (const snippet of STRUCTURED_SNIPPETS) {
    const assetRn = rn.asset(cid, next);
    next -= 1;
    ops.push(
      {
        assetOperation: {
          create: {
            resourceName: assetRn,
            structuredSnippetAsset: {
              header: snippet.header,
              values: snippet.values,
            },
          },
        },
      },
      link(assetRn, "STRUCTURED_SNIPPET"),
    );
  }
  const callRn = rn.asset(cid, next);
  ops.push(
    {
      assetOperation: {
        create: {
          resourceName: callRn,
          callAsset: {
            countryCode: "US",
            phoneNumber: CALL_ASSET.phoneNumber.replace(/^\+1\s?/, ""),
            adScheduleTargets: AD_SCHEDULE.days.map((day) => ({
              dayOfWeek: day,
              startHour: CALL_ASSET.startHour,
              startMinute: "THIRTY",
              endHour: CALL_ASSET.endHour,
              endMinute: "ZERO",
            })),
          },
        },
      },
    },
    link(callRn, "CALL"),
  );
  return ops;
}

/**
 * Reconcile the account against the plan. Default is validate-only: every
 * mutate is sent with validateOnly=true, so Google checks the full request
 * (auth, structure, policy) without writing anything. Pass apply=true only
 * when the developer token is provisioned and a human has approved spend.
 */
export async function reconcileGoogleAds(apply = false): Promise<ReconcileReport> {
  const planErrors = validatePlan();
  const report: ReconcileReport = {
    mode: apply ? "apply" : "validate-only",
    planErrors,
    campaignsPlanned: CAMPAIGNS.length,
    adGroupsPlanned: CAMPAIGNS.reduce((n, c) => n + c.adGroups.length, 0),
    keywordsPlanned: CAMPAIGNS.reduce(
      (n, c) => n + c.adGroups.reduce((m, g) => m + g.keywords.length, 0),
      0,
    ),
    negativeListsPlanned: NEGATIVE_LISTS.length,
    adopted: [],
    created: [],
    errors: [],
  };
  if (planErrors.length > 0) return report;

  if (!googleAdsReady()) {
    report.mode = "no-credentials";
    return report;
  }

  const cid = customerId();
  const validateOnly = !apply;

  // Geo modifier names → constants. Failure degrades to "no modifiers",
  // never blocks the build.
  let geoTargets = new Map<string, string>();
  try {
    geoTargets = await suggestGeoTargets(GEO_MODIFIERS.map((g) => g.name));
  } catch (error) {
    report.errors.push(
      `geo target resolution failed (modifiers skipped): ${error instanceof Error ? error.message : error}`,
    );
  }

  const existing = await findExisting();

  // Shared negative lists first (03 §4: before any campaign goes live).
  const missingLists = NEGATIVE_LISTS.filter((l) => !existing.sharedSets.has(l.name));
  const listResourceNames = new Map<string, string>();
  for (const [name, id] of existing.sharedSets) {
    const list = NEGATIVE_LISTS.find((l) => l.name === name);
    if (list) {
      listResourceNames.set(list.key, rn.sharedSet(cid, id));
      report.adopted.push(`shared-set:${name}`);
      await ledger("shared_set", list.key, name, "adopted", rn.sharedSet(cid, id));
    }
  }
  if (missingLists.length > 0) {
    try {
      await mutate(sharedSetOps(cid, missingLists, -1000), validateOnly);
      for (const list of missingLists) {
        report.created.push(`shared-set:${list.name}`);
        await ledger("shared_set", list.key, list.name, apply ? "created" : "validated");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.errors.push(`shared sets: ${message}`);
      for (const list of missingLists) {
        await ledger("shared_set", list.key, list.name, "error", undefined, message);
      }
      return report; // campaigns attach these lists — stop here on failure
    }
    // In apply mode, re-read to get real resource names for attachments.
    if (apply) {
      const after = await findExisting();
      for (const list of missingLists) {
        const id = after.sharedSets.get(list.name);
        if (id) listResourceNames.set(list.key, rn.sharedSet(cid, id));
      }
    }
  }

  // Account-level assets (03 §7.9), once.
  try {
    await mutate(assetOps(cid, -5000), validateOnly);
    report.created.push("account-assets");
    await ledger("asset", "account", "sitelinks/callouts/snippets/call", apply ? "created" : "validated");
  } catch (error) {
    report.errors.push(`assets: ${error instanceof Error ? error.message : error}`);
  }

  // Campaigns: adopt by name, otherwise one atomic mutate per campaign.
  let tmp = -1;
  for (const campaign of CAMPAIGNS) {
    const existingId = existing.campaigns.get(campaign.name);
    if (existingId) {
      report.adopted.push(`campaign:${campaign.name}`);
      await ledger("campaign", campaign.key, campaign.name, "adopted", rn.campaign(cid, existingId));
      continue;
    }
    const budgetTmp = tmp;
    const campaignTmp = tmp - 1;
    tmp -= 2;
    const campaignRn = rn.campaign(cid, campaignTmp);
    const ops: unknown[] = [
      ...campaignOps(campaign, cid, geoTargets, { budget: budgetTmp, campaign: campaignTmp }),
    ];
    for (const group of campaign.adGroups) {
      ops.push(...adGroupOps(group, cid, campaignRn, tmp));
      tmp -= 1;
    }
    // Attach the shared negative lists this campaign takes (03 §4).
    for (const list of NEGATIVE_LISTS) {
      const applies =
        list.appliesTo === "ALL" || list.appliesTo.includes(campaign.key);
      if (!applies) continue;
      const setRn = listResourceNames.get(list.key);
      if (!setRn) continue; // validate-only: set has no real name yet
      ops.push({
        campaignSharedSetOperation: {
          create: { campaign: campaignRn, sharedSet: setRn },
        },
      });
    }
    try {
      await mutate(ops, validateOnly);
      report.created.push(`campaign:${campaign.name}`);
      await ledger("campaign", campaign.key, campaign.name, apply ? "created" : "validated", undefined, {
        adGroups: campaign.adGroups.length,
        keywords: campaign.adGroups.reduce((n, g) => n + g.keywords.length, 0),
        neverLaunch: campaign.neverLaunch ?? false,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      report.errors.push(`${campaign.name}: ${message}`);
      await ledger("campaign", campaign.key, campaign.name, "error", undefined, message);
    }
  }

  return report;
}
