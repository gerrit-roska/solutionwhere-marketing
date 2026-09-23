# Solutionwhere — Graphed Build Spec

**Companion to:** `03`–`06` channel specs
**Audience:** the coding agent operating the Solutionwhere Graphed account.
**Date:** September 7, 2026
**Verified against:** `@graphed-inc/cli` 0.0.21 packaged docs, a live `graphed init` scaffold (`base@0.1.0`), the staged `seo@0.1.0` kit, and real warehouse schemas for GA4, Search Console, Google Ads, Meta Ads, HubSpot, and Instantly sources.

Everything below — manifest fields, file paths, SDK calls, table and column names, tool ids — was checked against the installed CLI. Where the platform docs and this file disagree, the docs win: run `graphed docs <topic>` and `graphed <command> --help` before guessing.

---

## 0. What runs where

| Layer | Role in this plan |
|---|---|
| **Warehouse** (ClickHouse, read-only via SDK) | Every channel's data lands here as a schema per source: `ga4_*`, `search_*`, `google_ads_*`, `fb_ads_*`, `hubspot_*`, `instantly_*`. The dashboard and guardrails query it |
| **Project** (`graphed init` → Postgres + cron jobs + Next.js dashboard) | The list pipeline, SEO queue, AEO audit, offline-conversion uploader, ads watchdog. State lives in project Postgres |
| **Tools** (`client.tools.run(...)`) | `million-verifier:validate` / `million-verifier:bulk` for the email list; Apify hatch refs for JS-rendered directories |
| **OpenRouter proxy** (`client.openRouter.baseUrl()`) | LLM calls for the AEO panel and any custom generation; the `seo` kit uses it internally |
| **Storage** (S3-compatible, `GRAPHED_STORAGE_*`) | Staging CSVs for `million-verifier:bulk`, which takes a project-storage GET URL |

**Routing rule (from `graphed docs agents`):** plugin → scaffold → hand-roll. The registry ships one kit today, `seo`, and it maps directly onto `05-seo-aeo-execution.md`. Everything else is hand-rolled inside the scaffold's conventions, then reported with `graphed feedback` so the kit gets built.

---

## 1. Setup

```sh
npm i -g @graphed-inc/cli
graphed login                                      # paid plan required for CLI tokens
graphed --format json accounts list                # copy the Solutionwhere account id → $ACCOUNT
graphed skill install --agent all                  # project-scope skill; commit it
```

**Account ownership:** a Solutionwhere-owned Graphed account with Graphed added as a collaborator — not a project inside Graphed's own account. `gtm-strategy.md` §10 describes a handoff; the account has to survive it.

Read before building:
```sh
graphed docs agents && graphed docs manifest && graphed docs sdk && graphed docs warehouse && graphed docs tools && graphed docs storage
```

---

## 2. Warehouse sources

Connect in this order. Each is a supported connector; the create URL is `https://www.graphed.com/warehouse/create/<slug>`.

| # | Source | Slug | Schema prefix | Feeds |
|---|---|---|---|---|
| 1 | Google Analytics 4 | `google-analytics` | `ga4_` | Conversions, first/last touch |
| 2 | Google Search Console | `google-search-console` | `search_` | `05` — 16 months of query data backfills on connect, replacing the dead Serper/Ahrefs keys |
| 3 | HubSpot | `hubspot` | `hubspot_` | Qualified demos, pipeline by module, `gclid` on contacts |
| 4 | Calendly | `calendly` | `calendly_` | `Schedule` conversions |
| 5 | Google Ads | `google-ads` | `google_ads_` | `03` |
| 6 | Meta Ads | `facebook-ads` | `fb_ads_` | `04` |
| 7 | Instantly | `instantly` | `instantly_` | `06` — sends, replies, bounces (Smartlead is also supported: slug `smartlead`) |
| 8 | Bing Webmaster Tools | `bing-webmaster-tools` | — | `05` §6 — Copilot reads Bing's index |

Discover the actual schema names once connected — the suffix is random per source:
```sh
graphed --format json sources list --account $ACCOUNT
# → [{ "schema_name": "ga4_buq3x8", "name": "...", "status": "ready" }, ...]
graphed warehouse schema search_xxxxxx --account $ACCOUNT        # tables + columns
```

Write the six schema names into `clients/solutionwhere/warehouse.json` (§3.4). Every query in this document references them from there.

---

## 3. The project

### 3.1 Scaffold

```sh
graphed init solutionwhere-marketing --yes --format json --account $ACCOUNT
cd solutionwhere-marketing
docker compose up -d && npm install && npm run db:migrate && npm run dev
```

What `init` produces (verified): an npm workspace with `packages/core` (`@app/core` — Kysely db, `config.ts` with `envSlice()`, numbered TypeScript migrations), `packages/jobs` (`@app/jobs` — one `src/<name>.ts` entrypoint per cron), `packages/dashboard` (`@app/dashboard` — Next.js App Router, shadcn/ui, `lib/plugins.ts` nav registry), `AGENTS.md`, `CLAUDE.md`, `Dockerfile`, `docker-compose.yml`, `.env`, and `graphed.yaml` with a `scaffold: {name: base, version: 0.1.0}` stamp. Commit `.graphed.json`.

**Conventions the scaffold's `AGENTS.md` enforces — follow them, the kits assume them:**
- Never read `process.env` in app code. Declare a zod schema and call `envSlice()` from `packages/core/src/config.ts`.
- Migrations are numbered TypeScript files (`0002_*.ts`) exporting `up`/`down`, Kysely schema builder. Never edit an applied one.
- `packages/core/src/db/types.ts` is the single registry of table types; add a row type per migration.
- Each job: entrypoint in `packages/jobs/src/<name>.ts` importing logic from `@app/core`, calling `destroyDb()` on exit; script in `packages/jobs/package.json` (`"job:<name>": "tsx src/<name>.ts"`) and a root proxy (`"job:<name>": "npm run -w @app/jobs job:<name>"`); wired into `graphed.yaml` as `jobs.<name>` with `command: npm run job:<name>`.
- Dashboard pages: one folder per capability under `app/`, registered in `lib/plugins.ts`. shadcn/ui only.
- Non-idempotent jobs use `retries: 0`.

### 3.2 Target `graphed.yaml`

Field names and shapes verified against `graphed docs manifest`.

