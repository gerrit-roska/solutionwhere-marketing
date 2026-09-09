import { getDb } from "../../db";

// Email pattern inference — fallback only (06 §3.3). Only two patterns are
// worth probing ({first}.{last}@ and {first}@); everything else returned
// zero in prior testing. Never probe a domain with a known catch-all, and
// prefer a pattern already observed in that domain's directory.

export type Pattern = "first.last" | "first";

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

export function buildEmail(
  pattern: Pattern,
  firstName: string,
  lastName: string,
  domain: string,
): string | null {
  const first = normalize(firstName);
  const last = normalize(lastName);
  if (!first) return null;
  if (pattern === "first.last") {
    return last ? `${first}.${last}@${domain}` : null;
  }
  return `${first}@${domain}`;
}

/** A domain where any prior verification came back catch_all is off-limits. */
export async function isCatchAllDomain(domain: string): Promise<boolean> {
  const row = await getDb()
    .selectFrom("contacts")
    .select("contact_id")
    .where("email", "like", `%@${domain}`)
    .where("mv_status", "=", "catch_all")
    .limit(1)
    .executeTakeFirst();
  return Boolean(row);
}

/** The pattern already observed for a domain, from confirmed directory emails. */
export async function observedPattern(domain: string): Promise<Pattern | null> {
  const rows = await getDb()
    .selectFrom("contacts")
    .select(["email", "first_name", "last_name"])
    .where("email", "like", `%@${domain}`)
    .where("email_source", "=", "directory")
    .where("first_name", "is not", null)
    .limit(25)
    .execute();
  for (const row of rows) {
    if (!row.email || !row.first_name) continue;
    const local = row.email.split("@")[0];
    const first = normalize(row.first_name);
    const last = normalize(row.last_name ?? "");
    if (last && local === `${first}.${last}`) return "first.last";
    if (local === first) return "first";
  }
  return null;
}
