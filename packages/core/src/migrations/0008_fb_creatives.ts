import { Kysely, sql } from "kysely";

// Meta Andromeda loop tables (07-graphed-platform-execution.md §4.10):
// fb_creatives is the factory output ledger (one row per generated asset,
// creative_id from matrix.json); fb_actions is the management agent's
// kill/scale/flip audit log (populated by fb-manage-daily once CAMP 01
// spends — that job waits on the Business Manager assets, 02 §Meta).
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("fb_creatives")
    .addColumn("creative_id", "text", (c) => c.primaryKey())
    .addColumn("persona", "text", (c) => c.notNull())
    .addColumn("angle", "text", (c) => c.notNull())
    .addColumn("module", "text", (c) => c.notNull())
    .addColumn("format", "text", (c) => c.notNull()) // video|static
    .addColumn("file_key", "text") // storage key under creatives/YYYY-MM-DD/
    .addColumn("headline", "text")
    .addColumn("primary_text", "text")
    .addColumn("fb_ad_id", "text")
    .addColumn("status", "text", (c) => c.notNull().defaultTo("generated"))
    // generated|draft|live|paused|killed
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createTable("fb_actions")
    .addColumn("id", "bigserial", (c) => c.primaryKey())
    .addColumn("run_date", "date", (c) => c.notNull())
    .addColumn("ad_id", "text")
    .addColumn("creative_id", "text")
    .addColumn("action", "text", (c) => c.notNull()) // kill|scale|rotate|flip|brief
    .addColumn("reason", "text")
    .addColumn("before", "jsonb")
    .addColumn("after", "jsonb")
    .addColumn("created_at", "timestamptz", (c) =>
      c.notNull().defaultTo(sql`now()`),
    )
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("fb_actions").execute();
  await db.schema.dropTable("fb_creatives").execute();
}