```yaml
slug: solutionwhere-marketing
name: Solutionwhere Marketing

scaffold:
  name: base
  version: 0.1.0

databases:
  primary:
    env: DATABASE_URL

release:
  command: npm run db:migrate
  timeout_seconds: 600
  retries: 1

services:
  dashboard:
    command: node packages/dashboard/.next/standalone/packages/dashboard/server.js
    port: 3000
    healthcheck: /api/health

jobs:
  seo-publish-daily:                      # from the seo kit's manifest.yaml
    command: npm run job:seo-publish-daily
    schedule:
      cron: 0 12 * * 1-5
      timezone: America/New_York
    env:
      - OPENROUTER_API_KEY
      - SERPER_API_KEY
      - EXA_API_KEY
    retries: 0
    timeout_seconds: 1800

  list-build-nightly:
    command: npm run job:list-build-nightly
    schedule:
      cron: 0 3 * * *
      timezone: America/New_York
    retries: 0
    timeout_seconds: 7200

  verify-emails-daily:
    command: npm run job:verify-emails-daily
    schedule:
      cron: 0 5 * * *
      timezone: America/New_York
    retries: 0
    timeout_seconds: 3600

  sequencer-sync-daily:
    command: npm run job:sequencer-sync-daily
    schedule:
      cron: 30 6 * * 1-5
      timezone: America/New_York
    env:
      - INSTANTLY_API_KEY
    retries: 0
    timeout_seconds: 1800

  offline-conversions-weekly:
    command: npm run job:offline-conversions-weekly
    schedule:
      cron: 0 7 * * 1
      timezone: America/New_York
    env:
      - GOOGLE_ADS_DEVELOPER_TOKEN
      - GOOGLE_ADS_REFRESH_TOKEN
      - GOOGLE_ADS_CLIENT_ID
      - GOOGLE_ADS_CLIENT_SECRET
      - GOOGLE_ADS_CUSTOMER_ID
    retries: 0
    timeout_seconds: 900

  aeo-panel-monthly:
    command: npm run job:aeo-panel-monthly
    schedule:
      cron: 0 8 1 * *
      timezone: America/New_York
    retries: 1
    timeout_seconds: 3600

  rfp-watch-daily:
    command: npm run job:rfp-watch-daily
    schedule:
      cron: 0 6 * * 1-5
      timezone: America/New_York
    retries: 1
    timeout_seconds: 1800

  ads-guardrails-daily:
    command: npm run job:ads-guardrails-daily
    schedule:
      cron: 0 13 * * 1-5
      timezone: America/New_York
    env:
      - SLACK_WEBHOOK_URL
    retries: 1
    timeout_seconds: 900

  fb-creative-factory-weekly:
    command: npm run job:fb-creative-factory-weekly
    schedule:
      cron: 0 6 * * 1
      timezone: America/New_York
    retries: 0
    timeout_seconds: 7200

  fb-upload-drafts-weekly:
    command: npm run job:fb-upload-drafts-weekly
    schedule:
      cron: 0 9 * * 1
      timezone: America/New_York
    env:
      - FB_ACCESS_TOKEN
      - FB_AD_ACCOUNT_ID
      - FB_PAGE_ID
    retries: 0
    timeout_seconds: 3600

  fb-manage-daily:
    command: npm run job:fb-manage-daily
    schedule:
      cron: 0 7 * * *
      timezone: America/New_York
    env:
      - FB_ACCESS_TOKEN
      - FB_AD_ACCOUNT_ID
      - SLACK_WEBHOOK_URL
    retries: 0
    timeout_seconds: 900

  keyword-refresh-quarterly:
    command: npm run job:keyword-refresh-quarterly
    schedule:
      cron: 0 9 1 1,4,7,10 *
      timezone: America/New_York
    env:
      - KEYWORDS_EVERYWHERE_API_KEY       # or DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD; declare whichever is set
    retries: 0
    timeout_seconds: 1800
```

Rules the validator enforces: `schedule` is an object with `cron` and optional `timezone`; `timeout_seconds` ≤ 86400; `retries` 0–10; `env` lists secret **names** only; `GRAPHED_*` names are reserved and must not appear in `env`; a database-provided variable (`DATABASE_URL`) cannot also be a secret.

**Secrets are injected only for names in a job's `env` list.** Setting an undeclared name has no runtime effect. One secret per `secrets set` call:

```sh
graphed deploy --dry-run --account $ACCOUNT           # validates; reports missing secrets
graphed secrets set OPENROUTER_API_KEY --project solutionwhere-marketing --account $ACCOUNT
graphed secrets set SERPER_API_KEY --project solutionwhere-marketing --account $ACCOUNT
# ... one per name ...
graphed deploy --account $ACCOUNT
graphed logs --project solutionwhere-marketing --account $ACCOUNT --tail 100
```

A `409` on redeploy means the previous build is still running — wait, do not debug the manifest.

### 3.3 Migration `0002_marketing.ts`

Add to `packages/core/src/migrations/`. Row types go in `packages/core/src/db/types.ts`. Shapes match `06-cold-email-execution.md` §4 plus the tables the other jobs need.

