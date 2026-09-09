/**
 * daily.ts — cron/Hermes-friendly orchestrator for the Testing -> Winners loop.
 *
 * Always runs discovery and writes JSON logs. Mutations only happen when explicit
 * approval inputs are provided with matching --apply-* flags, or when --auto-apply
 * is passed for fully unattended policy-based operation.
 */
import * as fs from "fs";
import * as path from "path";
import { search, gaqlStr, normalize } from "./client";
import { findWinners } from "./find_winners";
import { findWaste } from "./find_waste";
import { negateTesting } from "./negate_testing";
import { promoteWinner } from "./promote_winner";
import { applyPrune as applyPruneCandidates, planPrune } from "./prune_winners";
import { loadClientFromArgs, assertCampaignsBootstrapped } from "./config";

interface DailyOptions {
  outputDir?: string;
  approvedWinnersPath?: string;
  approvedWasteTermsPath?: string;
  autoApply: boolean;
  applyPromotions: boolean;
  applyWaste: boolean;
  applyPrune: boolean;
}

interface DailySummary {
  client: string;
  outputDir: string;
  startedAt: string;
  finishedAt?: string;
  winnersFound: number;
  wasteTermsFound: number;
  pruneAdGroupsFound: number;
  approvedWinners: number;
  approvedWasteTerms: number;
  autoPromotedWinners: number;
  autoNegatedWasteTerms: number;
  skippedExistingWinners: number;
  skippedExistingTestingNegatives: number;
  autoApply: boolean;
  promotionsApplied: boolean;
  wasteApplied: boolean;
  pruneApplied: boolean;
  promotionErrors: number;
  pruneErrors: number;
  pruneNegativesAdded: number;
}

function parseOptions(args: string[]): DailyOptions {
  const options: DailyOptions = {
    autoApply: args.includes("--auto-apply"),
    applyPromotions: args.includes("--apply-promotions"),
    applyWaste: args.includes("--apply-waste"),
    applyPrune: args.includes("--apply-prune"),
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (
      arg === "--auto-apply" ||
      arg === "--apply-promotions" ||
      arg === "--apply-waste" ||
      arg === "--apply-prune"
    ) {
      continue;
    }
    if (arg === "--output-dir") {
      options.outputDir = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--output-dir=")) {
      options.outputDir = arg.slice("--output-dir=".length);
      continue;
    }
    if (arg === "--approved-winners") {
      options.approvedWinnersPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--approved-winners=")) {
      options.approvedWinnersPath = arg.slice("--approved-winners=".length);
      continue;
    }
    if (arg === "--approved-waste-terms") {
      options.approvedWasteTermsPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--approved-waste-terms=")) {
      options.approvedWasteTermsPath = arg.slice("--approved-waste-terms=".length);
      continue;
    }

    throw new Error(`Unknown daily option: ${arg}`);
  }

  return options;
}

