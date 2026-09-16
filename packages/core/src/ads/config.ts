import { z } from "zod";
import { envSlice } from "../config";

// Google Ads access (02-ad-account-access.md + 03 §1). The customer ID is
// known and hard-defaulted; the engine no-ops cleanly until credentials land.
//
// Auth mirrors the Conduit reference: service account preferred
// (GOOGLE_ADS_SA_KEY_JSON or GOOGLE_APPLICATION_CREDENTIALS), OAuth refresh
// token as fallback. Never a subject/impersonation — the SA gets access to
// client accounts through the MCC link (login-customer-id).
//
// Developer tokens were sunset by Google on 2026-09-09: the header is
// optional and ignored, and access levels now attach to the Google Cloud
// project/org. GOOGLE_ADS_DEVELOPER_TOKEN is kept only so old env files
// still parse; it is never sent and never required.

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
  if (!env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
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