```ts
import { Kysely, sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema.createTable("accounts")
    .addColumn("account_id", "uuid", c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("account_name", "text", c => c.notNull())
    .addColumn("account_type", "text", c => c.notNull())        // district|esa|ccrr|head_start|sea|cmo|county_network
    .addColumn("normalized_name", "text", c => c.notNull())
    .addColumn("domain", "text")
    .addColumn("website", "text")
    .addColumn("state", "varchar(2)", c => c.notNull())
    .addColumn("city", "text").addColumn("county", "text")
    .addColumn("nces_leaid", "text")
    .addColumn("enrollment", "integer").addColumn("member_districts", "integer")
    .addColumn("service_area", "text").addColumn("host_org", "text")
    .addColumn("agency_term", "text")                             // ISD|IU|ESC|BOCES|AEA|CESA|ESU|RESA|ROE|COE
    .addColumn("modules_fit", sql`text[]`, c => c.notNull().defaultTo(sql`'{}'`))
    .addColumn("priority_tier", "smallint", c => c.notNull().defaultTo(6))
    .addColumn("state_credit_system", "text")
    .addColumn("source", "text", c => c.notNull()).addColumn("source_url", "text")
    .addColumn("suppressed", "boolean", c => c.notNull().defaultTo(false))
    .addColumn("suppression_reason", "text")
    .addColumn("first_seen", "date", c => c.notNull().defaultTo(sql`current_date`))
    .addColumn("last_verified", "date")
    .execute();
  await db.schema.createIndex("accounts_domain_uq").on("accounts").column("domain").unique().execute();
  await db.schema.createIndex("accounts_state_tier").on("accounts").columns(["state", "priority_tier"]).execute();

  await db.schema.createTable("contacts")
    .addColumn("contact_id", "uuid", c => c.primaryKey().defaultTo(sql`gen_random_uuid()`))
    .addColumn("account_id", "uuid", c => c.notNull().references("accounts.account_id").onDelete("cascade"))
    .addColumn("first_name", "text").addColumn("last_name", "text")
    .addColumn("title", "text").addColumn("title_rank", "smallint")
    .addColumn("module_segment", "text")                          // pd|enrollments|coaching|referrals
    .addColumn("email", "text")
    .addColumn("email_source", "text")                            // directory|pattern|getleads|rfp|conference
    .addColumn("mv_status", "text")                               // ok|catch_all|invalid|unknown|disposable
    .addColumn("mv_verified_at", "date")
    .addColumn("phone", "text").addColumn("linkedin_url", "text")
    .addColumn("sequence_id", "text")
    .addColumn("sequence_status", "text", c => c.notNull().defaultTo("not_started"))
    .addColumn("first_sent_at", "timestamptz").addColumn("replied_at", "timestamptz")
    .addColumn("suppressed", "boolean", c => c.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", c => c.notNull().defaultTo(sql`now()`))
    .execute();
  await db.schema.createIndex("contacts_email_uq").on("contacts").column("email").unique().where("email", "is not", null).execute();

  await db.schema.createTable("suppression_domains")
    .addColumn("domain", "text", c => c.primaryKey())
    .addColumn("reason", "text", c => c.notNull())
    .addColumn("source", "text")
    .addColumn("added_date", "date", c => c.notNull().defaultTo(sql`current_date`))
    .execute();

  await db.schema.createTable("source_runs")
    .addColumn("id", "bigserial", c => c.primaryKey())
    .addColumn("source", "text", c => c.notNull())
    .addColumn("started_at", "timestamptz", c => c.notNull().defaultTo(sql`now()`))
    .addColumn("finished_at", "timestamptz")
    .addColumn("rows_seen", "integer").addColumn("rows_new", "integer").addColumn("rows_updated", "integer")
    .addColumn("error", "text")
    .execute();

  await db.schema.createTable("verification_batches")
    .addColumn("id", "bigserial", c => c.primaryKey())
    .addColumn("storage_key", "text", c => c.notNull())
    .addColumn("tool_run_id", "text")                             // trn_…
    .addColumn("email_count", "integer", c => c.notNull())
    .addColumn("status", "text", c => c.notNull().defaultTo("submitted"))
    .addColumn("billed_credits", "numeric")
    .addColumn("created_at", "timestamptz", c => c.notNull().defaultTo(sql`now()`))
    .addColumn("completed_at", "timestamptz")
    .execute();

  await db.schema.createTable("offline_conversion_uploads")
    .addColumn("id", "bigserial", c => c.primaryKey())
    .addColumn("hubspot_deal_id", "text", c => c.notNull())
    .addColumn("conversion_name", "text", c => c.notNull())
    .addColumn("gclid", "text", c => c.notNull())
    .addColumn("conversion_time", "timestamptz", c => c.notNull())
    .addColumn("conversion_value", "numeric", c => c.notNull())
    .addColumn("uploaded_at", "timestamptz")
    .addColumn("upload_error", "text")
    .execute();
  await db.schema.createIndex("ocu_deal_conv_uq").on("offline_conversion_uploads").columns(["hubspot_deal_id", "conversion_name"]).unique().execute();

  await db.schema.createTable("aeo_results")
    .addColumn("id", "bigserial", c => c.primaryKey())
    .addColumn("run_date", "date", c => c.notNull())
    .addColumn("model", "text", c => c.notNull())                 // openrouter model id, or manual:<product>
    .addColumn("prompt_id", "smallint", c => c.notNull())
    .addColumn("prompt", "text", c => c.notNull())
    .addColumn("mentioned", "boolean", c => c.notNull())
    .addColumn("cited", "boolean", c => c.notNull())
    .addColumn("position", "smallint")
    .addColumn("competitors_named", sql`text[]`, c => c.notNull().defaultTo(sql`'{}'`))
    .addColumn("raw_response", "text")
    .execute();

  await db.schema.createTable("rfp_signals")
    .addColumn("id", "bigserial", c => c.primaryKey())
    .addColumn("account_id", "uuid", c => c.references("accounts.account_id"))
    .addColumn("source", "text", c => c.notNull()).addColumn("title", "text", c => c.notNull())
    .addColumn("url", "text", c => c.notNull()).addColumn("matched_keyword", "text")
    .addColumn("posted_date", "date").addColumn("due_date", "date")
    .addColumn("seen_at", "timestamptz", c => c.notNull().defaultTo(sql`now()`))
    .addColumn("alerted_at", "timestamptz")
    .execute();
  await db.schema.createIndex("rfp_url_uq").on("rfp_signals").column("url").unique().execute();

  await db.schema.createTable("keyword_volumes")
    .addColumn("id", "bigserial", c => c.primaryKey())
    .addColumn("keyword", "text", c => c.notNull())
    .addColumn("pulled_on", "date", c => c.notNull())
    .addColumn("provider", "text", c => c.notNull())              // keywordseverywhere|dataforseo
    .addColumn("data_source", "text")                             // gkp|cli (KE only)
    .addColumn("volume", "integer", c => c.notNull().defaultTo(0))
    .addColumn("cpc_usd", "numeric").addColumn("competition", "numeric")
    .addColumn("trend_12mo", sql`integer[]`)
    .addColumn("seed", "text").addColumn("source", "text")        // for related/PASF pulls
    .addColumn("cluster", "text")                                 // brand|competitor|pd|enr|cch|ref|state|credit_system|adjacent
    .execute();
  await db.schema.createIndex("kv_keyword_pulled_uq").on("keyword_volumes").columns(["keyword", "pulled_on", "provider", "data_source"]).unique().execute();

  await db.schema.createTable("guardrail_alerts")
    .addColumn("id", "bigserial", c => c.primaryKey())
    .addColumn("check_name", "text", c => c.notNull())
    .addColumn("severity", "text", c => c.notNull())              // info|warn|critical
    .addColumn("subject", "text", c => c.notNull())               // campaign/term/ad set
    .addColumn("detail", "jsonb", c => c.notNull())
    .addColumn("fired_at", "timestamptz", c => c.notNull().defaultTo(sql`now()`))
    .addColumn("resolved_at", "timestamptz")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const t of ["guardrail_alerts","keyword_volumes","rfp_signals","aeo_results","offline_conversion_uploads",
                   "verification_batches","source_runs","suppression_domains","contacts","accounts"]) {
    await db.schema.dropTable(t).execute();
  }
}
```

### 3.4 Config

`clients/solutionwhere/warehouse.json` — the schema names from §2, read by the dashboard and guardrails:
```json
{
  "ga4": "ga4_xxxxxx",
  "searchConsole": "search_xxxxxx",
  "googleAds": "google_ads_xxxxxx",
  "metaAds": "fb_ads_xxxxxx",
  "hubspot": "hubspot_xxxxxx",
  "instantly": "instantly_xxxxxx",
  "demoEventName": "demo_request",
  "hubspotQualifiedStageId": "<stage_id from hubspot_*.deal_pipeline_stage where label = 'Qualified'>",
  "hubspotOpportunityStageId": "<stage_id where label = 'Opportunity'>"
}
```

`packages/core/src/marketing/config.ts` — env slices per job, per the scaffold convention:
```ts
import { z } from "zod";
import { envSlice } from "../config";

export const sequencerEnv = () => envSlice(z.object({ INSTANTLY_API_KEY: z.string().min(1) }));
export const googleAdsEnv = () => envSlice(z.object({
  GOOGLE_ADS_DEVELOPER_TOKEN: z.string().min(1), GOOGLE_ADS_REFRESH_TOKEN: z.string().min(1),
  GOOGLE_ADS_CLIENT_ID: z.string().min(1), GOOGLE_ADS_CLIENT_SECRET: z.string().min(1),
  GOOGLE_ADS_CUSTOMER_ID: z.string().regex(/^\d{10}$/),
}));
export const alertsEnv = () => envSlice(z.object({ SLACK_WEBHOOK_URL: z.string().url() }));
export const storageEnv = () => envSlice(z.object({
  GRAPHED_STORAGE_ENDPOINT: z.string().url(), GRAPHED_STORAGE_BUCKET: z.string().min(1),
  GRAPHED_STORAGE_ACCESS_KEY_ID: z.string().min(1), GRAPHED_STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
}));
```

### 3.5 Shared clients

`packages/core/src/marketing/graphed.ts`:
```ts
import { Graphed } from "@graphed-inc/sdk";
import OpenAI from "openai";
export const graphed = new Graphed();                  // reads injected creds at call time
export const llm = () => new OpenAI({ baseURL: graphed.openRouter.baseUrl(), apiKey: graphed.token });
```

