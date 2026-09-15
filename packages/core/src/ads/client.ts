// Google Ads REST transport, adapted from the Conduit reference
// (~/Dev/graphed/agents/conduit/jobs/google-ads/src/client.ts): REST v24
// direct, service-account auth preferred, OAuth refresh-token fallback,
// per-run operation ledger. Env goes through ./config (never process.env
// directly — repo rule).

import { GoogleAuth } from "google-auth-library";
import { googleAdsEnv, type GoogleAdsEnv } from "./config";

const API_VERSION = "v24";
export const BASE = `https://googleads.googleapis.com/${API_VERSION}`;
const ADWORDS_SCOPE = "https://www.googleapis.com/auth/adwords";

const stripDashes = (s: string) => s.replace(/-/g, "");

export const customerId = (env: GoogleAdsEnv = googleAdsEnv()): string =>
  stripDashes(env.GOOGLE_ADS_CUSTOMER_ID);

const loginCustomerId = (env: GoogleAdsEnv): string =>
  stripDashes(env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "");

let cachedAuth: GoogleAuth | null = null;

function serviceAccountAuth(env: GoogleAdsEnv): GoogleAuth | null {
  if (cachedAuth) return cachedAuth;
  if (env.GOOGLE_ADS_SA_KEY_JSON) {
    cachedAuth = new GoogleAuth({
      credentials: JSON.parse(env.GOOGLE_ADS_SA_KEY_JSON),
      scopes: [ADWORDS_SCOPE],
    });
    return cachedAuth;
  }
  if (env.GOOGLE_APPLICATION_CREDENTIALS) {
    cachedAuth = new GoogleAuth({
      keyFile: env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes: [ADWORDS_SCOPE],
    });
    return cachedAuth;
  }
  return null;
}

export async function getAccessToken(
  env: GoogleAdsEnv = googleAdsEnv(),
): Promise<string> {
  const sa = serviceAccountAuth(env);
  if (sa) {
    const client = await sa.getClient();
    const { token } = await client.getAccessToken();
    if (!token) throw new Error("Service account: failed to mint access token.");
    return token;
  }
  if (env.GOOGLE_ADS_REFRESH_TOKEN) {
    const res = await fetch("https://www.googleapis.com/oauth2/v3/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: env.GOOGLE_ADS_CLIENT_ID ?? "",
        client_secret: env.GOOGLE_ADS_CLIENT_SECRET ?? "",
        refresh_token: env.GOOGLE_ADS_REFRESH_TOKEN,
      }),
    });
    const body = (await res.json()) as { access_token?: string };
    if (!body.access_token) {
      throw new Error("Refresh-token exchange failed: " + JSON.stringify(body));
    }
    return body.access_token;
  }
  throw new Error(
    "No Google Ads credentials. Set GOOGLE_ADS_SA_KEY_JSON / " +
      "GOOGLE_APPLICATION_CREDENTIALS, or the OAuth refresh-token triple.",
  );
}

async function headers(env: GoogleAdsEnv): Promise<Record<string, string>> {
  return {
    Authorization: `Bearer ${await getAccessToken(env)}`,
    "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN ?? "",
    "login-customer-id": loginCustomerId(env),
    "Content-Type": "application/json",
  };
}

// ---- operation ledger ---------------------------------------------------------
// 15,000 ops/day on Basic access over a sliding 24h window, scoped to the
// developer token and shared with every project using it. Count our own.

let operationsUsed = 0;
let operationBudget = Number.POSITIVE_INFINITY;

export const apiOperationsUsed = (): number => operationsUsed;

export function setApiOperationBudget(max: number | null | undefined): void {
  operationBudget =
    max === null || max === undefined || !Number.isFinite(max)
      ? Number.POSITIVE_INFINITY
      : max;
}

export class OperationBudgetError extends Error {
  constructor(
    readonly requested: number,
    readonly used: number,
    readonly budget: number,
  ) {
    super(
      `Refusing to spend ${requested} more Google Ads operation(s): ` +
        `${used}/${budget} already used this run.`,
    );
    this.name = "OperationBudgetError";
  }
}

export class QuotaExhaustedError extends Error {
  constructor(
    readonly retryAfterSeconds: number | null,
    detail: string,
  ) {
    super(`Google Ads API quota exhausted. ${detail.slice(0, 300)}`);
    this.name = "QuotaExhaustedError";
  }
}

