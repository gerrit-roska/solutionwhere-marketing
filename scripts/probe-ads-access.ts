import { search } from "../packages/core/src/ads/client";

// Probes whether the current credentials can read the customer configured
// via GOOGLE_ADS_CUSTOMER_ID / GOOGLE_ADS_LOGIN_CUSTOMER_ID env.

async function main(): Promise<void> {
  try {
    const rows = await search(
      "SELECT customer.id, customer.descriptive_name FROM customer LIMIT 5",
    );
    console.log("OK", JSON.stringify(rows).slice(0, 300));
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log("FAIL", msg.slice(0, 200));
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