`packages/core/src/marketing/warehouse.ts` — thin wrapper so every query carries the configured schema names:
```ts
import { graphed } from "./graphed";
import wh from "../../../../clients/solutionwhere/warehouse.json" with { type: "json" };
export const schemas = wh;
export async function wq<T = Record<string, unknown>>(sql: string, params: Record<string, string> = {}) {
  const { results } = await graphed.warehouse.query<T>(sql, params);
  return results;
}
```
Parameters are `%(name)s` placeholders and arrive server-side as strings; interpolate trusted numeric intervals and schema names in code (the `seo` kit does the same and validates schema names with `/^[a-zA-Z0-9_]+$/`). If the kit's `packages/core/src/seo/warehouse.ts` is already present, keep one copy — the kit's own comment says so.

`packages/core/src/marketing/storage.ts` — needed by the verifier because `million-verifier:bulk` takes a project-storage GET URL:
```ts
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { storageEnv } from "./config";
const env = storageEnv();
export const s3 = new S3Client({ region: "us-west-2", endpoint: env.GRAPHED_STORAGE_ENDPOINT, forcePathStyle: true,
  credentials: { accessKeyId: env.GRAPHED_STORAGE_ACCESS_KEY_ID, secretAccessKey: env.GRAPHED_STORAGE_SECRET_ACCESS_KEY } });
export async function putText(key: string, body: string, contentType = "text/csv") {
  await s3.send(new PutObjectCommand({ Bucket: env.GRAPHED_STORAGE_BUCKET, Key: key, Body: body, ContentType: contentType }));
}
export const presignGet = (key: string, seconds = 3600) =>
  getSignedUrl(s3, new GetObjectCommand({ Bucket: env.GRAPHED_STORAGE_BUCKET, Key: key }), { expiresIn: seconds });
```
Storage supports Put/Get/Head/Delete and multipart — **not** ListObjects. Track keys in `verification_batches.storage_key`.

---

## 4. Jobs

Every job follows the scaffold entrypoint shape:
```ts
// packages/jobs/src/<name>.ts
import { destroyDb } from "@app/core";
import { run } from "@app/core/marketing/<name>";
run().catch(e => { console.error(e); process.exitCode = 1; }).finally(destroyDb);
```
Trigger any job in the cloud with `graphed jobs run <name> --project solutionwhere-marketing --account $ACCOUNT`, then `graphed logs --tail 100`. Check state with `graphed databases query --database primary --project solutionwhere-marketing --account $ACCOUNT -- '<SQL>'`.

### 4.1 `seo-publish-daily` — the kit

```sh
graphed plugins add seo --apply-manifest
```
Then follow `.graphed/plugins/seo/AGENT.md` step by step. Verified steps: copy `files/packages/core/src/seo/` → `packages/core/src/seo/`; copy the migration and **rename `0000_seo.ts` to `0003_seo.ts`** (0002 is §3.3); register `SeoKeywordsTable`, `SeoArticlesTable`, `SeoPlaybooksTable` in `db/types.ts`; add `job:seo-publish-daily` scripts in both package.jsons; copy `files/clients/seo/client.config.json` → `clients/seo/client.config.json`; copy the dashboard `app/seo/` folder and append `{ key: "seo", label: "SEO", href: "/seo", group: "Channels", enabled: true }` to `pluginNavEntries`.

**`clients/seo/client.config.json` for this account:**
```json
{
  "client": {
    "name": "Solutionwhere",
    "siteUrl": "https://home.solutionwhere.com",
    "brandVoice": "Plain, specific, institutional. Short sentences. Name the state system, the agency type, and the real requirement. No feature lists, no exclamation marks, no 'in today's fast-paced world'.",
    "audience": "Directors of professional learning, curriculum directors, registrars, and early-childhood program coordinators at public school districts, regional education service agencies (ISDs, IUs, ESCs, BOCES, AEAs), and CCR&R agencies. They are compliance-driven, budget-constrained, and evaluate vendors by peer reference."
  },
  "content": {
    "defaultWordCount": 1400,
    "ctaText": "Responsible for tracking this across your staff? See how districts manage it in Solutionwhere",
    "ctaUrl": "https://home.solutionwhere.com/professional-development"
  },
  "cms": { "type": "none" },
  "metrics": { "searchConsoleSchema": "search_xxxxxx" }
}
```

`cms.type` is `none` because the site is a Next.js app on Vercel, not Ghost/WordPress/Strapi. The kit writes drafts to `seo_articles`; a separate step (`packages/core/src/seo/export-mdx.ts`, hand-written) renders `status = 'generated'` rows to MDX files and opens a PR against the site repo. Nothing auto-publishes.

**Playbook edits** (dashboard → `/seo` → Playbook & Test tab) before the first cron run — the kit stores overrides in `seo_playbooks`:
- Outline stage: first paragraph must be one liftable definitional sentence naming the state and the credit system. Last section is a Solutionwhere CTA for the district administrator. Never name Wisdomwhere.
- Draft stage: cover requirements in prose (license type, cycle, hours, unit, approver, deadline, fee). No markdown tables or pipe tables (Strapi cannot render them). Bullet lists only when a list is clearer than prose. Include a "Where districts get this wrong" section.
- Fact-check stage: any renewal-requirement figure not traceable to the research brief is replaced with "not published by the state; contact your district's certification officer." Never softened, always replaced.

**Seed the queue** from `05` §3 via the dashboard CSV import. Slugs must match the existing pattern:
```csv
keyword,slug,priority
ohio teacher certification renewal,steps-to-ohio-teacher-certification,1
pennsylvania teacher certification renewal act 48,steps-to-pennsylvania-teacher-certification,1
new york teacher certification renewal ctle,steps-to-new-york-teacher-certification,1
texas teacher certification renewal cpe,steps-to-texas-teacher-certification,1
illinois teacher certification renewal,steps-to-illinois-teacher-certification,2
```
Do **not** queue the comparison or trust pages (`05` §4, §5.2). Competitor facts and security claims are human-written.

**Acceptance:**
```
[ ] npm run job:seo-publish-daily locally → one seo_keywords row 'generated', one seo_articles row with markdown, zero CMS calls
[ ] First five generated state pages read by a human; requirements covered in prose (no pipe tables); Solutionwhere CTA at the end; no invented figures
[ ] /seo metrics strip renders GSC numbers under `graphed dev run -- npm run dev`
[ ] graphed jobs run seo-publish-daily in the cloud → logs show a completed run
[ ] Cron cadence: one page per weekday. Raise by editing `schedule.cron`, not by running it twice
```

### 4.2 `list-build-nightly`

Implements `06` §2–§3. Code in `packages/core/src/marketing/list/`, one module per source: `nces.ts`, `aesa.ts`, `ccrr-state.ts`, `headstart.ts`, `directories.ts`, `titles.ts`, `patterns.ts`.

**Rotation** (one source per night, tracked in `source_runs`):

| Night | Source | Method | Notes |
|---|---|---|---|
| Sun | NCES CCD LEA universe | CSV download from `nces.ed.gov/ccd/files.asp` | Annual data; re-run monthly is harmless. Filters per `06` §2.1 |
| Mon | AESA directory | Fetch `members.aesa.us/directory/Find` per state filter, then each `Details/{slug}-{id}` page | 482 records; 50/page cap — iterate states |
| Tue | State CCR&R networks | Per-state fetch from `data/state-source-urls.csv` | Curated URL list, maintained by hand |
| Wed | Head Start locator export | `headstart.gov/center-locator` dataset by state | Send a real UA; site 403s naive fetchers |
| Thu–Sat | Staff directories | For accounts with `last_verified` null or >90 days: try `/staff`, `/directory`, `/staff-directory`, `/administration`, `/departments`, `/contact`, then sitemap | 200 accounts/night, 1 req/domain/sec |

