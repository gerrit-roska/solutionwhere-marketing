import { z } from "zod";
import { envSlice } from "../config";

// Google Ads access (02-ad-account-access.md + 03 §1). The customer ID is
// known and hard-defaulted; the developer token and credentials are NOT yet
// provisioned (Linear FDE-526), so every code path treats this slice as
// optional — the engine no-ops cleanly until the secrets land.
//
// Auth mirrors the Conduit reference: service account preferred
// (GOOGLE_ADS_SA_KEY_JSON or GOOGLE_APPLICATION_CREDENTIALS), OAuth refresh
// token as fallback. Never a subject/impersonation — the SA gets direct
// access on the Ads account.

const googleAdsEnvSchema = z.object({
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().min(1).optional(),
  GOOGLE_ADS_CUSTOMER_ID: z.string().min(1).default("202-304-8623"),
  GOOGLE_ADS_LOGIN_CUSTOMER_ID: z.string().min(1).optional(),
  GOOGLE_ADS_SA_KEY_JSON: z.string().min(1).optional(),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().min(1).optional(),
  GOOGLE_ADS_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_ADS_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_ADS_REFRESH_TOKEN: z.string().min(1).optional(),
});

export type GoogleAdsEnv = z.infer<typeof googleAdsEnvSchema>;

let cached: GoogleAdsEnv | null = null;

export function googleAdsEnv(): GoogleAdsEnv {
  cached ??= envSlice(googleAdsEnvSchema);
  return cached;
}

/** True when there is enough credential material to attempt an API call. */
export function googleAdsReady(env: GoogleAdsEnv = googleAdsEnv()): boolean {
  if (!env.GOOGLE_ADS_DEVELOPER_TOKEN || !env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
    return false;
  }
  return Boolean(
    env.GOOGLE_ADS_SA_KEY_JSON ||
      env.GOOGLE_APPLICATION_CREDENTIALS ||
      (env.GOOGLE_ADS_REFRESH_TOKEN &&
        env.GOOGLE_ADS_CLIENT_ID &&
        env.GOOGLE_ADS_CLIENT_SECRET),
  );
}
