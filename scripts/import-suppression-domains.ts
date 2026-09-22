import { readFileSync } from "node:fs";
import { getDb, destroyDb } from "../packages/core/src/db";

const CSV_PATH =
  process.argv[2] ??
  "/Users/gerritroska/Desktop/SolutionWhere customer contacts 2026-09-11.csv";

const FREE_MAIL = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "aol.com",
  "me.com",
  "msn.com",
]);

function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  fields.push(current);
  return fields;
}

function domainFromEmail(email: string): string | null {
  const at = email.lastIndexOf("@");
  if (at < 1) return null;
  const domain = email.slice(at + 1).trim().toLowerCase();
  if (!domain || !domain.includes(".")) return null;
  if (FREE_MAIL.has(domain)) return null;
  return domain;
}

async function main(): Promise<void> {
  const raw = readFileSync(CSV_PATH, "utf-8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const header = parseCsvLine(lines[0]);
  const emailIdx = header.indexOf("email");
  const entityIdx = header.indexOf("entity");
  if (emailIdx < 0) throw new Error("CSV missing email column");

  const domains = new Map<string, string>();
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const email = cols[emailIdx]?.trim().toLowerCase();
    const entity = entityIdx >= 0 ? cols[entityIdx]?.trim() : "";
    if (!email) continue;
    const domain = domainFromEmail(email);
    if (!domain) continue;
    if (!domains.has(domain)) domains.set(domain, entity || "customer contact");
  }

  const db = getDb();
  let inserted = 0;
  for (const [domain, source] of domains) {
    const result = await db
      .insertInto("suppression_domains")
      .values({
        domain,
        reason: "customer",
        source: `SolutionWhere customer contacts 2026-09-11.csv — ${source}`.slice(
          0,
          500,
        ),
      })
      .onConflict((oc) => oc.column("domain").doNothing())
      .executeTakeFirst();
    if (result.numInsertedOrUpdatedRows) inserted += 1;
  }

  const total = await db
    .selectFrom("suppression_domains")
    .select((eb) => eb.fn.countAll().as("n"))
    .executeTakeFirstOrThrow();

  console.log(
    JSON.stringify(
      {
        csv: CSV_PATH,
        uniqueDomains: domains.size,
        inserted,
        totalInDb: Number(total.n),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(destroyDb);
