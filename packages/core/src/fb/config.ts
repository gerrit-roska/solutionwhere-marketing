import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import { envSlice, projectRoot } from "../config";

// Meta Marketing API access (02-ad-account-access.md §2, 04 §1 item 6).
// Mirrors ads/config.ts: the ad account id is known and hard-defaulted
// (02 §6), and the jobs degrade to a plan-only report until FB_ACCESS_TOKEN
// lands — googleAdsReady() is the same pattern.
//
// Auth is a system-user token with ads_management + ads_read, created
// 2026-09-16. Meta tokens expire ~60 days; the issue date lives in
// clients/solutionwhere/fb.json (not env — 07 §3.2 fixes the manifest env
// lists) and fb-manage-daily alerts at day 50.

const fbEnvSchema = z.object({
  FB_ACCESS_TOKEN: z.string().min(1).optional(),
  FB_AD_ACCOUNT_ID: z.string().min(1).default("act_1094729323030580"),
  // Required only for --apply (ad creatives need a Page). Dry runs and the
  // manage job's reads work without it.
  FB_PAGE_ID: z.string().min(1).optional(),
});

export type FbEnv = z.infer<typeof fbEnvSchema>;

let cachedEnv: FbEnv | null = null;

export function fbEnv(): FbEnv {
  cachedEnv ??= envSlice(fbEnvSchema);
  return cachedEnv;
}

/** True when there is enough credential material to attempt an API call. */
export function fbReady(env: FbEnv = fbEnv()): boolean {
  return Boolean(env.FB_ACCESS_TOKEN && env.FB_AD_ACCOUNT_ID);
}

/** Account id in the `act_<digits>` form Graph API paths expect. */
export function adAccountPath(env: FbEnv = fbEnv()): string {
  return `act_${env.FB_AD_ACCOUNT_ID.replace(/^act_/, "")}`;
}

// --- client config: clients/solutionwhere/fb.json ---
// Account-specific structure (campaign name, module ad sets, budgets, pixel)
// lives in client config, not code — same split as warehouse.json.

const fbConfigSchema = z.object({
  pixelId: z.string().min(1),
  apiVersion: z
    .string()
    .regex(/^v\d+\.\d+$/)
    .default("v23.0"),
  tokenIssuedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  urlTags: z.string().min(1),
  campaign: z.object({
    name: z.string().min(1),
    objective: z.string().min(1),
    optimizationEvent: z.string().min(1),
    flipToCustomConversion: z.string().min(1),
    dailyBudgetPerAdSetUsd: z.number().positive(),
    geoCountries: z.array(z.string().length(2)).min(1),
    excludedCustomAudienceIds: z.array(z.string()).default([]),
    adSetsByModule: z.record(z.string().min(1)),
  }),
});

export type FbConfig = z.infer<typeof fbConfigSchema>;

let cachedConfig: FbConfig | null = null;

export function loadFbConfig(): FbConfig {
  if (!cachedConfig) {
    const path = resolve(projectRoot(), "clients/solutionwhere/fb.json");
    cachedConfig = fbConfigSchema.parse(
      JSON.parse(readFileSync(path, "utf-8")),
    );
  }
  return cachedConfig;
}
