import { destroyDb } from "../packages/core/src/db";
import { run } from "../packages/core/src/email/waterfall";

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

const waveRaw = arg("--wave");
const waveEmails = waveRaw ? Number(waveRaw) : undefined;

run({
  skipApify: process.argv.includes("--skip-apify"),
  fromSnapshot: process.argv.includes("--from-snapshot"),
  bulk: process.argv.includes("--bulk"),
  uploadOnly: process.argv.includes("--upload-only"),
  tam: process.argv.includes("--tam"),
  resumeMv: arg("--resume-mv"),
  waveEmails: Number.isFinite(waveEmails) ? waveEmails : undefined,
})
  .then((report) => {
    console.log(JSON.stringify(report, null, 2));
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(destroyDb);
