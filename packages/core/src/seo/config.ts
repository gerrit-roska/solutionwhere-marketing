import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Graphed } from "@graphed-inc/sdk";
import { z } from "zod";
import { envSlice, projectRoot } from "../config";
import type { ClientConfig } from "./types";

export interface SeoConfig {
  openRouterApiKey: string;
  /** Chat-completions base URL — the Graphed OpenRouter proxy by default. */
  openRouterBaseUrl: string;
  openRouterModel: string;
  /** SERP research sources — both optional; absent keys = ungrounded runs. */
  serperApiKey?: string;
  exaApiKey?: string;
  client: ClientConfig;
}

// The SEO plugin's env slice. Validated when the job runs — never at import
// time, so the dashboard boots fine without these set.
//
// LLM auth goes through the Graphed OpenRouter proxy (metered, no vendor
// key). OPENROUTER_API_KEY remains as an explicit local override only.
const seoEnvSchema = z.object({
  OPENROUTER_API_KEY: z.string().optional(),
  OPENROUTER_MODEL: z.string().default("anthropic/claude-sonnet-4.5"),
  SERPER_API_KEY: z.string().optional(),
  EXA_API_KEY: z.string().optional(),
  SEO_CONFIG_PATH: z.string().default("clients/seo/client.config.json"),
});

const clientConfigEnvSchema = z.object({
  SEO_CONFIG_PATH: z.string().default("clients/seo/client.config.json"),
});

/**
 * Just the client config file — no AI/CMS secrets. Anything that doesn't
 * generate text (the dashboard, unpublish, imports) should use this so it
 * works even when OPENROUTER_API_KEY isn't set.
 */
export function loadClientConfig(configPath?: string): ClientConfig {
  const env = envSlice(clientConfigEnvSchema);
  const resolved = resolve(
    projectRoot(),
    configPath ?? env.SEO_CONFIG_PATH,
  );
  return JSON.parse(readFileSync(resolved, "utf-8")) as ClientConfig;
}

export function loadSeoConfig(): SeoConfig {
  const env = envSlice(seoEnvSchema);

  // Default: the Graphed OpenRouter proxy (injected creds in cloud and under
  // `graphed dev run --`). A raw OPENROUTER_API_KEY only wins when set.
  let openRouterApiKey = env.OPENROUTER_API_KEY ?? "";
  let openRouterBaseUrl = "https://openrouter.ai/api/v1";
  if (!openRouterApiKey) {
    const graphed = new Graphed();
    if (!graphed.isConfigured()) {
      throw new Error(
        "No LLM credentials: run under `graphed dev run -- ...` (Graphed proxy) or set OPENROUTER_API_KEY locally.",
      );
    }
    openRouterApiKey = graphed.token;
    openRouterBaseUrl = graphed.openRouter.baseUrl();
  }

  return {
    openRouterApiKey,
    openRouterBaseUrl,
    openRouterModel: env.OPENROUTER_MODEL,
    serperApiKey: env.SERPER_API_KEY,
    exaApiKey: env.EXA_API_KEY,
    client: loadClientConfig(env.SEO_CONFIG_PATH),
  };
}

// CMS secrets load lazily — only the selected CMS's env vars are required.

const ghostEnvSchema = z.object({
  GHOST_API_URL: z
    .string({ required_error: "GHOST_API_URL is not set" })
    .min(1, "GHOST_API_URL is not set"),
  GHOST_ADMIN_API_KEY: z
    .string({ required_error: "GHOST_ADMIN_API_KEY is not set" })
    .min(1, "GHOST_ADMIN_API_KEY is not set"),
});

export function ghostCredentials(): { apiUrl: string; adminApiKey: string } {
  const env = envSlice(ghostEnvSchema);
  return {
    apiUrl: env.GHOST_API_URL.replace(/\/$/, ""),
    adminApiKey: env.GHOST_ADMIN_API_KEY,
  };
}

const wordpressEnvSchema = z.object({
  WP_URL: z
    .string({ required_error: "WP_URL is not set" })
    .min(1, "WP_URL is not set"),
  WP_USERNAME: z
    .string({ required_error: "WP_USERNAME is not set" })
    .min(1, "WP_USERNAME is not set"),
  WP_APPLICATION_PASSWORD: z
    .string({ required_error: "WP_APPLICATION_PASSWORD is not set" })
    .min(1, "WP_APPLICATION_PASSWORD is not set"),
});

export function wordpressCredentials(): {
  url: string;
  username: string;
  applicationPassword: string;
} {
  const env = envSlice(wordpressEnvSchema);
  return {
    url: env.WP_URL.replace(/\/$/, ""),
    username: env.WP_USERNAME,
    applicationPassword: env.WP_APPLICATION_PASSWORD,
  };
}

const strapiEnvSchema = z.object({
  STRAPI_API_URL: z
    .string({ required_error: "STRAPI_API_URL is not set" })
    .min(1, "STRAPI_API_URL is not set"),
  STRAPI_API_TOKEN: z
    .string({ required_error: "STRAPI_API_TOKEN is not set" })
    .min(1, "STRAPI_API_TOKEN is not set"),
});

export function strapiCredentials(): { apiUrl: string; apiToken: string } {
  const env = envSlice(strapiEnvSchema);
  return {
    apiUrl: env.STRAPI_API_URL.replace(/\/$/, ""),
    apiToken: env.STRAPI_API_TOKEN,
  };
}
