import { Kysely, sql } from "kysely";

// Google Ads resource ledger (03-google-ads-execution.md): what the plan
// intends vs what exists in the account. The bootstrap reconciler writes one
// row per planned resource (campaign, ad group, keyword, ad, shared set,
// asset) and stamps resource_name when the object is adopted or created.
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("ads_resources")
    .addColumn("id", "bigserial", (c) => c.primaryKey())
    .addColumn("resource_type", "text", (c) => c.notNull())
    // campaign|budget|ad_group|keyword|ad|shared_set|asset|campaign_criterion
    .addColumn("plan_key", "text", (c) => c.notNull()) // e.g. pd-competitor/frontline
    .addColumn("name", "text", (c) => c.notNull())
    .addColumn("resource_name", "text") // customers/.../... once it exists
    .addColumn("status", "text", (c) => c.notNull().defaultTo("planned"))
    // planned|validated|adopted|created|error
    .addColumn("detail", "jsonb")
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .addColumn("updated_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute();
  await db.schema
    .createIndex("ads_resources_type_key_uq")
    .on("ads_resources")
    .columns(["resource_type", "plan_key", "name"])
    .unique()
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("ads_resources").execute();
}
