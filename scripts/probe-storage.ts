import { putText, presignGet, getBytes } from "../packages/core/src/marketing/storage";

// Probe: upload a tiny object, presign a GET, print the URL so we can curl
// it from outside (Million Verifier's bulk API got HTTP 403 downloading a
// presigned URL — reproduce and inspect here).

async function main(): Promise<void> {
  const key = `mv/debug-${Date.now()}.txt`;
  await putText(key, "hello\n", "text/plain");
  console.log("put ok:", key);
  const roundtrip = await getBytes(key);
  console.log("getBytes roundtrip:", roundtrip ? Buffer.from(roundtrip).toString() : "NULL");
  const url = await presignGet(key, 600);
  console.log("presigned url:", url);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