function readJsonFile(filePath: string): unknown {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function extractTerm(item: unknown, fieldName: string): string {
  if (typeof item === "string" && item.trim()) return item.trim();
  if (typeof item === "object" && item) {
    const record = item as Record<string, unknown>;
    const value = record.searchTerm ?? record.winnerKeyword ?? record.keyword ?? record.term;
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  throw new Error(`Invalid ${fieldName} item. Expected a string or object with searchTerm/keyword.`);
}

function loadApprovedTerms(filePath?: string, fieldName = "approved term"): string[] {
  if (!filePath) return [];
  const data = readJsonFile(filePath);
  if (!Array.isArray(data)) {
    throw new Error(`${filePath} must contain a JSON array.`);
  }
  return [...new Set(data.map((item) => extractTerm(item, fieldName)))];
}

function writeJson(filePath: string, data: unknown): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

async function findExistingWinnerTerms(winnersCampaignName: string): Promise<Set<string>> {
  const rows = await search(`
    SELECT ad_group.name
    FROM ad_group
    WHERE campaign.name = '${gaqlStr(winnersCampaignName)}'
      AND ad_group.status != 'REMOVED'
  `);
  return new Set(
    rows
      .map((r: any) => String(r.adGroup.name ?? ""))
      .filter((name) => name.startsWith("EXACT | "))
      .map((name) => normalize(name.slice("EXACT | ".length)))
  );
}

async function findExistingTestingNegatives(testingCampaignId: string): Promise<Set<string>> {
  const rows = await search(`
    SELECT campaign_criterion.keyword.text
    FROM campaign_criterion
    WHERE campaign.id = ${testingCampaignId}
      AND campaign_criterion.negative = true
      AND campaign_criterion.type = 'KEYWORD'
  `);
  return new Set(rows.map((r: any) => normalize(r.campaignCriterion.keyword.text)));
}

async function main(): Promise<void> {
  const { config, args } = loadClientFromArgs();
  if (!config) {
    throw new Error("Usage: ts-node daily.ts --client <client> [--output-dir <dir>]");
  }
  assertCampaignsBootstrapped(config);

  const options = parseOptions(args);
  const startedAt = new Date().toISOString();
  const stamp = startedAt.replace(/[:.]/g, "-");
  const outputDir = path.resolve(
    options.outputDir ?? path.join("runs", config.client_key, stamp)
  );

  console.log(`Starting daily Google Ads run for ${config.display_name} (${config.client_key})`);
  console.log(`Writing run logs to ${outputDir}`);

  const approvedWinners = loadApprovedTerms(options.approvedWinnersPath, "approved winner");
  const approvedWasteTerms = loadApprovedTerms(
    options.approvedWasteTermsPath,
    "approved waste term"
  );
  const applyPromotions = options.autoApply || options.applyPromotions;
  const applyWaste = options.autoApply || options.applyWaste;
  const applyPrune = options.autoApply || options.applyPrune;

  const winners = await findWinners(
    config.campaigns.testing_campaign_name,
    config.thresholds.target_cpa,
    config.thresholds.lookback_days,
    config.thresholds.min_conversions
  );
  writeJson(path.join(outputDir, "winners.json"), winners);

  const waste = await findWaste(
    config.campaigns.testing_campaign_name,
    config.thresholds.waste_min_spend,
    config.thresholds.lookback_days
  );
  writeJson(path.join(outputDir, "waste.json"), waste);

  const pruneCandidates = await planPrune(
    config.campaigns.winners_campaign_name,
    config.thresholds.lookback_days
  );
  writeJson(path.join(outputDir, "prune.json"), pruneCandidates);

  const existingWinnerTerms = await findExistingWinnerTerms(config.campaigns.winners_campaign_name);
  const existingTestingNegatives = await findExistingTestingNegatives(
    config.campaigns.testing_campaign_id
  );
  const autoWinnerTerms = options.autoApply
    ? winners
        .map((winner) => winner.searchTerm)
        .filter((term) => !existingWinnerTerms.has(normalize(term)))
        .filter((term) => !existingTestingNegatives.has(normalize(term)))
    : [];
  const skippedExistingWinners = options.autoApply
    ? winners.filter((winner) => existingWinnerTerms.has(normalize(winner.searchTerm))).length
    : 0;
  const skippedExistingTestingNegatives = options.autoApply
    ? winners.filter((winner) => existingTestingNegatives.has(normalize(winner.searchTerm))).length
    : 0;
  const promotionTerms = [...new Set([...approvedWinners, ...autoWinnerTerms])];
  const wasteTerms = [
    ...new Set([
      ...approvedWasteTerms,
      ...(options.autoApply ? waste.map((wastedTerm) => wastedTerm.searchTerm) : []),
    ]),
  ];

  const summary: DailySummary = {
    client: config.client_key,
    outputDir,
    startedAt,
    winnersFound: winners.length,
    wasteTermsFound: waste.length,
    pruneAdGroupsFound: pruneCandidates.length,
    approvedWinners: approvedWinners.length,
    approvedWasteTerms: approvedWasteTerms.length,
    autoPromotedWinners: autoWinnerTerms.length,
    autoNegatedWasteTerms: options.autoApply ? waste.length : 0,
    skippedExistingWinners,
    skippedExistingTestingNegatives,
    autoApply: options.autoApply,
    promotionsApplied: false,
    wasteApplied: false,
    pruneApplied: false,
    promotionErrors: 0,
    pruneErrors: 0,
    pruneNegativesAdded: 0,
  };

  if (promotionTerms.length > 0) {
    const promotionResults = [];
    for (const winnerKeyword of promotionTerms) {
      // Isolate each promotion — one bad term must not block the rest of the
      // day's promotions, waste negation, or pruning.
      try {
        promotionResults.push({
          winnerKeyword,
          result: await promoteWinner({
            winnerKeyword,
            testingCampaignId: config.campaigns.testing_campaign_id,
            winnersCampaignId: config.campaigns.winners_campaign_id,
            landingPageUrl: config.promotion.landing_page_url,
            brandHeadline: config.promotion.brand_headline,
            descriptions: config.promotion.descriptions,
            validateOnly: !applyPromotions,
          }),
        });
      } catch (error: any) {
        summary.promotionErrors += 1;
        const message = String(error?.message ?? error);
        console.error(`Promotion failed for "${winnerKeyword}": ${message}`);
        promotionResults.push({ winnerKeyword, error: message });
      }
    }
    summary.promotionsApplied = applyPromotions;
    writeJson(path.join(outputDir, "approved-promotions.json"), promotionResults);
    if (!applyPromotions) {
      console.log("Promotions were validate-only. Add --apply-promotions or --auto-apply to write winners.");
    }
  }

  if (wasteTerms.length > 0) {
    // Isolated so a waste-negation failure never blocks the pruning step below.
    try {
      const result = await negateTesting(
        config.campaigns.testing_campaign_id,
        wasteTerms,
        applyWaste
      );
      summary.wasteApplied = applyWaste;
      writeJson(path.join(outputDir, "approved-waste-negatives.json"), result);
      if (!applyWaste) {
        console.log("Waste negatives were dry-run only. Add --apply-waste or --auto-apply to write terms.");
      }
    } catch (error: any) {
      const message = String(error?.message ?? error);
      console.error(`Waste negation failed: ${message}`);
      writeJson(path.join(outputDir, "approved-waste-negatives.json"), { error: message });
    }
  }

  if (applyPrune && pruneCandidates.length > 0) {
    // applyPrune isolates failures per ad group and reports them instead of throwing.
    const pruneResults = await applyPruneCandidates(pruneCandidates);
    writeJson(path.join(outputDir, "prune-applied.json"), pruneResults);
    summary.pruneApplied = true;
    summary.pruneErrors = pruneResults.filter((r) => r.error).length;
    summary.pruneNegativesAdded = pruneResults.reduce((n, r) => n + r.added.length, 0);
  }

  summary.finishedAt = new Date().toISOString();
  writeJson(path.join(outputDir, "summary.json"), summary);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error("Daily Google Ads run failed:");
  console.error(error);
  process.exit(1);
});

