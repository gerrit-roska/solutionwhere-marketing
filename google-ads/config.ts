import "dotenv/config";
import * as fs from "fs";
import * as path from "path";

export interface GoogleAdsClientConfig {
  client_key: string;
  display_name: string;
  google_ads: {
    customer_id: string;
    login_customer_id: string;
  };
  campaigns: {
    testing_campaign_id: string;
    testing_campaign_name: string;
    testing_ad_group_id: string;
    winners_campaign_id: string;
    winners_campaign_name: string;
  };
  thresholds: {
    target_cpa: number;
    waste_min_spend: number;
    lookback_days: number;
    /** Minimum conversions before a search term qualifies as a winner (default 1). */
    min_conversions: number;
  };
  promotion: {
    landing_page_url: string;
    brand_headline: string;
    descriptions: [string, string, ...string[]];
  };
  safety: {
    default_validate_only: boolean;
    require_apply_flag: boolean;
  };
}

export interface ClientArgResult {
  config: GoogleAdsClientConfig | null;
  args: string[];
}

const CONFIG_DIR = path.join(__dirname, "clients");

const stripDashes = (s: string): string => s.replace(/-/g, "");

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Client config is missing required string: ${field}`);
  }
  return value.trim();
}

const NUMERIC_ID = /^\d+$/;

/** A Google Ads account ID: numeric (dashes allowed in source, stripped here). */
function requireCustomerId(value: unknown, field: string): string {
  const raw = requireString(value, field);
  const digits = stripDashes(raw);
  if (!NUMERIC_ID.test(digits)) {
    throw new Error(
      `Client config ${field} must be a numeric Google Ads account ID (10 digits, dashes ok). ` +
        `Got "${raw}" — did you forget to replace the placeholder with the real account ID?`
    );
  }
  return digits;
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Client config is missing required number: ${field}`);
  }
  return value;
}

function requireBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Client config is missing required boolean: ${field}`);
  }
  return value;
}

function requireDescriptions(value: unknown): [string, string, ...string[]] {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error("Client config promotion.descriptions must contain at least two descriptions.");
  }
  const descriptions = value.map((item, index) =>
    requireString(item, `promotion.descriptions[${index}]`)
  );
  return descriptions as [string, string, ...string[]];
}

export function loadClientConfig(clientKey: string): GoogleAdsClientConfig {
  const safeKey = requireString(clientKey, "client_key").replace(/[^a-zA-Z0-9_-]/g, "");
  if (safeKey !== clientKey) {
    throw new Error(`Invalid client key: ${clientKey}`);
  }

  const configPath = path.join(CONFIG_DIR, `${safeKey}.json`);
  if (!fs.existsSync(configPath)) {
    throw new Error(`Client config not found: ${configPath}`);
  }

  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const config: GoogleAdsClientConfig = {
    client_key: requireString(raw.client_key, "client_key"),
    display_name: requireString(raw.display_name, "display_name"),
    google_ads: {
      customer_id: requireCustomerId(raw.google_ads?.customer_id, "google_ads.customer_id"),
      login_customer_id: requireCustomerId(
        raw.google_ads?.login_customer_id,
        "google_ads.login_customer_id"
      ),
    },
    campaigns: {
      testing_campaign_id: requireString(
        raw.campaigns?.testing_campaign_id,
        "campaigns.testing_campaign_id"
      ),
      testing_campaign_name: requireString(
        raw.campaigns?.testing_campaign_name,
        "campaigns.testing_campaign_name"
      ),
      testing_ad_group_id: requireString(
        raw.campaigns?.testing_ad_group_id,
        "campaigns.testing_ad_group_id"
      ),
      winners_campaign_id: requireString(
        raw.campaigns?.winners_campaign_id,
        "campaigns.winners_campaign_id"
      ),
      winners_campaign_name: requireString(
        raw.campaigns?.winners_campaign_name,
        "campaigns.winners_campaign_name"
      ),
    },
    thresholds: {
      target_cpa: requireNumber(raw.thresholds?.target_cpa, "thresholds.target_cpa"),
      waste_min_spend: requireNumber(raw.thresholds?.waste_min_spend, "thresholds.waste_min_spend"),
      lookback_days: requireNumber(raw.thresholds?.lookback_days, "thresholds.lookback_days"),
      min_conversions:
        raw.thresholds?.min_conversions === undefined
          ? 1
          : requireNumber(raw.thresholds.min_conversions, "thresholds.min_conversions"),
    },
    promotion: {
      landing_page_url: requireString(raw.promotion?.landing_page_url, "promotion.landing_page_url"),
      brand_headline: requireString(raw.promotion?.brand_headline, "promotion.brand_headline"),
      descriptions: requireDescriptions(raw.promotion?.descriptions),
    },
    safety: {
      default_validate_only: requireBoolean(
        raw.safety?.default_validate_only,
        "safety.default_validate_only"
      ),
      require_apply_flag: requireBoolean(raw.safety?.require_apply_flag, "safety.require_apply_flag"),
    },
  };

  if (config.client_key !== safeKey) {
    throw new Error(`Client config key mismatch: expected ${safeKey}, got ${config.client_key}`);
  }

  return config;
}

export function applyClientEnv(config: GoogleAdsClientConfig): void {
  process.env.GOOGLE_ADS_CUSTOMER_ID = config.google_ads.customer_id;
  process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = config.google_ads.login_customer_id;
}

/**
 * Guard for scripts that operate on the existing campaigns (daily loop, etc.).
 * Throws a clear error if the campaign/ad-group IDs are still placeholders,
 * i.e. `npm run bootstrap` has not been run + written back yet.
 */
export function assertCampaignsBootstrapped(config: GoogleAdsClientConfig): void {
  const unfilled = (
    [
      ["campaigns.testing_campaign_id", config.campaigns.testing_campaign_id],
      ["campaigns.testing_ad_group_id", config.campaigns.testing_ad_group_id],
      ["campaigns.winners_campaign_id", config.campaigns.winners_campaign_id],
    ] as const
  )
    .filter(([, value]) => !NUMERIC_ID.test(value))
    .map(([field]) => field);

  if (unfilled.length) {
    throw new Error(
      `These campaign IDs are not real numeric IDs yet: ${unfilled.join(", ")}.\n` +
        `Run \`npm run bootstrap -- --client ${config.client_key} --apply\` first — it creates the ` +
        `campaigns and writes their IDs back into clients/${config.client_key}.json.`
    );
  }
}

export function loadClientFromArgs(argv = process.argv.slice(2)): ClientArgResult {
  const args: string[] = [];
  let clientKey = process.env.GOOGLE_ADS_CLIENT;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--client") {
      clientKey = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith("--client=")) {
      clientKey = arg.slice("--client=".length);
      continue;
    }
    args.push(arg);
  }

  if (!clientKey) return { config: null, args };

  const config = loadClientConfig(clientKey);
  applyClientEnv(config);
  return { config, args };
}

