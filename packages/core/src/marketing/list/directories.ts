import * as cheerio from "cheerio";
import { sql } from "kysely";
import { getDb } from "../../db";
import { matchTitle } from "./titles";
import {
  buildEmail,
  isCatchAllDomain,
  observedPattern,
  type Pattern,
} from "./patterns";
import {
  CRAWL_USER_AGENT,
  emailDomain,
  recordRun,
  sleep,
  suppressedDomains,
} from "./shared";
import { applyAccountScope, type AccountScope } from "./waves";

// Staff-directory extraction (06 §3.1): public agencies publish staff
// directories, most with plain-text emails. 200 accounts per night, max
// 1 request/domain/second, standard path probe then give up quietly —
// accounts with nothing get last_verified stamped so the rotation moves on.

export const DIRECTORY_PATHS = [
  "/staff",
  "/directory",
  "/staff-directory",
  "/our-team",
  "/departments",
  "/administration",
  "/contact",
  "/about/staff",
];

const ACCOUNTS_PER_NIGHT = 200;
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export interface FoundContact {
  name: string;
  title: string;
  email: string;
}

/** A title-matched directory row whose email is obfuscated (06 §3.1 step 5). */
interface FoundPerson {
  name: string;
  title: string;
}

export async function fetchDirectoryPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": CRAWL_USER_AGENT },
      redirect: "follow",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return null;
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("html")) return null;
    return await response.text();
  } catch {
    return null;
  }
}

/** Pulls name/title/email rows out of arbitrary directory markup. */
export function extractDirectoryContacts(html: string): FoundContact[] {
  const $ = cheerio.load(html);
  const contacts: FoundContact[] = [];

  // Strategy: any element containing a mailto or plain email, walk up to a
  // small container, take its text as "name / title / email" material.
  const seenEmails = new Set<string>();
  const candidates = $("a[href^='mailto:'], td, li, p, div")
    .toArray()
    .slice(0, 4000);
  for (const el of candidates) {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length === 0 || text.length > 400) continue;
    const emails: string[] = text.match(EMAIL_RE) ?? [];
    const href = $(el).attr("href");
    if (href?.startsWith("mailto:")) emails.push(href.slice(7).split("?")[0]);
    for (const raw of emails) {
      const email = raw.toLowerCase();
      if (seenEmails.has(email)) continue;
      const container = $(el).closest("tr, li, .staff, .card, .member, div");
      const containerText = container.text().replace(/\s+/g, " ").trim().slice(0, 300);
      const match = matchTitle(containerText);
      if (!match) continue;
      seenEmails.add(email);
      const namePart = containerText.split(/[|•·\n]/)[0]?.trim().slice(0, 80) ?? "";
      contacts.push({ name: namePart, title: containerText.slice(0, 200), email });
    }
  }
  return contacts;
}

/** Guards against building a guessed address from a department or title string. */
function looksLikePersonName(name: string): boolean {
  const words = name.split(" ").filter(Boolean);
  if (words.length < 2 || words.length > 4) return false;
  if (!/^[A-Za-z'’.-]+( [A-Za-z'’.-]+)+$/.test(name)) return false;
  return !matchTitle(name);
}

/**
 * Directory rows that match the title dictionary but expose no email —
 * the §3.3 input set. The name is the first cell/emphasis element's text,
 * which in directory markup is the person's name.
 */
function extractNameTitleOnly(html: string): FoundPerson[] {
  const $ = cheerio.load(html);
  const people: FoundPerson[] = [];
  const rows = $("tr, li, .staff, .card, .member").toArray().slice(0, 4000);
  for (const el of rows) {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length === 0 || text.length > 300) continue;
    if (text.match(EMAIL_RE)) continue; // visible emails go through extractDirectoryContacts
    if (!matchTitle(text)) continue;
    const name = $(el)
      .find("td, th, strong, b, h3, h4, h5, span, p")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 80);
    if (!looksLikePersonName(name)) continue;
    people.push({ name, title: text.slice(0, 200) });
  }
  return people;
}

