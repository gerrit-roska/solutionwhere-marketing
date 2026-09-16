import { writeFileSync, mkdirSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { getDb, destroyDb } from "../packages/core/src/db";
import { getBytes } from "../packages/core/src/marketing/storage";

// Verticality audit: download every fb_creatives asset for the given date
// prefixes to a local dir so sips/ffprobe can measure exact dimensions.

const OUT = join(homedir(), "Desktop/solutionwhere-creatives/audit");
const PREFIXES = ["creatives/2026-09-16/", "creatives/2026-09-15/"];

async function main(): Promise<void> {
  const db = getDb();
  mkdirSync(OUT, { recursive: true });
  const rows = await db
    .selectFrom("fb_creatives")
    .select(["creative_id", "file_key", "format"])
    .execute();
  for (const row of rows) {
    if (!row.file_key || !PREFIXES.some((p) => row.file_key!.startsWith(p))) continue;
    const bytes = await getBytes(row.file_key);
    if (!bytes) {
      console.log(`MISSING ${row.file_key}`);
      continue;
    }
    const local = join(OUT, `${row.file_key.split("/")[1]}__${row.creative_id.replace(":", "-")}.${row.file_key.endsWith(".mp4") ? "mp4" : "png"}`);
    writeFileSync(local, bytes);
    console.log(`saved ${local}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => destroyDb());
