/**
 * negate_testing.ts — EXACT campaign-level negatives on the TESTING campaign.
 * Used by Step 3 (kill wasted spend) and reusable. Campaign-level → applies to all
 * TESTING ad groups. Dedupes against existing negatives first.
 *
 * Usage: ts-node negate_testing.ts <TESTING_CAMPAIGN_ID> <terms.json> [--apply]
 */
import * as fs from "fs";
import { search, mutate, customerId, rn, normalize, toKeywordText } from "./client";
import { loadClientFromArgs } from "./config";

export async function negateTesting(
  testingCampaignId: string,
  terms: string[],
  apply = false
): Promise<{ added: string[]; skipped: string[]; invalid: string[] }> {
  const cid = customerId();

  const existing = await search(`
    SELECT campaign_criterion.keyword.text
    FROM campaign_criterion
    WHERE campaign.id = ${testingCampaignId}
      AND campaign_criterion.negative = true
      AND campaign_criterion.type = 'KEYWORD'
      AND campaign_criterion.status != 'REMOVED'
  `);
  const have = new Set(existing.map((r: any) => normalize(r.campaignCriterion.keyword.text)));

  // Clean each term into valid keyword text first — one over-long/symbol-laden
  // search term would fail the whole atomic mutate.
  const invalid: string[] = [];
  const skipped: string[] = [];
  const planned = new Map<string, string>(); // normalized -> keyword text
  for (const raw of terms) {
    const text = toKeywordText(raw);
    if (!text) {
      invalid.push(raw);
      continue;
    }
    const key = normalize(text);
    if (have.has(key)) {
      skipped.push(text);
      continue;
    }
    if (!planned.has(key)) planned.set(key, text);
  }
  const toAdd = [...planned.values()];

  if (apply && toAdd.length) {
    await mutate(
      toAdd.map((text) => ({
        campaignCriterionOperation: {
          create: {
            campaign: rn.campaign(cid, testingCampaignId),
            negative: true,
            keyword: { text, matchType: "EXACT" },
          },
        },
      }))
    );
  }
  return { added: toAdd, skipped, invalid };
}

if (require.main === module) {
  const { config, args } = loadClientFromArgs();
  const apply = args.includes("--apply");
  const positional: string[] = [];
  let termsPath: string | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--apply") continue;
    if (arg === "--terms") {
      termsPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--terms=")) {
      termsPath = arg.slice("--terms=".length);
      continue;
    }
    positional.push(arg);
  }
  const campaignId = positional[0] ?? config?.campaigns.testing_campaign_id;
  termsPath = termsPath ?? positional[1];
  if (!campaignId || !termsPath) {
    console.error("Usage: ts-node negate_testing.ts [--client <client>] [TESTING_CAMPAIGN_ID] <terms.json|--terms terms.json> [--apply]");
    process.exit(1);
  }
  const terms: string[] = JSON.parse(fs.readFileSync(termsPath, "utf8"));
  negateTesting(campaignId, terms, apply)
    .then((r) => {
      console.log(JSON.stringify(r, null, 2));
      if (!apply) console.log("Dry-run only. Re-run with --apply to add negatives.");
    })
    .catch((e) => { console.error(e); process.exit(1); });
}
