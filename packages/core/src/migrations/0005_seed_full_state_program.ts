import { Kysely, sql } from "kysely";

// Seeds the rest of the SEO program (05-seo-aeo-execution.md §3, ordered by
// the measured volumes in 08-keyword-research.md §4):
//
//   Priority 1 — credit-system HUB pages (§3.0): the highest-volume terms in
//     the entire research set (moecs 18,100; act 48 1,600; scech 1,900;
//     ctle >=10K; lvis 1,900; elis 1,000; lpdc 590). Standalone root URLs.
//   Priority 3 — state renewal pages with measured volume (§4.2 build order).
//   Priority 4 — the remaining states; zero-volume states cost nothing and
//     complete the cluster.
//
// Not seeded here: OH/PA/NY/TX/IL/MI/LA/IN (already in 0004) and Arizona
// (an existing live post, steps-to-arizona-teaching-certification, that 05
// §3.1 says to leave alone). Comparison and trust pages are intentionally
// NOT queued — competitor facts and security claims are human-written
// (07 §4.1).

const HUBS: [string, string][] = [
  ["ctle", "ctle"],
  ["moecs", "moecs"],
  ["scech", "scech"],
  ["act 48", "act-48"],
  ["lvis indiana", "lvis"],
  ["elis isbe", "elis"],
  ["adeconnect", "adeconnect"],
  ["lpdc", "lpdc"],
  ["ksde license renewal", "ksde-license-renewal"],
  ["kentucky epsb", "epsb"],
  ["plu georgia", "plu"],
  ["cpe hours texas", "cpe-texas"],
];

// [state, phrasing] — "license renewal" is the default; FL/CA/AR/AL search
// "certification renewal", Minnesota says "relicensure" (05 §1.2 item 3).
const TIER3: [string, string][] = [
  ["minnesota", "minnesota teacher relicensure"],
  ["california", "california teacher certification renewal"],
  ["north-carolina", "north carolina teacher license renewal"],
  ["florida", "florida teacher certification renewal"],
  ["arkansas", "arkansas teacher certification renewal"],
  ["iowa", "iowa teacher license renewal"],
  ["oklahoma", "oklahoma teacher license renewal"],
  ["colorado", "colorado teacher license renewal"],
  ["kansas", "kansas teacher license renewal"],
  ["alabama", "alabama teacher certification renewal"],
  ["utah", "utah teacher license renewal"],
  ["idaho", "idaho teacher license renewal"],
];

const TIER4_STATES = [
  "alaska", "connecticut", "delaware", "georgia", "hawaii", "kentucky",
  "maine", "maryland", "massachusetts", "mississippi", "missouri", "montana",
  "nebraska", "nevada", "new-hampshire", "new-jersey", "new-mexico",
  "north-dakota", "oregon", "rhode-island", "south-carolina", "south-dakota",
  "tennessee", "vermont", "virginia", "washington", "west-virginia",
  "wisconsin", "wyoming",
];

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const [keyword, slug] of HUBS) {
    await sql`
      insert into seo_keywords (keyword, slug, priority)
      values (${keyword}, ${slug}, 1)
      on conflict do nothing
    `.execute(db);
  }
  for (const [stateSlug, keyword] of TIER3) {
    await sql`
      insert into seo_keywords (keyword, slug, priority)
      values (${keyword}, ${`steps-to-${stateSlug}-teacher-certification`}, 3)
      on conflict do nothing
    `.execute(db);
  }
  for (const stateSlug of TIER4_STATES) {
    const keyword = `${stateSlug.replace(/-/g, " ")} teacher license renewal`;
    await sql`
      insert into seo_keywords (keyword, slug, priority)
      values (${keyword}, ${`steps-to-${stateSlug}-teacher-certification`}, 4)
      on conflict do nothing
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const slugs = [
    ...HUBS.map(([, slug]) => slug),
    ...TIER3.map(([stateSlug]) => `steps-to-${stateSlug}-teacher-certification`),
    ...TIER4_STATES.map((s) => `steps-to-${s}-teacher-certification`),
  ];
  for (const slug of slugs) {
    await sql`delete from seo_keywords where slug = ${slug} and status = 'pending'`.execute(db);
  }
}
