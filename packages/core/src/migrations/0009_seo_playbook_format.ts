import { Kysely, sql } from "kysely";

// Strapi Blocks cannot render markdown tables. The 0004 draft playbook
// required a pipe table for state requirements, which published as raw
// "| License Type |" rows on home.solutionwhere.com. Public CTAs also
// named Wisdomwhere, the PD product, on a Solutionwhere marketing site.
//
// Applied migrations are not edited. This replaces the outline/draft/edit
// overrides. Idempotent: on conflict, content is overwritten.

const PLAYBOOKS: [string, string][] = [
  [
    "outline",
    `- 5-8 H2 sections. The first section must directly answer the core query before any background or context.
- The very first paragraph of the article must be ONE liftable definitional sentence that names the state and its credit system, e.g. "To renew a standard teaching license in Ohio, educators must complete 180 contact hours or 18 CEUs over a five-year cycle and have them approved by a Local Professional Development Committee (LPDC)." Write it to be quoted verbatim by an AI assistant.
- Cover the state's requirements in prose (license types, renewal cycle length, hours required, unit of measure, who approves, submission deadline, fee). Do not plan a table, diagram, or grid.
- Include a numbered step-by-step renewal process section.
- Include a "Where districts get this wrong" section aimed at the district administrator responsible for tracking staff hours.
- End the outline with a short closing section for the district administrator: why an agency would use Solutionwhere to track hours, approved providers, and expiration. That section is the call to action. Never name Wisdomwhere or Wisdomware.
- Never outline an "introduction" or "conclusion" section, and never use the article title as an H2. The first H2 starts the substance.
- Points under each section are claims the draft must make; make them specific, not "discuss X".`,
  ],
  [
    "draft",
    `- Follow the outline exactly; do not add or drop sections.
- Do not emit markdown tables, pipe tables, dashed separator rows, ASCII grids, or diagrams. The CMS cannot render them.
- Write in short paragraphs. Use a bullet list or numbered list only when a set of discrete items is clearer as a list than as prose (for example a step-by-step process). Do not turn every section into bullets.
- Cover state requirements as prose, or as a short list of certificate types, not as a table.
- Name the state credit system explicitly (SCECH, Act 48, LPDC, CTLE, CPE, CLU, PGP...) — the system name is the search term.
- Do not repeat the article title as a heading in the body. Do not start the markdown with an H1.
- The public brand is Solutionwhere. Never write Wisdomwhere or Wisdomware.
- Write for skimmers: short paragraphs, concrete numbers over adjectives.
- First sentence of every section must say something a skim reader values — no "When it comes to X, ..." openers.
- Close with the Solutionwhere call to action from the outline. No URL in the body.`,
  ],
  [
    "edit",
    `- Cut 15-25% of the words. Delete filler, keep claims.
- Kill formulaic phrases: "in today's world", "it's important to note", "look no further", "game-changer".
- Every sentence must survive the "so what" test for the target audience — if a section doesn't help them decide or do something, rewrite it until it does.
- Solutionwhere voice: plain, specific, thirty years of proof. "Independent since 1996", "a real person answers the phone", "buy one module, not a suite" — used where they fit, never stacked.
- The reader is a district or agency administrator, not a teacher, on money pages; on state/credit-system pages the reader is a teacher and exactly one closing section addresses the administrator.
- Never badmouth a competitor by implication. State what each product is genuinely good at; the credibility of the page depends on it.
- If the draft still has a markdown table or pipe-row formatting, rewrite those rows as prose or a short list.
- Strip a leading heading that repeats the article title.
- The last section must be a Solutionwhere call to action for the district administrator. Never Wisdomwhere or Wisdomware.`,
  ],
  [
    "factcheck",
    `- Only statistics, dates, prices, rankings, hour counts, cycle lengths, fees, and named-product capabilities count as factual claims — opinions and general advice do not.
- A claim passes only if it is traceable to the research material. Any renewal-requirement figure (hours, cycle, fee, deadline) that is NOT traceable must be REPLACED with "not published by the state; contact your district's certification officer." Never soften a state requirement to vague language and never guess — replace it.
- Never claim WCAG or SOC 2 compliance, and never say Solutionwhere is certified. Delete those lines.
- Never name a customer, district, or agency as a Solutionwhere user. Lyons Township, On Track by 5, Washoe County School District, and LPSS are customers. Delete those lines.
- Never add citations, footnotes, or links. Never silently change the meaning — list every change you make in corrections.`,
  ],
];

export async function up(db: Kysely<unknown>): Promise<void> {
  for (const [stage, content] of PLAYBOOKS) {
    await sql`
      insert into seo_playbooks (stage, content)
      values (${stage}, ${content})
      on conflict (stage) do update set content = excluded.content, updated_at = now()
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  // Restoring 0004/0006 text is not worth a second copy of those strings.
  // Reset from the dashboard if a revert is needed.
  await sql`delete from seo_playbooks where stage in ('outline', 'draft', 'edit', 'factcheck')`.execute(
    db,
  );
}
