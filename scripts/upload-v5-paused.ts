import { readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createAd,
  createAdSet,
  createCampaign,
  createImageAdCreative,
  fbGet,
  fbPost,
  listAdSets,
  listCampaigns,
  uploadAdImage,
} from "../packages/core/src/fb/client";
import { adAccountPath, fbEnv, loadFbConfig } from "../packages/core/src/fb/config";

// One-time upload of the 2026-09-22-v5 squares. Every object is created
// PAUSED. The $50 budget sits on the campaign.

const DESK = join(homedir(), "Desktop/solutionwhere-creatives/2026-09-22-v5");

const MODULES: Record<string, { module: string; landing: string }> = {
  P1: {
    module: "pd",
    landing: "https://home.solutionwhere.com/professional-development?module=pd",
  },
  P2: {
    module: "enrollments",
    landing: "https://home.solutionwhere.com/enrollments?module=enrollments",
  },
  P3: {
    module: "coaching",
    landing: "https://home.solutionwhere.com/coaching?module=coaching",
  },
  P4: {
    module: "referrals",
    landing: "https://home.solutionwhere.com/referrals?module=referrals",
  },
};

const FALLBACK: Record<string, { headline: string; primaryText: string; description: string }> = {
  "P1-A1": {
    headline: "Get up to 80% of staff-training signup work back.",
    primaryText:
      "Signup season is still a spreadsheet and a Google Form. Teachers sign up in one place, and that busywork drops by up to 80%. Your team keeps the same people. Book a 30-minute demo.",
    description:
      "Teachers sign up in one place. You pull the report when you need it, from numbers that were already right.",
  },
  "P1-A2": {
    headline: "Pull the yearly training report in minutes, not a week.",
    primaryText:
      "The yearly training report should not take a week of spreadsheets. You pull it when you need it, from signups that were already right. Book a 30-minute demo.",
    description:
      "Hours and signups live in one place, so the report is already there when the state asks.",
  },
};

interface Copy {
  headline: string;
  primaryText: string;
  description: string;
}

function copyFor(id: string): Copy {
  const path = join(DESK, `${id}.json`);
  try {
    const row = JSON.parse(readFileSync(path, "utf8")) as Copy;
    if (row.headline && row.primaryText && row.description) return row;
  } catch {
    // Sibling mode, then the two cells that never got a sidecar.
  }
  const sibling = id.endsWith("-dark") ? id.replace(/-dark$/, "-light") : id.replace(/-light$/, "-dark");
  try {
    const row = JSON.parse(readFileSync(join(DESK, `${sibling}.json`), "utf8")) as Copy;
    if (row.headline && row.primaryText && row.description) return row;
  } catch {
    // fall through
  }
  const key = id.replace(/-v5-(dark|light)$/, "");
  const fallback = FALLBACK[key];
  if (!fallback) throw new Error(`no copy for ${id}`);
  return fallback;
}

async function listAds(): Promise<{ id: string; name: string; status: string; adsetId: string }[]> {
  const out = await fbGet<{
    data?: { id?: string; name?: string; status?: string; adset_id?: string }[];
  }>(`${adAccountPath()}/ads`, {
    fields: "id,name,status,adset_id",
    limit: "200",
  });
  return (out.data ?? [])
    .filter((r) => r.id && r.name && r.status !== "DELETED")
    .map((r) => ({
      id: r.id as string,
      name: r.name as string,
      status: r.status as string,
      adsetId: r.adset_id ?? "",
    }));
}

async function main(): Promise<void> {
  const config = loadFbConfig();
  const pageId = fbEnv().FB_PAGE_ID;
  if (!pageId) throw new Error("FB_PAGE_ID is not set");

  const campaigns = await listCampaigns();
  let campaign = campaigns.find((c) => c.name === config.campaign.name) ?? null;
  if (!campaign) {
    const created = await createCampaign({
      name: config.campaign.name,
      objective: config.campaign.objective,
      dailyBudgetUsd: config.campaign.dailyBudgetUsd,
    });
    campaign = { id: created.id, name: config.campaign.name, status: "PAUSED" };
    console.log("created campaign", campaign.id);
  } else {
    await fbPost(campaign.id, {
      status: "PAUSED",
      daily_budget: Math.round(config.campaign.dailyBudgetUsd * 100),
      bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    });
    console.log("adopted campaign", campaign.id, campaign.status);
  }

  const adSets = await listAdSets();
  const adSetIds: Record<string, string> = {};
  for (const [module, name] of Object.entries(config.campaign.adSetsByModule)) {
    const existing = adSets.find((s) => s.name === name && s.campaignId === campaign.id);
    if (existing) {
      await fbPost(existing.id, { status: "PAUSED" });
      adSetIds[module] = existing.id;
      console.log("adopted ad set", name, existing.id, "budget", existing.dailyBudgetUsd);
      continue;
    }
    const created = await createAdSet({
      name,
      campaignId: campaign.id,
      pixelId: config.pixelId,
      optimizationEvent: config.campaign.optimizationEvent,
      geoCountries: config.campaign.geoCountries,
      excludedCustomAudienceIds: config.campaign.excludedCustomAudienceIds,
    });
    adSetIds[module] = created.id;
    console.log("created ad set", name, created.id);
  }

  const existingAds = await listAds();
  const byName = new Map(existingAds.map((a) => [a.name, a]));
  const files = readdirSync(DESK).filter((f) => f.endsWith(".png")).sort();
  let uploaded = 0;
  let skipped = 0;
  for (const file of files) {
    const id = file.replace(/\.png$/, "");
    const persona = id.slice(0, 2);
    const angle = id.slice(3, 5);
    const meta = MODULES[persona];
    if (!meta) throw new Error(`unknown persona ${persona}`);
    const adName = `${id} | ${persona} | ${angle}`;
    if (byName.has(adName)) {
      console.log("skip", adName);
      skipped += 1;
      continue;
    }
    const copy = copyFor(id);
    const bytes = readFileSync(join(DESK, file));
    const imageHash = await uploadAdImage(bytes, file);
    const creative = await createImageAdCreative({
      name: adName,
      pageId,
      imageHash,
      urlTags: config.urlTags,
      primaryText: copy.primaryText,
      headline: copy.headline,
      description: copy.description,
      link: meta.landing,
    });
    const ad = await createAd({
      name: adName,
      adSetId: adSetIds[meta.module],
      creativeId: creative.id,
    });
    uploaded += 1;
    console.log("ad", ad.id, adName);
  }
  console.log(`done uploaded=${uploaded} skipped=${skipped} campaign=${campaign.id}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  if (error && typeof error === "object" && "meta" in error) {
    console.error(JSON.stringify((error as { meta: unknown }).meta, null, 2));
  }
  process.exit(1);
});
