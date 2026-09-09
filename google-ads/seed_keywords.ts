/**
 * seed_keywords.ts — Step 0 (mostly one-time).
 * Seeds a TESTING ad group with positive keywords and pre-loads brand-safety
 * negatives at the TESTING campaign level. Broad match self-expands, so re-run
 * only for a new product / pain point. Get seeds from DataForSEO / Keywords
 * Everywhere seeded with the brand URL (not by re-prompting an LLM).
 *
 * The seeds file is either:
 *   - a flat JSON array of strings  → all added as BROAD positives (legacy), or
 *   - a structured object:
 *       { "broad": [...], "phrase": [...], "negatives": [...] }
 *     broad/phrase → positive ad-group keywords of that match type
 *     negatives    → BROAD campaign-level negatives on TESTING (brand safety)
 *
 * Usage: ts-node seed_keywords.ts [--client <client>] [TESTING_AD_GROUP_ID] <seeds.json|--seeds seeds.json> [--apply]
 */
import * as fs from "fs";
import { search, mutate, customerId, rn, normalize } from "./client";
import { loadClientFromArgs, assertCampaignsBootstrapped } from "./config";

export interface SeedSet {
  broad?: string[];
  phrase?: string[];
  negatives?: string[];
}

export interface SeedResult {
  broadAdded: string[];
  phraseAdded: string[];
  negativesAdded: string[];
  skippedPositives: string[];
  skippedNegatives: string[];
}

function normalizeSeedSet(seeds: string[] | SeedSet): Required<SeedSet> {
  if (Array.isArray(seeds)) {
    return { broad: seeds, phrase: [], negatives: [] };
  }
  return {
    broad: seeds.broad ?? [],
    phrase: seeds.phrase ?? [],
    negatives: seeds.negatives ?? [],
  };
}

/** Dedupe a list of terms by normalized text, dropping anything already present. */
function planAdds(terms: string[], have: Set<string>): { toAdd: string[]; skipped: string[] } {
  const seen = new Set<string>();
  const toAdd: string[] = [];
  const skipped: string[] = [];
  for (const raw of terms) {
    const text = raw.trim();
    if (!text) continue;
    const key = normalize(text);
    if (have.has(key) || seen.has(key)) {
      skipped.push(text);
      continue;
    }
    seen.add(key);
    toAdd.push(text);
  }
  return { toAdd, skipped };
}

export async function seedKeywords(
  testingAdGroupId: string,
  seeds: string[] | SeedSet,
  apply = false,
  testingCampaignId?: string
): Promise<SeedResult> {
  const cid = customerId();
  const { broad, phrase, negatives } = normalizeSeedSet(seeds);

  // Existing positive keywords in the ad group (any match type).
  const existingPositives = await search(`
    SELECT ad_group_criterion.keyword.text
    FROM keyword_view
    WHERE ad_group.id = ${testingAdGroupId}
      AND ad_group_criterion.negative = false
  `);
  const havePositive = new Set(
    existingPositives.map((r: any) => normalize(r.adGroupCriterion.keyword.text))
  );

  const broadPlan = planAdds(broad, havePositive);
  broadPlan.toAdd.forEach((t) => havePositive.add(normalize(t)));
  const phrasePlan = planAdds(phrase, havePositive);

  // Existing campaign-level negatives on TESTING (for negative dedupe).
  let negativePlan: { toAdd: string[]; skipped: string[] } = { toAdd: [], skipped: [] };
  if (testingCampaignId && negatives.length) {
    const existingNegatives = await search(`
      SELECT campaign_criterion.keyword.text
      FROM campaign_criterion
      WHERE campaign.id = ${testingCampaignId}
        AND campaign_criterion.negative = true
        AND campaign_criterion.type = 'KEYWORD'
    `);
    const haveNegative = new Set(
      existingNegatives.map((r: any) => normalize(r.campaignCriterion.keyword.text))
    );
    negativePlan = planAdds(negatives, haveNegative);
  }

  const ops: any[] = [];
  for (const text of broadPlan.toAdd) {
    ops.push({
      adGroupCriterionOperation: {
        create: {
          adGroup: rn.adGroup(cid, testingAdGroupId),
          status: "ENABLED",
          keyword: { text, matchType: "BROAD" },
        },
      },
    });
  }
  for (const text of phrasePlan.toAdd) {
    ops.push({
      adGroupCriterionOperation: {
        create: {
          adGroup: rn.adGroup(cid, testingAdGroupId),
          status: "ENABLED",
          keyword: { text, matchType: "PHRASE" },
        },
      },
    });
  }
  if (testingCampaignId) {
    for (const text of negativePlan.toAdd) {
      ops.push({
        campaignCriterionOperation: {
          create: {
            campaign: rn.campaign(cid, testingCampaignId),
            negative: true,
            keyword: { text, matchType: "BROAD" },
          },
        },
      });
    }
  }

  if (apply && ops.length) {
    await mutate(ops);
  }

  return {
    broadAdded: broadPlan.toAdd,
    phraseAdded: phrasePlan.toAdd,
    negativesAdded: testingCampaignId ? negativePlan.toAdd : [],
    skippedPositives: [...broadPlan.skipped, ...phrasePlan.skipped],
    skippedNegatives: negativePlan.skipped,
  };
}

if (require.main === module) {
  const { config, args } = loadClientFromArgs();
  const apply = args.includes("--apply");
  const positional: string[] = [];
  let seedsPath: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--apply") continue;
    if (arg === "--seeds") {
      seedsPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--seeds=")) {
      seedsPath = arg.slice("--seeds=".length);
      continue;
    }
    positional.push(arg);
  }
  // When IDs come from the client config (the documented path), make sure
  // bootstrap has already filled them in — otherwise fail with a clear message.
  if (config && !positional[0]) assertCampaignsBootstrapped(config);

  const adGroupId = positional[0] ?? config?.campaigns.testing_ad_group_id;
  seedsPath = seedsPath ?? positional[1];
  const testingCampaignId = config?.campaigns.testing_campaign_id;
  if (!adGroupId || !seedsPath) {
    console.error("Usage: ts-node seed_keywords.ts [--client <client>] [TESTING_AD_GROUP_ID] <seeds.json|--seeds seeds.json> [--apply]");
    process.exit(1);
  }
  const seeds: string[] | SeedSet = JSON.parse(fs.readFileSync(seedsPath, "utf8"));
  if (!Array.isArray(seeds) && (seeds.negatives?.length ?? 0) > 0 && !testingCampaignId) {
    console.error("Seeds include negatives but no testing campaign id is available. Pass --client with a configured testing_campaign_id.");
    process.exit(1);
  }
  seedKeywords(adGroupId, seeds, apply, testingCampaignId)
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      console.log(
        `\nBroad: +${r.broadAdded.length}  Phrase: +${r.phraseAdded.length}  Negatives: +${r.negativesAdded.length}` +
          `  (skipped ${r.skippedPositives.length} positives, ${r.skippedNegatives.length} negatives already present)`
      );
      if (!apply) console.log("Dry-run only. Re-run with --apply to write keywords.");
    })
    .catch((e) => { console.error(e); process.exit(1); });
}
