import { getDb } from "../packages/core/src/db";
import { graphed } from "../packages/core/src/marketing/graphed";
import { allDictionaryTitles, matchTitle } from "../packages/core/src/marketing/list/titles";

const db = getDb();
const due = await db
  .selectFrom("accounts")
  .select(["account_id", "account_name", "account_type", "domain", "modules_fit"])
  .where("suppressed", "=", false)
  .where("domain", "is not", null)
  .where("last_verified", "is not", null)
  .limit(3)
  .execute();

for (const a of due) {
  console.log(`\n== ${a.account_name} (${a.domain}) modules_fit=${JSON.stringify(a.modules_fit)}`);
  const result = (await graphed.tools.run(
    "getleads:contacts.search",
    { domains: [a.domain!], countries: ["US"], jobTitles: allDictionaryTitles(), limit: 50, maxPerCompany: 24 },
    { timeoutSeconds: 120 },
  )) as Record<string, unknown>;
  const rows = (result?.contacts ?? []) as Record<string, unknown>[];
  console.log(`  getleads rows: ${rows.length}`);
  for (const r of rows.slice(0, 12)) {
    const title = String(r.job_title ?? "");
    const email = String(r.email_address ?? "");
    const m = matchTitle(title);
    console.log(
      `  - "${title}" email=${email ? "yes" : "no"} match=${m ? `${m.module}#${m.rank}` : "null"}` +
        (m ? (a.modules_fit.includes(m.module) ? " IMPORT" : " SKIP(module)") : ""),
    );
  }
}
process.exit(0);