function spendOperations(count: number): void {
  if (operationsUsed + count > operationBudget) {
    throw new OperationBudgetError(count, operationsUsed, operationBudget);
  }
  operationsUsed += count;
}

function asQuotaError(status: number, body: string): QuotaExhaustedError | null {
  if (status !== 429) return null;
  let retryAfterSeconds: number | null = null;
  try {
    const parsed = JSON.parse(body);
    const failure = (Array.isArray(parsed) ? parsed[0] : parsed)?.error?.details?.find(
      (d: { errors?: unknown[] }) => Array.isArray(d?.errors),
    );
    const raw = failure?.errors?.[0]?.details?.quotaErrorDetails?.retryDelay;
    if (typeof raw === "string") {
      const seconds = Number(raw.replace(/s$/, ""));
      if (Number.isFinite(seconds)) retryAfterSeconds = seconds;
    }
  } catch {
    // keep null delay
  }
  return new QuotaExhaustedError(retryAfterSeconds, body);
}

// ---- transport ----------------------------------------------------------------

/** GAQL query via searchStream; returns flat camelCase rows. */
export async function search(gaql: string): Promise<unknown[]> {
  const env = googleAdsEnv();
  spendOperations(1);
  const res = await fetch(
    `${BASE}/customers/${customerId(env)}/googleAds:searchStream`,
    {
      method: "POST",
      headers: await headers(env),
      body: JSON.stringify({ query: gaql }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw asQuotaError(res.status, text) ?? new Error(`searchStream ${res.status}: ${text}`);
  }
  const chunks = JSON.parse(text) as { results?: unknown[] }[];
  const rows: unknown[] = [];
  for (const chunk of chunks) if (chunk.results) rows.push(...chunk.results);
  return rows;
}

/** Atomic batch mutate. validateOnly=true surfaces errors without writing. */
export async function mutate(
  mutateOperations: unknown[],
  validateOnly = true,
): Promise<unknown> {
  const env = googleAdsEnv();
  spendOperations(mutateOperations.length);
  const res = await fetch(
    `${BASE}/customers/${customerId(env)}/googleAds:mutate`,
    {
      method: "POST",
      headers: await headers(env),
      body: JSON.stringify({ mutateOperations, validateOnly }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw asQuotaError(res.status, text) ?? new Error(`mutate ${res.status}: ${text}`);
  }
  return JSON.parse(text);
}

/** Resolve human place names ("Michigan") to geoTargetConstant resource names. */
export async function suggestGeoTargets(
  names: string[],
): Promise<Map<string, string>> {
  const env = googleAdsEnv();
  spendOperations(1);
  const res = await fetch(
    `${BASE}/customers/${customerId(env)}/geoTargetConstants:suggest`,
    {
      method: "POST",
      headers: await headers(env),
      body: JSON.stringify({
        locationNames: { names },
        geoTargets: { geoTargetConstants: [] },
      }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw asQuotaError(res.status, text) ?? new Error(`geoSuggest ${res.status}: ${text}`);
  }
  const body = JSON.parse(text) as {
    geoTargetConstantSuggestions?: {
      geoTargetConstant?: { resourceName?: string; name?: string };
    }[];
  };
  const out = new Map<string, string>();
  for (const suggestion of body.geoTargetConstantSuggestions ?? []) {
    const constant = suggestion.geoTargetConstant;
    if (constant?.name && constant.resourceName) {
      out.set(constant.name, constant.resourceName);
    }
  }
  return out;
}

// ---- helpers ------------------------------------------------------------------

export const rn = {
  campaign: (cid: string, id: string | number) => `customers/${cid}/campaigns/${id}`,
  adGroup: (cid: string, id: string | number) => `customers/${cid}/adGroups/${id}`,
  campaignBudget: (cid: string, id: string | number) =>
    `customers/${cid}/campaignBudgets/${id}`,
  sharedSet: (cid: string, id: string | number) => `customers/${cid}/sharedSets/${id}`,
  asset: (cid: string, id: string | number) => `customers/${cid}/assets/${id}`,
};

export const toMicros = (usd: number): number => Math.round(usd * 1_000_000);
export const fromMicros = (m: number | string): number => Number(m) / 1_000_000;

export const normalize = (s: string): string =>
  s.toLowerCase().replace(/\s+/g, " ").trim();

/** Escape single quotes for GAQL string literals. */
export const gaqlStr = (s: string): string => s.replace(/'/g, "\\'");
