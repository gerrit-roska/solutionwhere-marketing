import { getDb } from "../db";
import { createAdSet, createCampaign, listAdSets, listCampaigns } from "./client";
import type { FbConfig } from "./config";

// The 04 §6 campaign structure, adopt-first (same rule as ads/bootstrap.ts:
// never duplicate an existing campaign). CAMP 01 | Andromeda with one broad
// Advantage+ ad set per module. Everything is created PAUSED; budgets live
// at ad-set level. CAMP 02 (retargeting) and CAMP 03 (ABM) are out of scope
// here — they need audiences that don't exist yet (pixel live 2026-09-16).
//
// Resolution is recorded in the shared ads_resources ledger
// (resource_type fb_campaign / fb_adset), same as the Google bootstrap.

export interface StructureResolution {
  campaignId: string | null;
  /** module -> ad set id; only modules with a resolved id are present. */
  adSetIds: Record<string, string>;
  adopted: string[];
  created: string[];
  planned: string[];
  errors: string[];
}

async function ledger(
  resourceType: string,
  name: string,
  status: string,
  resourceName?: string,
  detail?: unknown,
): Promise<void> {
  await getDb()
    .insertInto("ads_resources")
    .values({
      resource_type: resourceType,
      plan_key: "camp01",
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

/**
 * Resolve CAMP 01 and its module ad sets to live ids. Dry-run (apply=false)
 * performs reads only — Meta has no validate-only mutate, so "planned" here
 * means "would create", never "validated against the API".
 */
export async function resolveStructure(
  config: FbConfig,
  apply: boolean,
): Promise<StructureResolution> {
  const result: StructureResolution = {
    campaignId: null,
    adSetIds: {},
    adopted: [],
    created: [],
    planned: [],
    errors: [],
  };

  const [campaigns, adSets] = await Promise.all([listCampaigns(), listAdSets()]);

  const existingCampaign = campaigns.find((c) => c.name === config.campaign.name);
  if (existingCampaign) {
    result.campaignId = existingCampaign.id;
    result.adopted.push(`campaign:${config.campaign.name}`);
    await ledger("fb_campaign", config.campaign.name, "adopted", existingCampaign.id);
  } else if (!apply) {
    result.planned.push(`campaign:${config.campaign.name}`);
    await ledger("fb_campaign", config.campaign.name, "planned", undefined, {
      objective: config.campaign.objective,
    });
  } else {
    const created = await createCampaign({
      name: config.campaign.name,
      objective: config.campaign.objective,
    });
    result.campaignId = created.id;
    result.created.push(`campaign:${config.campaign.name}`);
    await ledger("fb_campaign", config.campaign.name, "created", created.id);
  }

  for (const [module, adSetName] of Object.entries(config.campaign.adSetsByModule)) {
    const existing = adSets.find(
      (s) =>
        s.name === adSetName &&
        (result.campaignId === null || s.campaignId === result.campaignId),
    );
    if (existing) {
      result.adSetIds[module] = existing.id;
      result.adopted.push(`adset:${adSetName}`);
      await ledger("fb_adset", adSetName, "adopted", existing.id);
      continue;
    }
    if (!apply || !result.campaignId) {
      // Dry-run, or the campaign itself is only planned — no id to nest under.
      result.planned.push(`adset:${adSetName}`);
      await ledger("fb_adset", adSetName, "planned", undefined, {
        module,
        dailyBudgetUsd: config.campaign.dailyBudgetPerAdSetUsd,
      });
      continue;
    }
    const created = await createAdSet({
      name: adSetName,
      campaignId: result.campaignId,
      dailyBudgetUsd: config.campaign.dailyBudgetPerAdSetUsd,
      pixelId: config.pixelId,
      optimizationEvent: config.campaign.optimizationEvent,
      geoCountries: config.campaign.geoCountries,
      excludedCustomAudienceIds: config.campaign.excludedCustomAudienceIds,
    });
    result.adSetIds[module] = created.id;
    result.created.push(`adset:${adSetName}`);
    await ledger("fb_adset", adSetName, "created", created.id, { module });
  }

  return result;
}