**Scraping tool choice.** The Graphed tools catalog has no generic web-scraper capability (searched: `scraper`, `cheerio`, `website content` — only vertical actors). So:
- Static HTML directories (most of them): in-process `fetch` + `cheerio`. No credits.
- JS-rendered directories: an **unlisted Apify hatch ref** — `apify:apify~cheerio-scraper` for server-rendered-after-JS, `apify:apify~playwright-scraper` for true SPAs. Unlisted refs run through the same `client.tools.run(...)` and are billed per Apify's pricing; `graphed tools catalog detail apify:apify~playwright-scraper` prints the input schema.

```ts
const items = await graphed.tools.run("apify:apify~cheerio-scraper", {
  startUrls: [{ url }], pageFunction: PAGE_FN_SOURCE, maxRequestsPerCrawl: 50, proxyConfiguration: { useApifyProxy: true },
}, { timeoutSeconds: 600 });
```

**Title matching:** `titles.ts` holds the dictionary from `06` §3.2 as ranked regex arrays per module. Write `contacts.title_rank` and `module_segment`.

**Pattern inference:** `patterns.ts` implements only `{first}.{last}@` and `{first}@`; skips any domain where a prior `mv_status = 'catch_all'` exists; prefers a pattern already observed for that domain.

**Suppression:** every insert into `contacts` joins `suppression_domains`; matches are written with `suppressed = true`, never dropped, so coverage reporting stays honest.

**Acceptance:**
```
[ ] After the first Sunday run: SELECT count(*) FROM accounts WHERE account_type='district' → ≥ 3,500
[ ] After Monday: SELECT count(*) FROM accounts WHERE account_type='esa' → ≥ 450 with domain not null on ≥ 90%
[ ] source_runs has a row per night with finished_at set and error null
[ ] SELECT count(*) FROM contacts WHERE email_source='directory' grows nightly; title_rank ≤ 2 on ≥ 60%
[ ] Zero rows in contacts whose account domain is in suppression_domains AND suppressed = false
[ ] Job never exceeds 1 req/sec/domain (log line per request; spot-check)
```

### 4.3 `verify-emails-daily`

`retries: 0`. Credits are money: `million-verifier:bulk` and `:validate` both bill **0.046 credits/email** (1 credit = 1¢, so ~$0.46 per 1,000).

Verified tool contract — `bulk` input is `{ url: <Graphed project-storage GET URL of a CSV/TXT, ≤100MB>, filter?: "all"|"ok"|"ok_and_catch_all"|"unknown"|"invalid" }`; output is a CSV report.

```ts
// packages/core/src/marketing/verify.ts
export async function run() {
  const db = getDb();
  const due = await db.selectFrom("contacts").select(["contact_id", "email"])
    .where("email", "is not", null).where("suppressed", "=", false)
    .where(eb => eb.or([eb("mv_verified_at", "is", null), eb("mv_verified_at", "<", sql`current_date - 90`)]))
    .limit(5000).execute();
  if (due.length === 0) return;

  const key = `mv/${new Date().toISOString().slice(0,10)}-${Date.now()}.csv`;
  await putText(key, due.map(r => r.email).join("\n"), "text/plain");
  const url = await presignGet(key, 7200);

  const batch = await db.insertInto("verification_batches").values({ storage_key: key, email_count: due.length })
    .returning("id").executeTakeFirstOrThrow();

  const started = await graphed.tools.start("million-verifier:bulk", { url, filter: "all" });
  await db.updateTable("verification_batches").set({ tool_run_id: started.id }).where("id", "=", batch.id).execute();
  await graphed.tools.wait(started.id, { timeoutSeconds: 3000 });
  const csv = await graphed.tools.downloadResult(started.id);           // CSV text
  // parse → for each row: UPDATE contacts SET mv_status = <result>, mv_verified_at = current_date
  // then: mark batch completed, record billedCredits from tools.get(started.id)
}
```
Single addresses (reply handling, one-offs) use `million-verifier:validate` with `{ email }` — sync, `ready` on start.

**Bounce circuit-breaker** — run at the top of this job before submitting anything:
```sql
SELECT sum(bounced_count) / nullif(sum(emails_sent_count), 0) AS bounce_rate
FROM {instantly}.daily_campaign_analytics
WHERE date >= today() - 7
```
If `bounce_rate > 0.02`: write a `guardrail_alerts` row (`critical`), post to Slack, and **pause every Instantly campaign** via the Instantly API. Do not resume automatically.

**Push to sequencer:** contacts with `mv_status = 'ok'`, `suppressed = false`, `sequence_status = 'not_started'`, in the current wave (`accounts.priority_tier` ≤ the active tier, `accounts.state` in the active wave) → Instantly `POST /api/v2/leads` into the campaign named `SW | {module} | {state} | {YYYY-MM}`. Write `sequence_id`, `sequence_status = 'active'`.

**Acceptance:**
```
[ ] verification_batches row per run: tool_run_id set, status 'completed', billed_credits ≈ 0.046 × email_count
[ ] SELECT mv_status, count(*) FROM contacts GROUP BY 1 — 'ok' share reported; no 'catch_all' rows ever pushed
[ ] Instantly campaign lead counts equal contacts.sequence_status='active' for that campaign name
[ ] Simulated bounce_rate 0.03 (test fixture) → alert row written and campaigns paused; job exits non-zero
```

### 4.4 `sequencer-sync-daily`

Pull reply state back from the warehouse so `contacts` is the source of truth for coverage.

```sql
-- replies with content, last 24h
SELECT lead, campaign_id, subject, body_text, timestamp_email, ai_interest_value
FROM {instantly}.emails
WHERE ue_type = 2                      -- inbound; confirm the code against a known reply row
  AND timestamp_email >= now() - INTERVAL 1 DAY
```
Map `lead` (email) → `contacts.email`; set `sequence_status = 'replied'`, `replied_at`. Classify with the LLM (`interested | referral | not_now | remove | ooo | bounce | hostile`) per `06` §8 and route: `interested` and `referral` → create/update the HubSpot contact + a task for the AE; `remove` and `hostile` → `suppression_domains`. Confirm the `ue_type` codes empirically on the first run — the schema exposes them but does not document them.

**Acceptance:** every inbound reply in `emails` has a matching `contacts.replied_at` within 24h; `remove` classifications appear in `suppression_domains` the same day.

### 4.5 `offline-conversions-weekly`

The HubSpot source exposes `contact.property_gclid` (also `property_fbclid`, `property_form_gclid`, `property_first_touch_gclid`) — so once the site writes `gclid` to the contact per `03` §5.2, this job is a warehouse query plus one API upload.