export async function runDirectories(opts?: {
  limit?: number;
  scope?: AccountScope;
}): Promise<void> {
  await recordRun("staff-directories", async () => {
    const db = getDb();
    let seen = 0;
    let added = 0;

    const due = await applyAccountScope(
      db
        .selectFrom("accounts")
        .select(["account_id", "account_name", "account_type", "website", "domain", "modules_fit"])
        .where("suppressed", "=", false)
        .where("website", "is not", null)
        .where((eb) =>
          eb.or([
            eb("last_verified", "is", null),
            eb("last_verified", "<", sql<Date>`current_date - 90`),
          ]),
        )
        .orderBy("priority_tier", "asc"),
      opts?.scope,
    )
      .limit(opts?.limit ?? ACCOUNTS_PER_NIGHT)
      .execute();

    for (const account of due) {
      seen += 1;
      const base = account.website!.startsWith("http")
        ? account.website!
        : `https://${account.website}`;
      let contacts: FoundContact[] = [];
      let directoryHtml: string | null = null;
      for (const path of DIRECTORY_PATHS) {
        const html = await fetchDirectoryPage(new URL(path, base).toString());
        await sleep(1000); // 1 req/domain/sec (06 §3.1)
        if (!html) continue;
        contacts = extractDirectoryContacts(html);
        if (contacts.length > 0) {
          directoryHtml = html;
          break;
        }
      }

      // 07 §4.2: one suppression lookup per account — covers the account
      // domain plus every email domain found in its directory. Matches are
      // written suppressed = true, never dropped.
      const suppressed = await suppressedDomains([
        account.domain,
        ...contacts.map((c) => emailDomain(c.email)),
      ]);
      const isSuppressed = (email: string | null): boolean => {
        const d = emailDomain(email);
        return (
          (account.domain != null && suppressed.has(account.domain)) ||
          (d != null && suppressed.has(d))
        );
      };

      for (const contact of contacts) {
        const match = matchTitle(contact.title);
        if (!match) continue;
        if (match.module === "referrals" && account.account_type !== "ccrr") {
          // "executive director" is only a Referrals opener at a CCR&R.
          if (/executive director/i.test(contact.title)) continue;
        }
        const [firstName, ...rest] = contact.name.split(" ");
        try {
          await db
            .insertInto("contacts")
            .values({
              account_id: account.account_id,
              first_name: firstName || null,
              last_name: rest.join(" ") || null,
              title: contact.title.slice(0, 200),
              title_rank: match.rank,
              module_segment: match.module,
              email: contact.email,
              email_source: "directory",
              suppressed: isSuppressed(contact.email),
            })
            .onConflict((oc) => oc.doNothing())
            .execute();
          added += 1;
        } catch {
          // unique-email race; skip
        }
      }

      // §3.1 step 5 → §3.3: rows where the email is obfuscated. One
      // confirmed address in this domain's directory establishes the
      // pattern for the whole agency; probe at most two patterns per
      // person and never on a catch-all domain. Guesses stay mv_status
      // NULL — verify-emails-daily is the gate before anything sends.
      if (directoryHtml && account.domain) {
        if (!(await isCatchAllDomain(account.domain))) {
          const observed = await observedPattern(account.domain);
          const candidates: Pattern[] = observed
            ? [observed]
            : ["first.last", "first"];
          for (const person of extractNameTitleOnly(directoryHtml)) {
            const match = matchTitle(person.title);
            if (!match) continue;
            if (match.module === "referrals" && account.account_type !== "ccrr") {
              if (/executive director/i.test(person.title)) continue;
            }
            if (!account.modules_fit.includes(match.module)) continue;
            const [firstName, ...rest] = person.name.split(" ");
            const lastName = rest.join(" ");
            if (!firstName || !lastName) continue;
            let probed = 0;
            for (const pattern of candidates) {
              if (probed >= 2) break;
              const email = buildEmail(pattern, firstName, lastName, account.domain);
              if (!email) continue;
              probed += 1;
              try {
                const result = await db
                  .insertInto("contacts")
                  .values({
                    account_id: account.account_id,
                    first_name: firstName,
                    last_name: lastName,
                    title: person.title.slice(0, 200),
                    title_rank: match.rank,
                    module_segment: match.module,
                    email,
                    email_source: "pattern",
                    suppressed: isSuppressed(email),
                  })
                  .onConflict((oc) => oc.doNothing())
                  .executeTakeFirst();
                if (Number(result.numInsertedOrUpdatedRows ?? 0) > 0) added += 1;
              } catch {
                // unique-email race; skip
              }
            }
          }
        }
      }

      await db
        .updateTable("accounts")
        .set({ last_verified: new Date().toISOString().slice(0, 10) })
        .where("account_id", "=", account.account_id)
        .execute();
    }
    return { seen, added, updated: 0 };
  });
}
