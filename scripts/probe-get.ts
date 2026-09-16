import { getBytes } from "../packages/core/src/marketing/storage";

async function main(): Promise<void> {
  const key = process.argv[2];
  if (!key) throw new Error("usage: tsx scripts/probe-get.ts <key>");
  const bytes = await getBytes(key);
  if (!bytes) {
    console.log("NOT FOUND (or error):", key);
    return;
  }
  console.log("exists, bytes:", bytes.length);
  console.log(Buffer.from(bytes).toString().slice(0, 300));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
