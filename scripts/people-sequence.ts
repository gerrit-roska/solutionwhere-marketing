import { destroyDb } from "../packages/core/src/db";
import { PEOPLE_WAVES } from "../packages/core/src/marketing/list/waves";
import { run } from "../packages/core/src/email/people-sequence";

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

const wave = arg("--wave") ?? "next";
const limitRaw = arg("--limit");
const limit = limitRaw ? Number(limitRaw) : undefined;

if (process.argv.includes("--help")) {
  console.log(`Usage: npx tsx scripts/people-sequence.ts [--wave next|${PEOPLE_WAVES.map((w) => w.id).join("|")}] [--limit 40] [--status] [--skip-verify] [--skip-instantly]
`);
  process.exit(0);
}

run({
  wave,
  limit: Number.isFinite(limit) ? limit : undefined,
  statusOnly: process.argv.includes("--status"),
  skipVerify: process.argv.includes("--skip-verify"),
  skipInstantly: process.argv.includes("--skip-instantly"),
})
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(destroyDb);
