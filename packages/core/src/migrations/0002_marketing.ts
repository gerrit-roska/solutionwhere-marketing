import { Kysely, sql } from "kysely";

// Marketing system tables per the Solutionwhere platform spec
// (07-graphed-platform-execution.md §3.3): named-account list pipeline,
// email verification batches, offline conversions, AEO panel, RFP watch,
// keyword volumes, and ads guardrail alerts.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("accounts")
    .addColumn("account_id", "uuid", (c) =>
      c.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("account_name", "text", (c) => c.notNull())
    .addColumn("account_type", "text", (c) => c.notNull()) // district|esa|ccrr|head_start|sea|cmo|county_network
    .addColumn("normalized_name", "text", (c) => c.notNull())
    .addColumn("domain", "text")
    .addColumn("website", "text")
    .addColumn("state", "varchar(2)", (c) => c.notNull())
    .addColumn("city", "text")
    .addColumn("county", "text")
    .addColumn("nces_leaid", "text")
    .addColumn("enrollment", "integer")
    .addColumn("member_districts", "integer")
    .addColumn("service_area", "text")
    .addColumn("host_org", "text")
    .addColumn("agency_term", "text") // ISD|IU|ESC|BOCES|AEA|CESA|ESU|RESA|ROE|COE
    .addColumn("modules_fit", sql`text[]`, (c) =>
      c.notNull().defaultTo(sql`'{}'`),
    )
    .addColumn("priority_tier", "smallint", (c) => c.notNull().defaultTo(6))
    .addColumn("state_credit_system", "text")
    .addColumn("source", "text", (c) => c.notNull())
    .addColumn("source_url", "text")
    .addColumn("suppressed", "boolean", (c) => c.notNull().defaultTo(false))
    .addColumn("suppression_reason", "text")
    .addColumn("first_seen", "date", (c) =>
      c.notNull().defaultTo(sql`current_date`),
    )
    .addColumn("last_verified", "date")
    .execute();
  await db.schema
    .createIndex("accounts_domain_uq")
    .on("accounts")
    .column("domain")
    .unique()
    .execute();
  await db.schema
    .createIndex("accounts_state_tier")
    .on("accounts")
    .columns(["state", "priority_tier"])
    .execute();

  await db.schema
    .createTable("contacts")
    .addColumn("contact_id", "uuid", (c) =>
      c.primaryKey().defaultTo(sql`gen_random_uuid()`),
    )
    .addColumn("account_id", "uuid", (c) =>
      c.notNull().references("accounts.account_id").onDelete("cascade"),
    )
    .addColumn("first_name", "text")
    .addColumn("last_name", "text")
    .addColumn("title", "text")
    .addColumn("title_rank", "smallint")
    .addColumn("module_segment", "text") // pd|enrollments|coaching|referrals
    .addColumn("email", "text")
    .addColumn("email_source", "text") // directory|pattern|getleads|rfp|conference
    .addColumn("mv_status", "text") // ok|catch_all|invalid|unknown|disposable
    .addColumn("mv_verified_at", "date")
    .addColumn("phone", "text")
    .addColumn("linkedin_url", "text")
    .addColumn("sequence_id", "text")
    .addColumn("sequence_status", "text", (c) =>
      c.notNull().defaultTo("not_started"),
    )
    .addColumn("first_sent_at", "timestamptz")
    .addColumn("replied_at", "timestamptz")
    .addColumn("suppressed", "boolean", (c) => c.notNull().defaultTo(false))
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute();
  await db.schema
    .createIndex("contacts_email_uq")
    .on("contacts")
    .column("email")
    .unique()
    .where("email", "is not", null)
    .execute();

  await db.schema
    .createTable("suppression_domains")
    .addColumn("domain", "text", (c) => c.primaryKey())
    .addColumn("reason", "text", (c) => c.notNull())
    .addColumn("source", "text")
    .addColumn("added_date", "date", (c) =>
      c.notNull().defaultTo(sql`current_date`),
    )
    .execute();

  await db.schema
    .createTable("source_runs")
    .addColumn("id", "bigserial", (c) => c.primaryKey())
    .addColumn("source", "text", (c) => c.notNull())
    .addColumn("started_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addColumn("finished_at", "timestamptz")
    .addColumn("rows_seen", "integer")
    .addColumn("rows_new", "integer")
    .addColumn("rows_updated", "integer")
    .addColumn("error", "text")
    .execute();

  await db.schema
    .createTable("verification_batches")
    .addColumn("id", "bigserial", (c) => c.primaryKey())
    .addColumn("storage_key", "text", (c) => c.notNull())
    .addColumn("tool_run_id", "text") // trn_…
    .addColumn("email_count", "integer", (c) => c.notNull())
    .addColumn("status", "text", (c) => c.notNull().defaultTo("submitted"))
    .addColumn("billed_credits", "numeric")
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addColumn("completed_at", "timestamptz")
    .execute();

  await db.schema
    .createTable("offline_conversion_uploads")
    .addColumn("id", "bigserial", (c) => c.primaryKey())
    .addColumn("crm_deal_id", "text", (c) => c.notNull())
    .addColumn("conversion_name", "text", (c) => c.notNull())
    .addColumn("gclid", "text", (c) => c.notNull())
    .addColumn("conversion_time", "timestamptz", (c) => c.notNull())
    .addColumn("conversion_value", "numeric", (c) => c.notNull())
    .addColumn("uploaded_at", "timestamptz")
    .addColumn("upload_error", "text")
    .execute();
  await db.schema
    .createIndex("ocu_deal_conv_uq")
    .on("offline_conversion_uploads")
    .columns(["crm_deal_id", "conversion_name"])
    .unique()
    .execute();

  await db.schema
    .createTable("aeo_results")
    .addColumn("id", "bigserial", (c) => c.primaryKey())
    .addColumn("run_date", "date", (c) => c.notNull())
    .addColumn("model", "text", (c) => c.notNull()) // openrouter model id, or manual:<product>
    .addColumn("prompt_id", "smallint", (c) => c.notNull())
    .addColumn("prompt", "text", (c) => c.notNull())
    .addColumn("mentioned", "boolean", (c) => c.notNull())
    .addColumn("cited", "boolean", (c) => c.notNull())
    .addColumn("position", "smallint")
    .addColumn("competitors_named", sql`text[]`, (c) =>
      c.notNull().defaultTo(sql`'{}'`),
    )
    .addColumn("raw_response", "text")
    .execute();

  await db.schema
    .createTable("rfp_signals")
    .addColumn("id", "bigserial", (c) => c.primaryKey())
    .addColumn("account_id", "uuid", (c) => c.references("accounts.account_id"))
    .addColumn("source", "text", (c) => c.notNull())
    .addColumn("title", "text", (c) => c.notNull())
    .addColumn("url", "text", (c) => c.notNull())
    .addColumn("matched_keyword", "text")
    .addColumn("posted_date", "date")
    .addColumn("due_date", "date")
    .addColumn("seen_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addColumn("alerted_at", "timestamptz")
    .execute();
  await db.schema
    .createIndex("rfp_url_uq")
    .on("rfp_signals")
    .column("url")
    .unique()
    .execute();

  await db.schema
    .createTable("keyword_volumes")
    .addColumn("id", "bigserial", (c) => c.primaryKey())
    .addColumn("keyword", "text", (c) => c.notNull())
    .addColumn("pulled_on", "date", (c) => c.notNull())
    .addColumn("provider", "text", (c) => c.notNull()) // keywordseverywhere|dataforseo
    .addColumn("data_source", "text") // gkp|cli (KE only)
    .addColumn("volume", "integer", (c) => c.notNull().defaultTo(0))
    .addColumn("cpc_usd", "numeric")
    .addColumn("competition", "numeric")
    .addColumn("trend_12mo", sql`integer[]`)
    .addColumn("seed", "text")
    .addColumn("source", "text")
    .addColumn("cluster", "text") // brand|competitor|pd|enr|cch|ref|state|credit_system|adjacent
    .execute();
  await db.schema
    .createIndex("kv_keyword_pulled_uq")
    .on("keyword_volumes")
    .columns(["keyword", "pulled_on", "provider", "data_source"])
    .unique()
    .execute();

  await db.schema
    .createTable("guardrail_alerts")
    .addColumn("id", "bigserial", (c) => c.primaryKey())
    .addColumn("check_name", "text", (c) => c.notNull())
    .addColumn("severity", "text", (c) => c.notNull()) // info|warn|critical
    .addColumn("subject", "text", (c) => c.notNull())
    .addColumn("detail", "jsonb", (c) => c.notNull())
    .addColumn("fired_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addColumn("resolved_at", "timestamptz")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const t of [
    "guardrail_alerts",
    "keyword_volumes",
    "rfp_signals",
    "aeo_results",
    "offline_conversion_uploads",
    "verification_batches",
    "source_runs",
    "suppression_domains",
    "contacts",
    "accounts",
  ]) {
    await db.schema.dropTable(t).execute();
  }
}
