import * as cheerio from "cheerio";
import { sql } from "kysely";
import { getDb } from "../../db";
import { matchTitle } from "./titles";
import { CRAWL_USER_AGENT, recordRun, sleep } from "./shared";

// Staff-directory extraction (06 §3.1): public agencies publish staff
// directories, most with plain-text emails. 200 accounts per night, max
// 1 request/domain/second, standard path probe then give up quietly —
// accounts with nothing get last_verified stamped so the rotation moves on.

const DIRECTORY_PATHS = [
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

interface FoundContact {
  name: string;
  title: string;
  email: string;
}

async function fetchOk(url: string): Promise<string | null> {
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
function extractContacts(html: string): FoundContact[] {
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

export async function runDirectories(): Promise<void> {
  await recordRun("staff-directories", async () => {
    const db = getDb();
    let seen = 0;
    let added = 0;

    const due = await db
      .selectFrom("accounts")
      .select(["account_id", "account_name", "account_type", "website", "domain"])
      .where("suppressed", "=", false)
      .where("website", "is not", null)
      .where((eb) =>
        eb.or([
          eb("last_verified", "is", null),
          eb("last_verified", "<", sql<Date>`current_date - 90`),
        ]),
      )
      .orderBy("priority_tier", "asc")
      .limit(ACCOUNTS_PER_NIGHT)
      .execute();

    for (const account of due) {
      seen += 1;
      const base = account.website!.startsWith("http")
        ? account.website!
        : `https://${account.website}`;
      let contacts: FoundContact[] = [];
      for (const path of DIRECTORY_PATHS) {
        const html = await fetchOk(new URL(path, base).toString());
        await sleep(1000); // 1 req/domain/sec (06 §3.1)
        if (!html) continue;
        contacts = extractContacts(html);
        if (contacts.length > 0) break;
      }

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
            })
            .onConflict((oc) => oc.doNothing())
            .execute();
          added += 1;
        } catch {
          // unique-email race; skip
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