```sql
SELECT d.deal_id, d.property_dealname, d.property_amount,
       ds.value AS stage_id, ds.date_entered,
       c.property_gclid AS gclid
FROM {hubspot}.deal d
JOIN {hubspot}.deal_stage ds ON ds.deal_id = d.deal_id
JOIN {hubspot}.deal_contact dc ON dc.deal_id = d.deal_id
JOIN {hubspot}.contact c ON c.id = dc.contact_id
WHERE ds.value IN (%(qualified_stage)s, %(opportunity_stage)s)
  AND ds.date_entered >= now() - INTERVAL 8 DAY
  AND c.property_gclid != ''
```
For each row not already in `offline_conversion_uploads`: conversion name `qualified_demo` ($3,000) or `opportunity_created` ($10,000 — observe-only in Google, per `03` §5.1), `conversion_time = date_entered` in `America/New_York`, upload via the Google Ads API `ConversionUploadService.UploadClickConversions` using the `google-ads-api` npm package with the five `GOOGLE_ADS_*` secrets. Write `uploaded_at` or `upload_error`.

**Acceptance:**
```
[ ] Dry run (env flag) prints the rows it would upload; count matches the SQL above
[ ] After a live run: Google Ads → Conversions → qualified_demo shows the uploaded count within 24h
[ ] Re-running the same week uploads zero rows (unique index on deal_id + conversion_name)
[ ] Blocked until: hubspot_*.contact has ≥ 1 row with property_gclid != '' — that is the site-side plumbing gate
```

### 4.6 `aeo-panel-monthly`

The 20 prompts from `05` §6.7, through the OpenRouter proxy, across a fixed model list.

```ts
const MODELS = ["openai/gpt-4o", "anthropic/claude-sonnet-4.5", "google/gemini-2.5-pro", "perplexity/sonar-pro"];
const client = llm();
for (const model of MODELS) for (const [i, prompt] of PROMPTS.entries()) {
  const r = await client.chat.completions.create({ model, messages: [{ role: "user", content: prompt }], temperature: 0 });
  const text = r.choices[0]?.message?.content ?? "";
  const mentioned = /solutionwhere|wisdomwhere/i.test(text);
  const cited = /solutionwhere\.com/i.test(text);
  const competitors = COMPETITOR_NAMES.filter(n => new RegExp(n, "i").test(text));
  await db.insertInto("aeo_results").values({ run_date, model, prompt_id: i + 1, prompt, mentioned, cited,
    position: mentioned ? rankOf(text, "solutionwhere") : null, competitors_named: competitors, raw_response: text }).execute();
}
```
`perplexity/sonar-pro` is the one model in the list with live retrieval — it is the closest automated proxy for "what an assistant with search says." The other three measure model-weight presence. Both matter; chart them separately.

**Manual quarterly pass** (a human, 30 minutes): the same 20 prompts in ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews, logged with `model = 'manual:<product>'` via a dashboard form that writes the same table.

**Acceptance:** 80 rows per automated run (4 models × 20); `raw_response` non-empty; baseline run completed before month 2 so there is a "before"; `/aeo` page shows mentioned-out-of-20 by model by month.

### 4.7 `rfp-watch-daily`

Sources per `06` §2.7. Fetch each feed, match the keyword list, join to `accounts` on normalized agency name + state, write `rfp_signals` (unique on `url`), and post new rows to Slack with the account's priority tier and any open HubSpot deal. Never enqueue into a sequence.

**Acceptance:** `rfp_signals` rows have `alerted_at` set within the run; duplicate URLs across days produce no new rows.

### 4.8 `ads-guardrails-daily`

The watchdog for the failure modes in `03` and `04`. All queries are against verified column names. Each check writes a `guardrail_alerts` row and posts to Slack; `critical` checks also page.

**Google Ads — a campaign type that must not exist** (`critical`):
```sql
SELECT id, name, advertising_channel_type, advertising_channel_subtype
FROM {googleAds}.campaign_history
WHERE status = 'ENABLED'
  AND (advertising_channel_type != 'SEARCH' OR advertising_channel_subtype IN ('SEARCH_MOBILE_APP','SHOPPING_SMART_ADS'))
ORDER BY updated_at DESC LIMIT 1 BY id
```

**Google Ads — network settings drifted** (`critical`):
```sql
SELECT campaign_id, target_content_network, target_partner_search_network
FROM {googleAds}.campaign_network_setting_history
ORDER BY updated_at DESC LIMIT 1 BY campaign_id
HAVING target_content_network = 1 OR target_partner_search_network = 1
```

**Google Ads — bidding drifted off manual CPC** (`warn`):
```sql
SELECT campaign_id, type, enhanced_cpc_enabled
FROM {googleAds}.campaign_bidding_strategy_history
ORDER BY updated_at DESC LIMIT 1 BY campaign_id
HAVING type != 'MANUAL_CPC' OR enhanced_cpc_enabled = 1
```

**Google Ads — a broad-match keyword appeared** (`critical`):
```sql
SELECT ad_group_id, keyword_text, keyword_match_type
FROM {googleAds}.ad_group_criterion_history
WHERE keyword_text != '' AND negative = 0 AND status = 'ENABLED' AND keyword_match_type = 'BROAD'
```

**Google Ads — wasted search terms** (`warn`; feeds the negative list):
```sql
SELECT search_term, campaign_id, sum(cost_micros)/1e6 AS cost, sum(clicks) AS clicks, sum(conversions) AS conv
FROM {googleAds}.search_term_keyword_stats
WHERE date >= today() - 7
GROUP BY search_term, campaign_id
HAVING cost >= 25 AND conv = 0
   AND multiSearchAnyCaseInsensitive(search_term, ['daycare','near me','jobs','salary','free','tuition','parent','babysitter','nanny','brightwheel','procare','lms','sis']) > 0
ORDER BY cost DESC
```

**Google Ads — keyword over $400, zero conversions, 30 days** (`warn`):
```sql
SELECT ad_group_criterion_criterion_id, ad_group_id, sum(cost_micros)/1e6 AS cost, sum(conversions) AS conv
FROM {googleAds}.keyword_stats WHERE date >= today() - 30
GROUP BY 1, 2 HAVING cost > 400 AND conv = 0
```

