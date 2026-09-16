import { getDb, destroyDb } from "../packages/core/src/db";
import { up as up4 } from "../packages/core/src/migrations/0004_seed_seo_queue";
import { up as up5 } from "../packages/core/src/migrations/0005_seed_full_state_program";
import { up as up6 } from "../packages/core/src/migrations/0006_seed_full_program";

// Re-runs the SEO seed migrations against the local DB. All three are
// idempotent (onConflict doNothing), so this is safe to run after local
// contamination — e.g. another project's seed script pointing at
// localhost:5432 and landing in this compose stack's `app` database.
//
//   npx tsx scripts/reseed-seo-queue.ts

async function main(): Promise<void> {
  const db = getDb();
  await up4(db);
  await up5(db);
  await up6(db);
  const rows = await db
    .selectFrom("seo_keywords")
    .select((eb) => eb.fn.countAll().as("n"))
    .executeTakeFirstOrThrow();
  console.log(`seo_keywords total: ${rows.n}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(destroyDb);
