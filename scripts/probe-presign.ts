import { presignGet } from "../packages/core/src/marketing/storage";

async function main(): Promise<void> {
  const key = process.argv[2];
  const seconds = Number(process.argv[3] ?? "600");
  if (!key) throw new Error("usage: tsx scripts/probe-presign.ts <key> [seconds]");
  console.log(await presignGet(key, seconds));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
