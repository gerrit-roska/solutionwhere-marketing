/**
 * client.ts — auth + REST transport, shared by all scripts.
 *
 * Talks to the Google Ads REST API directly (v24) so we can authenticate with a
 * SERVICE ACCOUNT. (The Opteo google-ads-api library is OAuth-refresh-token only
 * and has no native service-account path, so we don't use it here.)
 *
 *   npm install google-auth-library      # Node 18+ for global fetch
 *
 * Two auth modes, auto-selected:
 *   1. SERVICE ACCOUNT (preferred, unattended) — set ONE of:
 *        GOOGLE_ADS_SA_KEY_JSON          full JSON key as a single env string (Railway-friendly)
 *        GOOGLE_APPLICATION_CREDENTIALS  path to the JSON key file
 *   2. OAUTH REFRESH TOKEN (fallback) — set:
 *        GOOGLE_ADS_CLIENT_ID, GOOGLE_ADS_CLIENT_SECRET, GOOGLE_ADS_REFRESH_TOKEN
 *
 * Always required:
 *   GOOGLE_ADS_DEVELOPER_TOKEN
 *   GOOGLE_ADS_LOGIN_CUSTOMER_ID   (your MCC, dashes ok — stripped automatically)
 *   GOOGLE_ADS_CUSTOMER_ID         (the client account)
 *
 * The service account flow grants the SA *direct* access on the Ads account, so we
 * DO NOT set a JWT `sub`/subject — no impersonation, no Google Workspace required.
 */
import "dotenv/config";
import { GoogleAuth } from "google-auth-library";

const API_VERSION = "v24";
export const BASE = `https://googleads.googleapis.com/${API_VERSION}`;
const ADWORDS_SCOPE = "https://www.googleapis.com/auth/adwords";

const stripDashes = (s: string) => s.replace(/-/g, "");

function reqEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required env var: ${name}`);
  return v;
}

export const customerId = () => stripDashes(reqEnv("GOOGLE_ADS_CUSTOMER_ID"));
const loginCustomerId = () => stripDashes(reqEnv("GOOGLE_ADS_LOGIN_CUSTOMER_ID"));

// ---- access token (cached client; google-auth-library refreshes internally) ----
let cachedGoogleAuth: GoogleAuth | null = null;

function serviceAccountAuth(): GoogleAuth | null {
  if (cachedGoogleAuth) return cachedGoogleAuth;
  if (process.env.GOOGLE_ADS_SA_KEY_JSON) {
    cachedGoogleAuth = new GoogleAuth({
      credentials: JSON.parse(process.env.GOOGLE_ADS_SA_KEY_JSON),
      scopes: [ADWORDS_SCOPE],
      // No `clientOptions.subject` — SA has direct access; no domain-wide delegation.
    });
    return cachedGoogleAuth;
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    cachedGoogleAuth = new GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: [ADWORDS_SCOPE],
    });
    return cachedGoogleAuth;
  }
  return null;
}

export async function getAccessToken(): Promise<string> {
  // Mode 1: service account (preferred)
  const sa = serviceAccountAuth();
  if (sa) {
    const c = await sa.getClient();
    const { token } = await c.getAccessToken();
    if (!token) throw new Error("Service account: failed to mint access token.");
    return token;
  }
  // Mode 2: OAuth refresh token (fallback)
  if (process.env.GOOGLE_ADS_REFRESH_TOKEN) {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: reqEnv("GOOGLE_ADS_CLIENT_ID"),
        client_secret: reqEnv("GOOGLE_ADS_CLIENT_SECRET"),
        refresh_token: reqEnv("GOOGLE_ADS_REFRESH_TOKEN"),
      }),
    });
    const j: any = await res.json();
    if (!j.access_token) throw new Error("Refresh-token exchange failed: " + JSON.stringify(j));
    return j.access_token;
  }
  throw new Error(
    "No credentials found. Set GOOGLE_ADS_SA_KEY_JSON / GOOGLE_APPLICATION_CREDENTIALS " +
      "(service account) or GOOGLE_ADS_REFRESH_TOKEN (+ client id/secret)."
  );
}

export function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "developer-token": reqEnv("GOOGLE_ADS_DEVELOPER_TOKEN"),
    "login-customer-id": loginCustomerId(),
    "Content-Type": "application/json",
  };
}

// ---- transport ----------------------------------------------------------------

/** Run a GAQL query via searchStream. Returns a flat array of result rows (camelCase). */
export async function search(gaql: string): Promise<any[]> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}/customers/${customerId()}/googleAds:searchStream`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ query: gaql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`searchStream ${res.status}: ${text}`);
  const chunks = JSON.parse(text); // array of { results: [...] } stream chunks
  const rows: any[] = [];
  for (const chunk of chunks) if (chunk.results) rows.push(...chunk.results);
  return rows;
}

/**
 * Apply a batch of mutate operations atomically (all-or-nothing).
 * Each op is REST-shaped, e.g. { adGroupCriterionOperation: { create: {...} } }.
 * Pass validateOnly=true for a dry-run that surfaces errors without writing.
 */
export async function mutate(mutateOperations: any[], validateOnly = false): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}/customers/${customerId()}/googleAds:mutate`, {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify({ mutateOperations, validateOnly }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`mutate ${res.status}: ${text}`);
  return JSON.parse(text);
}

// ---- helpers --------------------------------------------------------------------

export const rn = {
  campaign: (cid: string, id: string | number) => `customers/${cid}/campaigns/${id}`,
  adGroup: (cid: string, id: string | number) => `customers/${cid}/adGroups/${id}`,
};

/** micros → currency units */
export const fromMicros = (m: number | string): number => Number(m) / 1_000_000;

/** Normalize a term/keyword for comparison (lowercase, collapse whitespace). */
export const normalize = (s: string): string => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Naive title-case for weaving a keyword into a headline. */
export const titleCase = (s: string): string =>
  s.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1));

/** Truncate text to max length, adding ellipsis if needed. */
export const truncate = (text: string, maxLen: number): string =>
  text.length > maxLen ? text.slice(0, maxLen - 1) + "…" : text;

/** Escape single quotes for safe interpolation into GAQL string literals. */
export const gaqlStr = (s: string): string => s.replace(/'/g, "\\'");

// Symbols Google Ads rejects in keyword text (positive or negative).
const INVALID_KEYWORD_CHARS = /[!@%^()={};~`<>?\\|[\]"*,]/g;
const MAX_KEYWORD_CHARS = 80;
const MAX_KEYWORD_WORDS = 10;

/**
 * Convert a raw search term into valid keyword text, or null if it can't be one.
 * Search terms routinely exceed keyword limits (80 chars / 10 words) or contain
 * forbidden symbols; one invalid term in an atomic mutate fails the whole batch,
 * so callers must filter through this before building criterion operations.
 */
export function toKeywordText(term: string): string | null {
  const cleaned = term.replace(INVALID_KEYWORD_CHARS, " ").replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  if (cleaned.length > MAX_KEYWORD_CHARS) return null;
  if (cleaned.split(" ").length > MAX_KEYWORD_WORDS) return null;
  return cleaned;
}
