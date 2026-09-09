/**
 * list_accounts.ts — onboarding helper. READ-ONLY.
 *
 * Answers "what is the client's real customer_id?" when filling in
 * clients/<client>.json. Two views:
 *   1. customers:listAccessibleCustomers — every account the service account
 *      can directly access (verifies auth + developer token work at all).
 *   2. customer_client under the MCC — every client account in the manager
 *      hierarchy, with names, so you can pick the right ID.
 *
 * Usage:
 *   ts-node list_accounts.ts                 # MCC from GOOGLE_ADS_LOGIN_CUSTOMER_ID
 *   ts-node list_accounts.ts --mcc 5538233519
 */
import { search, getAccessToken, headers, BASE } from "./client";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let mcc = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? "";
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--mcc") { mcc = args[i + 1]; i += 1; }
    else if (args[i].startsWith("--mcc=")) mcc = args[i].slice("--mcc=".length);
  }
  mcc = mcc.replace(/-/g, "");
  if (!mcc) {
    console.error("Usage: ts-node list_accounts.ts --mcc <MCC_ID> (or set GOOGLE_ADS_LOGIN_CUSTOMER_ID)");
    process.exit(1);
  }
  // The shared transport reads these; for discovery we operate as/on the MCC.
  process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID = mcc;
  process.env.GOOGLE_ADS_CUSTOMER_ID = mcc;

  console.log("1) Accounts directly accessible to these credentials:");
  const token = await getAccessToken();
  const res = await fetch(`${BASE}/customers:listAccessibleCustomers`, {
    method: "GET",
    headers: headers(token),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`listAccessibleCustomers ${res.status}: ${text}`);
  const accessible: string[] = JSON.parse(text).resourceNames ?? [];
  for (const rn of accessible) console.log(`   ${rn.split("/").pop()}`);
  if (!accessible.length) {
    console.log(
      "   (none — the service-account email has not been added as a user on any Ads account yet)"
    );
  }

  console.log(`\n2) Client accounts under MCC ${mcc}:`);
  const rows = await search(`
    SELECT
      customer_client.id,
      customer_client.descriptive_name,
      customer_client.level,
      customer_client.manager,
      customer_client.status
    FROM customer_client
    WHERE customer_client.status != 'CLOSED'
  `);
  for (const r of rows as any[]) {
    const c = r.customerClient;
    console.log(
      `   ${String(c.id).padEnd(12)} ${c.manager ? "[MCC] " : ""}${c.descriptiveName ?? "(unnamed)"}  (level ${c.level}, ${c.status})`
    );
  }
  console.log(
    "\nPut the chosen numeric ID into clients/<client>.json as google_ads.customer_id."
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
