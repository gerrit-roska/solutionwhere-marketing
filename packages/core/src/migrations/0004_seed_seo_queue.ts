import { Kysely, sql } from "kysely";

// Seeds the SEO queue (8 credit-system states, build order per the measured
// keyword research) and the Solutionwhere playbook overrides (liftable
// definitional opener, requirements table, replace-never-guess fact rule).
// Idempotent: conflicts are ignored so re-runs and local/cloud divergence
// are safe. Data seeds live in a migration so the cloud release applies
// them — `graphed databases query` is read-only.

const KEYWORDS: [string, string, number][] = [
  ["ohio teacher license renewal", "steps-to-ohio-teacher-certification", 1],
  ["pennsylvania teacher certification renewal act 48", "steps-to-pennsylvania-teacher-certification", 1],
  ["new york teacher certification renewal ctle", "steps-to-new-york-teacher-certification", 1],
  ["texas teacher license renewal", "steps-to-texas-teacher-certification", 1],
  ["illinois teacher certification renewal", "steps-to-illinois-teacher-certification", 2],
  ["michigan scech requirements", "steps-to-michigan-teacher-certification-scech", 2],
  ["louisiana teacher certification renewal", "steps-to-louisiana-teacher-certification-renewal", 2],
  ["indiana teacher license renewal", "steps-to-indiana-teacher-license-renewal", 2],
];

const PLAYBOOKS: [string, string][] = [
  [
    "outline",
    `- 5-8 H2 sections. The first section must directly answer the core query before any background or context.
- The very first paragraph of the article must be ONE liftable definitional sentence that names the state and its credit system, e.g. "To renew a standard teaching license in Ohio, educators must complete 180 contact hours or 18 CEUs over a five-year cycle and have them approved by a Local Professional Development Committee (LPDC)." Write it to be quoted verbatim by an AI assistant.
- Include a section for the state requirements table (license type, renewal cycle length, hours required, unit of measure, who approves, submission deadline, fee).
- Include a numbered step-by-step renewal process section.
- Include a "Where districts get this wrong" section aimed at the district administrator responsible for tracking staff hours.
- Never outline an "introduction" or "conclusion" section — the first H2 starts the substance.
- Points under each section are claims the draft must make; make them specific, not "discuss X".`,
  ],
  [
    "draft",
    `- Follow the outline exactly; do not add or drop sections.
- Render the state requirements table as a markdown table with rows: license type, renewal cycle, hours required, unit of measure, approving body, submission system/deadline, fee.
- Name the state credit system explicitly (SCECH, Act 48, LPDC, CTLE, CPE, CLU, PGP...) — the system name is the search term.
- Write for skimmers: short paragraphs, concrete numbers over adjectives, lists where the outline has parallel points.
- The reader is usually a teacher, but one contextual line addresses the administrator: "Responsible for tracking this across your staff?" — that is the only conversion mechanism on the page.
- First sentence of every section must say something a skim reader values — no "When it comes to X, ..." openers.`,
  ],
  [
    "factcheck",
    `- Only statistics, dates, prices, rankings, hour counts, cycle lengths, fees, and named-product capabilities count as factual claims — opinions and general advice do not.
- A claim passes only if it is traceable to the research material. Any renewal-requirement figure (hours, cycle, fee, deadline) that is NOT traceable must be REPLACED with "not published by the state; contact your district's certification officer." Never soften a state requirement to vague language and never guess — replace it.
- Never add citations, footnotes, or links. Never silently change the meaning — list every change you make in corrections.`,
  ],
];

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const [keyword, slug, priority] of KEYWORDS) {
    await sql`
      insert into seo_keywords (keyword, slug, priority)
      values (${keyword}, ${slug}, ${priority})
      on conflict do nothing
    `.execute(db);
  }
  for (const [stage, content] of PLAYBOOKS) {
    await sql`
      insert into seo_playbooks (stage, content)
      values (${stage}, ${content})
      on conflict (stage) do update set content = excluded.content, updated_at = now()
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  for (const [, slug] of KEYWORDS) {
    await sql`delete from seo_keywords where slug = ${slug} and status = 'pending'`.execute(db);
  }
  for (const [stage] of PLAYBOOKS) {
    await sql`delete from seo_playbooks where stage = ${stage}`.execute(db);
  }
}
