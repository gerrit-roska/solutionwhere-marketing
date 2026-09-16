import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { getDb, destroyDb } from "../packages/core/src/db";
import { getBytes } from "../packages/core/src/marketing/storage";

// Downloads every creative asset in fb_creatives from Graphed storage to
// ~/Desktop/solutionwhere-creatives/<date>/<creative_id>-<format>.<ext>
// for local review. Read-only against storage and the DB.

async function main(): Promise<void> {
  const rows = await getDb()
    .selectFrom("fb_creatives")
    .select(["creative_id", "format", "file_key", "status", "created_at"])
    .orderBy("created_at", "desc")
    .execute();

  const base = join(homedir(), "Desktop", "solutionwhere-creatives");
  let saved = 0;
  let missing = 0;
  for (const row of rows) {
    if (!row.file_key) {
      console.log(`SKIP ${row.creative_id} ${row.format} — no file_key`);
      missing += 1;
      continue;
    }
    const bytes = await getBytes(row.file_key);
    if (!bytes) {
      console.log(`MISS ${row.file_key}`);
      missing += 1;
      continue;
    }
    const date = new Date(row.created_at).toISOString().slice(0, 10);
    const dir = join(base, date);
    mkdirSync(dir, { recursive: true });
    const ext = row.file_key.split(".").pop() ?? (row.format === "video" ? "mp4" : "png");
    const path = join(dir, `${row.creative_id}-${row.format}-${row.status}.${ext}`);
    writeFileSync(path, Buffer.from(bytes));
    saved += 1;
    console.log(`OK ${path}`);
  }
  console.log(`done: ${saved} saved, ${missing} missing → ${base}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(destroyDb);