**Google Ads — cost per qualified demo by campaign** (`warn` > $1,500):
```sql
WITH spend AS (
  SELECT id AS campaign_id, sum(cost_micros)/1e6 AS cost FROM {googleAds}.campaign_stats
  WHERE date >= toStartOfMonth(today()) GROUP BY id)
SELECT s.campaign_id, s.cost, q.qualified, s.cost / nullif(q.qualified, 0) AS cpqd
FROM spend s
LEFT JOIN (SELECT campaign_id, count() AS qualified FROM project_offline_conversions_view GROUP BY campaign_id) q USING campaign_id
```
(`qualified` per campaign comes from `offline_conversion_uploads` joined to the click's campaign via the Google Ads click-view API at upload time; store `campaign_id` on the upload row. Until that exists, report account-level cost per qualified demo.)

**Installed-base contamination** (`warn` > 15%):
```sql
SELECT sumIf(event_count, event_name = 'support_or_login_click') / nullif(sumIf(event_count, event_name = 'session_start'), 0) AS share
FROM {ga4}.events_report
WHERE date >= today() - 7
```
(`events_report` is property-level; for paid-only share, use `traffic_acquisition_session_source_medium_report` filtered `session_medium = 'cpc'` for sessions and join a paid-session custom dimension once GA4 has one.)

**Meta — frequency above 4.0/7d on any ad set** (`warn`):
```sql
SELECT adset_id, adset_name, campaign_name, avg(frequency) AS freq
FROM {metaAds}.basic_ad_set WHERE date >= today() - 7
GROUP BY 1,2,3 HAVING freq > 4.0
```

**Meta — an ad set with no exclusions, or an objective off the allowed list** (`critical`):
```sql
SELECT id, name, optimization_goal, targeting_exclusions
FROM {metaAds}.ad_set_history
WHERE effective_status = 'ACTIVE'
ORDER BY updated_time DESC LIMIT 1 BY id
HAVING targeting_exclusions = '' OR targeting_exclusions IS NULL
```
```sql
SELECT id, name, objective FROM {metaAds}.campaign_history
WHERE effective_status = 'ACTIVE' AND objective NOT IN ('OUTCOME_SALES','OUTCOME_AWARENESS')
ORDER BY updated_time DESC LIMIT 1 BY id
```

**Meta — self-reported vs GA4-attributed conversions > 2×** (`info`, weekly):
```sql
SELECT sum(value) AS meta_leads FROM {metaAds}.basic_campaign_actions
WHERE action_type = 'lead' AND date >= today() - 28
```
vs
```sql
SELECT sum(key_events) AS ga4_meta_leads FROM {ga4}.traffic_acquisition_session_source_medium_report
WHERE session_source IN ('facebook','fb','instagram','ig') AND session_medium = 'paid_social' AND date >= today() - 28
```

**Acceptance:**
```
[ ] Seed a deliberately broad-match keyword in a paused test campaign → critical alert within one run; remove it → resolved_at set next run
[ ] Every check runs even when a prior one alerts (no early return)
[ ] Slack message names the check, the subject, and the spec section that explains why it matters
```

### 4.10 The Meta Andromeda loop — three jobs

Implements `04-meta-ads-execution.md` §5–§7 and the playbook in `notion-docs/b2b-facebook-andromeda-guide.md`. Tables (add to the migration): `fb_creatives (creative_id pk, persona, angle, module, format, file_key, headline, primary_text, fb_ad_id, status, created_at)` and `fb_actions (id, run_date, ad_id, creative_id, action, reason, before jsonb, after jsonb)`.

**`fb-creative-factory-weekly`** — reads `clients/solutionwhere/creative/matrix.json` (persona × angle rows, weighted by last week's brief); for each row writes a 30-second script and copy via the OpenRouter proxy (`llm()`), generates video through Graphed Tools (`heygen:videos.avatar_iii` — `graphed tools catalog detail heygen:videos.avatar_iii` for the input schema; avatar/voice ids in `clients/solutionwhere/creative/config.json`) and statics via a `kie:` image model or a templated PNG; stores assets in project storage under `creatives/YYYY-MM-DD/`; inserts `fb_creatives` rows with `status = 'generated'`. Target ≥ 100 assets/run; unique headline per row enforced in code.

**`fb-upload-drafts-weekly`** — adapts `src/fb-ads/fb-ads-draft.ts` + `fb-api-client.ts` from the Graphed repo into `packages/core/src/marketing/fb/`. For each `generated` creative: upload media, create the creative object with per-row copy and the module landing URL + UTMs, create the ad **PAUSED** in the module's broad ad set (ad-set ids in config), name = `{creative_id} | {persona} | {angle}`. Writes `fb_ad_id`, `status = 'draft'`. Stops and logs on the first API error; never retries silently.

**`fb-manage-daily`** — the rules in `04` §7 against the warehouse:
```sql
-- 7-day ad performance joined to persona/angle
SELECT a.ad_id, a.ad_name, sum(a.spend) AS spend,
       sumIf(x.value, x.action_type = 'lead') AS leads,
       sumIf(x.value, x.action_type = 'offsite_conversion.custom.qualified_demo') AS qualified
FROM {metaAds}.basic_ad a
LEFT JOIN {metaAds}.basic_ad_actions x ON x.ad_id = a.ad_id AND x.date = a.date
WHERE a.date >= today() - 7
GROUP BY a.ad_id, a.ad_name
```
(join `ad_name` → `creative_id` prefix → `fb_creatives.persona/angle`; confirm the custom-event `action_type` string in Events Manager on first run). Kill/scale/rotate/flip per `04` §7, every change written to `fb_actions` with before/after; account-wide daily budget increase capped at 30% in code; aggregates CPL and CPQD by persona and angle; rewrites `matrix.json` weights for the next factory run; posts the Slack summary; alerts when `FB_ACCESS_TOKEN` is > 50 days old (store the issue date in config).

**Acceptance:**
```
[ ] Factory run → ≥ 100 fb_creatives rows, all headlines unique, assets downloadable from storage
[ ] Upload run → every generated row has fb_ad_id and status 'draft'; all ads PAUSED in Ads Manager
[ ] Manage run on a seeded losing ad → fb_actions row 'pause' with reason; ad paused in API
[ ] Manage run never increases total daily budget > 30% (unit test on the planner)
[ ] Slack summary names top 2 personas and top 2 angles; matrix.json weights change accordingly
[ ] Optimization-event flip fires only when qualified_demo ≥ 25 / 30d on that ad set
```

### 4.9 `keyword-refresh-quarterly`

Re-pulls volume for every term in `clients/solutionwhere/data/keyword-terms.txt` plus every query Search Console has surfaced in the last 90 days, through **Keywords Everywhere or DataForSEO** — whichever secret is declared. `retries: 0`: both providers bill per keyword.

Code: copy `src/keyword-research.ts` from the Graphed repo into `packages/core/src/marketing/keywords.ts` (it is provider-agnostic; strip the CLI `main()` and export `keVolumes`, `dfsVolumes`, `keRelated`, `dfsRelated`). Env slice:

```ts
export const keywordProviderEnv = () => envSlice(z.object({
  KEYWORDS_EVERYWHERE_API_KEY: z.string().min(1).optional(),
  DATAFORSEO_LOGIN: z.string().min(1).optional(),
  DATAFORSEO_PASSWORD: z.string().min(1).optional(),
}).refine(e => e.KEYWORDS_EVERYWHERE_API_KEY || (e.DATAFORSEO_LOGIN && e.DATAFORSEO_PASSWORD),
  "Set KEYWORDS_EVERYWHERE_API_KEY or DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD"));
```

**Steps:**
1. Terms = `keyword-terms.txt` ∪ Search Console queries with ≥ 5 impressions in 90 days:
   ```sql
   SELECT query, sum(impressions) AS imp FROM {searchConsole}.keyword_site_report_by_site
   WHERE date >= today() - 90 GROUP BY query HAVING imp >= 5
   ```
2. Pull volumes (KE: 100/request; DataForSEO: 1,000/task). Insert into `keyword_volumes` with `pulled_on = today`, `provider`, and `cluster` inferred from a regex map (brand / competitor / state / credit_system / module).
3. Diff against the previous pull and write `guardrail_alerts` rows (`info`) for the thresholds in `08` §7.5: a term crossing 50/mo, a competitor brand crossing 1,000/mo, a credit-system term crossing 500/mo.
4. Re-rank the `seo_keywords` queue: `UPDATE seo_keywords SET priority = <rank by latest volume>` for pending rows whose keyword matches — so the seo kit generates the highest-volume pages first without anyone editing the queue by hand.

**Acceptance:**
```
[ ] One row per term in keyword_volumes for today's pulled_on; count ≥ size of keyword-terms.txt
[ ] Provider cost logged (KE: credits delta; DFS: sum of task cost) and under $20 per run
[ ] Threshold crossings appear as guardrail_alerts info rows and in Slack
[ ] seo_keywords.priority changed for at least one pending row when volumes shifted
[ ] Running with neither provider secret declared fails fast with the refine() message, not mid-run
```

---

## 5. Dashboard

Route folder `packages/dashboard/app/overview/` registered in `lib/plugins.ts` as `{ key: "overview", label: "Overview", href: "/overview", group: "Marketing", enabled: true }`. Sub-pages `/paid`, `/email`, `/aeo`. The `seo` kit owns `/seo`. shadcn/ui components only; query through `@app/core` (`getDb()` for project tables, `wq()` for the warehouse).

**Top strip — the numbers that decide budget** (`gtm-strategy.md` §9):

| Tile | Query |
|---|---|
| Qualified demos, MTD | `SELECT count() FROM offline_conversion_uploads WHERE conversion_name='qualified_demo' AND conversion_time >= date_trunc('month', now())` (project Postgres) |
| Cost per qualified demo | (Google + Meta MTD spend) ÷ tile above. Spend: `SELECT sum(cost_micros)/1e6 FROM {googleAds}.campaign_stats WHERE date >= toStartOfMonth(today())` + `SELECT sum(spend) FROM {metaAds}.basic_campaign WHERE date >= toStartOfMonth(today())` |
| Demo requests, MTD | `SELECT sum(key_events) FROM {ga4}.conversions_report WHERE event_name = %(demoEventName)s AND date >= toStartOfMonth(today())` |
| Pipeline by module | `SELECT d.property_interested_products AS module, sum(toFloat64OrZero(d.property_amount)) FROM {hubspot}.deal d WHERE d.property_hs_is_closed = 'false' GROUP BY 1` — confirm the module property name in HubSpot; the demo form's module picker must write to it |
| Named-account coverage | `SELECT state, priority_tier, countIf(sequenced) / count() FROM (SELECT a.state, a.priority_tier, exists(SELECT 1 FROM contacts c WHERE c.account_id = a.account_id AND c.first_sent_at IS NOT NULL) AS sequenced FROM accounts a WHERE NOT a.suppressed) GROUP BY 1,2` (project Postgres) |
| Installed-base contamination | §4.8 query |

**Paid page:** by campaign, MTD and trailing 28 — spend, clicks, demo requests, qualified demos, cost per qualified demo. Google from `campaign_stats` joined to `campaign_history` (latest row per `id`) for `name`; Meta from `basic_campaign`. Both on the same table so they are judged on the same axis.

**Email page:** by campaign name (`SW | module | state | month`) — `contacted_count`, `emails_sent_count`, `reply_count_unique`, `bounced_count`, `unsubscribed_count` from `{instantly}.campaign_analytics`; daily trend from `daily_campaign_analytics`; the 2% bounce line drawn on the chart; the ABM holdout comparison (`04` §9) as reply rate for accounts in `CL_ABM_All` vs held out — flag on `accounts.abm_holdout` (add a boolean column in a later migration).

**SEO:** the kit's `/seo` console. Add one tile: organic demo requests — `{ga4}.landing_page_daily_session_source_medium` filtered `session_medium = 'organic'`, summed `key_events`.

**AEO page:** `SELECT run_date, model, countIf(mentioned) AS mentioned, countIf(cited) AS cited FROM aeo_results GROUP BY 1,2 ORDER BY 1` as a line per model; manual points styled differently; a form that inserts `model = 'manual:<product>'` rows.

**Attribution rule:** the number of record is first-touch at the account level, recorded by a human in HubSpot. GA4 first/last touch and Meta's self-report are shown beside it as cross-checks; where Meta exceeds GA4's Meta-attributed number by more than 2×, show GA4.

---

## 6. Build order

| Week | Do | Verify |
|---|---|---|
| **0 — today** | Cold email starts: suppression list from HubSpot, cross-sell sequence to 30+ customers from the main domain, peer-referral outreach from an existing mailbox, cold domains bought + warmup started (`06` §7.2). None of this needs Graphed | Sends going out today; warmup clock running |
| 1 | `graphed login`; skill install; connect GA4 + Search Console; `graphed init`; first `deploy` of the bare scaffold | `sources list` shows both `ready`; dashboard healthcheck green |
| 1 | Write `warehouse.json`; migration `0002_marketing.ts`; `npm run db:migrate` locally and via `release` on deploy | `graphed databases query ... -- '\dt'` lists the nine tables |
| 2 | `graphed plugins add seo --apply-manifest`; integrate per AGENT.md; seed 8 credit-system states; edit playbooks; run one locally | §4.1 acceptance |
| 2 | Connect HubSpot + Calendly; suppression list imported from HubSpot customers | `suppression_domains` ≥ every current-customer domain |
| 3 | `list-build-nightly` — NCES + AESA modules first; deploy; run once by hand | §4.2 acceptance |
| 3 | `verify-emails-daily` with the bounce breaker; storage + presign path tested locally under `graphed dev run` | §4.3 acceptance on a 50-email batch |
| 4 | `sequencer-sync-daily`; Instantly connected as a source; `/overview` top strip + `/email` page | Coverage tile matches a hand count for one state |
| 5 | Connect Google Ads + Meta Ads sources; `ads-guardrails-daily`; `/paid` page | §4.8 acceptance with a seeded broad-match keyword |
| 5 | Meta: CAPI + EMQ ≥ 6 (site-side), `matrix.json` from the ICP personas, `fb-creative-factory-weekly` first run, `fb-upload-drafts-weekly` → 100 paused drafts | §4.10 acceptance; drafts reviewed by a human before any go live |
| 6 | `fb-manage-daily` live once CAMP 01 is spending | §4.10 acceptance; first Slack summary |
| 6 | `offline-conversions-weekly` — after the site writes `gclid` to HubSpot | §4.5 acceptance |
| 7 | `aeo-panel-monthly` baseline run; `/aeo` page | 80 rows; baseline snapshot saved |
| 8 | `rfp-watch-daily`; MDX export step for generated SEO pages; first PR to the site repo | `rfp_signals` populated; PR opened with ≥ 5 state pages |
| 8 | `keyword-refresh-quarterly` — run once by hand to seed `keyword_volumes` from `data/keyword-terms.txt`; it then re-ranks the seo queue | §4.9 acceptance; `seo_keywords` priorities reflect `08` §4 ordering |

**External gates, not Graphed's:** cold-email domains warming by **Sept 8** (`06` §7.2); conversion tracking live on the site before any paid spend (`01-conversion-tracking-spec.md`); `gclid` persisted to HubSpot before §4.5 can run.

---

## 7. Feedback to the registry

Three capabilities here have no kit. After they work, file them so the next account gets them staged:

```sh
graphed feedback "Missing kit: public-sector list builder — NCES CCD + AESA + state directory ingestion, staff-directory crawl, title ranking, MV bulk verify via storage presign, Instantly push with bounce circuit-breaker. Built by hand in solutionwhere-marketing (packages/core/src/marketing/list, verify.ts)."
graphed feedback "Missing kit: AEO prompt panel — fixed prompt set × OpenRouter models incl. perplexity/sonar-pro, mention/citation logging, monthly cron, dashboard trend, manual-entry form. Built in solutionwhere-marketing (aeo-panel-monthly)."
graphed feedback "Missing kit: paid-ads guardrails — Google Ads campaign-type/network/bidding/match-type drift, search-term waste, Meta frequency + exclusion checks, Slack alerts, resolved_at tracking. Built in solutionwhere-marketing (ads-guardrails-daily)."
```
