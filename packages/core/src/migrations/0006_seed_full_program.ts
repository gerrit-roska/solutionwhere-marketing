import { Kysely, sql } from "kysely";

// Seeds the rest of the 05-seo-aeo-execution.md page program, taking the
// queue from 61 rows to 500. Composition (each row is one distinct page;
// slugs are flat kebab-case — the /compare/, /best/, /solutions/ path
// prefixes from 05 are applied at publish time by the MDX exporter):
//
//   P2  compare (31) + best (12) + category (12) + trust (7)
//       — highest intent; the compare/best pages are the landing pages the
//         Google Ads competitor campaigns (03 §3.2/§3.7) cannot launch without
//   P3  alternatives (31) + reviews (10) + third-party X-vs-Y (8) + geo (22)
//   P4  credit-system spokes (25) + for-X/tool/template pages (60)
//       + extra best-X (8) + extra category (13)
//   P5  state spokes (4 × 50 states = 200) — hub-and-spoke around the
//       existing state renewal pages: recertification-hours, license-lookup,
//       requirements-2027, and pd-requirements each have distinct intent
//       from the main state page and link up to it
//
// Also seeds the remaining two playbook overrides (research, edit) so all
// five stages carry Solutionwhere-specific instructions.
//
// Idempotent: conflicts are ignored. Trust and comparison pages draft under
// the same replace-never-guess factcheck rule as everything else — all
// drafts get human review before publishing regardless (cms: none).

const COMPARE: [string, string][] = [
  // [competitor slug, display name] — 05 §4.2, 31 pages
  ["frontline-professional-growth", "Frontline Professional Growth"],
  ["mylearningplan", "MyLearningPlan"],
  ["vector-solutions", "Vector Solutions"],
  ["kalpa", "Kalpa"],
  ["escworks", "escWorks"],
  ["pdplanner", "PDPlanner"],
  ["schooldata-net", "SchoolData.net"],
  ["kickup-learning", "KickUp Learning"],
  ["growelab", "GroweLab"],
  ["plad", "PLAD"],
  ["schoolmint", "SchoolMint Enroll"],
  ["powerschool-enrollment", "PowerSchool Enrollment"],
  ["infinite-campus-online-registration", "Infinite Campus Online Registration"],
  ["avela", "Avela"],
  ["enrollwise", "EnrollWise"],
  ["k12enrollment360", "K12Enrollment360"],
  ["edbrix", "EdBrix"],
  ["sibme", "Sibme"],
  ["kickup-foundations", "KickUp Foundations"],
  ["schoolstatus-coach", "SchoolStatus Coach"],
  ["teachboost", "TeachBoost"],
  ["iris-connect", "IRIS Connect"],
  ["edthena", "Edthena"],
  ["whetstone-education", "Whetstone Education"],
  ["bullseye", "Bullseye"],
  ["worklife-systems", "WorkLife Systems"],
  ["icarol", "iCarol"],
  ["kindersystems", "KinderSystems"],
  ["bridgecare", "BridgeCare"],
  ["wonderschool", "Wonderschool"],
  ["insight", "Insight"],
];

const REVIEWS: [string, string][] = [
  // 05 §4.5 — 10 dated, fair reviews
  ["frontline-professional-growth", "Frontline Professional Growth"],
  ["mylearningplan", "MyLearningPlan"],
  ["vector-solutions", "Vector Solutions"],
  ["schoolmint", "SchoolMint"],
  ["powerschool-enrollment", "PowerSchool Enrollment"],
  ["sibme", "Sibme"],
  ["kickup", "KickUp"],
  ["teachboost", "TeachBoost"],
  ["icarol", "iCarol"],
  ["worklife-systems", "WorkLife Systems"],
];

const X_VS_Y: [string, string][] = [
  // 05 §4.5 — third-party pairs where we are the neutral referee
  ["frontline-professional-growth-vs-vector-solutions", "frontline professional growth vs vector solutions"],
  ["frontline-professional-growth-vs-kalpa", "frontline professional growth vs kalpa"],
  ["sibme-vs-kickup", "sibme vs kickup"],
  ["sibme-vs-teachboost", "sibme vs teachboost"],
  ["schoolmint-vs-powerschool-enrollment", "schoolmint vs powerschool enrollment"],
  ["schoolmint-vs-avela", "schoolmint vs avela"],
  ["powerschool-enrollment-vs-infinite-campus-registration", "powerschool enrollment vs infinite campus registration"],
  ["worklife-systems-vs-icarol", "worklife systems vs icarol"],
];

const BEST: [string, string][] = [
  // 05 §4.5 — 12 honest ranked listicles
  ["best-professional-development-software-for-school-districts", "best professional development software for school districts"],
  ["best-pd-platform-for-regional-education-agencies", "best pd platform for regional education agencies"],
  ["best-act-48-tracking-software-for-pennsylvania-districts", "act 48 tracking software"],
  ["best-scech-tracking-software-for-michigan-districts", "scech tracking software"],
  ["best-school-enrollment-software-for-districts", "best school enrollment software"],
  ["best-online-registration-software-for-k-12", "best online registration software for schools"],
  ["best-school-choice-lottery-software", "best school choice software"],
  ["best-pre-k-enrollment-software", "best pre k enrollment software"],
  ["best-instructional-coaching-software-for-districts", "best instructional coaching software"],
  ["best-teacher-mentoring-and-induction-software", "best mentoring software for schools"],
  ["best-child-care-referral-software-for-ccr-r-agencies", "best child care referral software"],
  ["best-early-childhood-coaching-and-ta-software", "best early childhood coaching software"],
];

const CATEGORY: [string, string][] = [
  // 05 §5.1 — 12 definitional category pages
  ["professional-development-management-software", "professional development management software"],
  ["pd-registration-software", "professional development registration software"],
  ["pd-tracking-software", "professional development tracking software"],
  ["school-enrollment-software", "school enrollment software"],
  ["online-school-registration-software", "online school registration software"],
  ["school-choice-lottery-software", "school choice lottery software"],
  ["pre-k-enrollment-software", "pre k enrollment software"],
  ["instructional-coaching-software", "instructional coaching software"],
  ["coaching-log-software", "coaching log software"],
  ["early-childhood-coaching-software", "early childhood coaching software"],
  ["child-care-referral-software", "child care referral software"],
  ["ccr-r-software", "ccr&r software"],
];

const GEO: [string, string][] = [
  // 05 §5.3 — 22 regional-agency vernacular pages
  ["for-boces", "boces professional development software"],
  ["for-michigan-isd", "michigan isd software"],
  ["for-pennsylvania-intermediate-units", "intermediate unit software pennsylvania"],
  ["for-ohio-esc", "esc software ohio"],
  ["for-texas-esc", "texas esc software"],
  ["for-iowa-aea", "iowa aea software"],
  ["for-wisconsin-cesa", "wisconsin cesa software"],
  ["for-nebraska-esu", "nebraska esu software"],
  ["for-washington-esd", "washington esd software"],
  ["for-oregon-esd", "oregon esd software"],
  ["for-colorado-boces", "colorado boces software"],
  ["for-georgia-resa", "georgia resa software"],
  ["for-illinois-roe", "illinois roe software"],
  ["for-minnesota-service-cooperatives", "minnesota service cooperative software"],
  ["for-missouri-rpdc", "missouri rpdc software"],
  ["for-california-coe", "california county office of education software"],
  ["for-indiana-esc", "indiana esc software"],
  ["for-arkansas-education-cooperatives", "arkansas education service cooperative software"],
  ["for-kansas-service-centers", "kansas service center software"],
  ["for-alabama-inservice-centers", "alabama regional inservice center software"],
  ["for-ccr-r-agencies", "ccr&r agency software"],
  ["for-state-education-agencies", "state education agency software"],
];

const TRUST: [string, string][] = [
  // 05 §5.2 — P0 trust/procurement pages (human-reviewed before publish)
  ["security", "solutionwhere security"],
  ["ferpa", "solutionwhere ferpa"],
  ["accessibility", "solutionwhere accessibility"],
  ["pricing", "solutionwhere pricing"],
  ["procurement", "solutionwhere procurement"],
  ["implementation", "solutionwhere implementation"],
  ["trust", "solutionwhere trust"],
];

const CREDIT_SPOKES: [string, string][] = [
  // Distinct sub-intents around the credit-system hubs (05 §3.0/§3.4)
  ["ctle-hours", "ctle hours"],
  ["ctle-requirements", "ctle requirements"],
  ["ctle-tracking", "ctle tracking"],
  ["act-48-hours", "act 48 hours"],
  ["act-48-credits", "act 48 credits"],
  ["perms-act-48", "perms act 48"],
  ["how-many-scechs-do-i-need-in-michigan", "how many scechs do i need in michigan"],
  ["how-to-submit-scech", "how to submit scech"],
  ["indiana-pgp-points", "indiana pgp points"],
  ["ipdp-ohio", "ipdp ohio"],
  ["louisiana-continuing-learning-units", "louisiana continuing learning units"],
  ["florida-inservice-points", "florida inservice points"],
  ["master-inservice-plan-florida", "master inservice plan florida"],
  ["illinois-pd-clock-hours", "illinois pd clock hours"],
  ["isbe-professional-development-reporting", "isbe professional development reporting"],
  ["kansas-pdc-points", "kansas pdc points"],
  ["missouri-pdc", "missouri pdc"],
  ["massachusetts-pdp-points", "massachusetts pdp points"],
  ["georgia-plu-credits", "georgia plu credits"],
  ["boee-renewal", "boee renewal"],
  ["epsb-renewal", "epsb renewal"],
  ["ctc-renewal-california", "ctc renewal california"],
  ["california-clear-credential", "california clear credential"],
  ["michigan-new-teacher-professional-development-hours", "michigan new teacher professional development hours"],
  ["michigan-provisional-teaching-certificate-renewal", "michigan provisional teaching certificate renewal"],
];

const FOR_X: [string, string][] = [
  // "blank for X" modifier pages (03 §3.7.1 pattern, 05 §5.3 audiences) and
  // distinct tool/template topics from the measured term list
  ["professional-development-software-for-school-districts", "professional development software for school districts"],
  ["professional-development-software-for-boces", "professional development software for boces"],
  ["professional-development-software-for-esc", "professional development software for esc"],
  ["professional-development-software-for-isd", "professional development software for isd"],
  ["professional-development-software-for-intermediate-unit", "professional development software for intermediate unit"],
  ["professional-development-software-for-schools", "professional development software for schools"],
  ["professional-development-platform-for-districts", "professional development platform for districts"],
  ["pd-registration-system-for-schools", "pd registration system for schools"],
  ["course-registration-software-for-districts", "course registration software for districts"],
  ["workshop-registration-software-for-school-districts", "workshop registration software for school districts"],
  ["training-registration-software-for-schools", "training registration software for schools"],
  ["ceu-tracking-software-for-schools", "ceu tracking software for schools"],
  ["clock-hour-tracking-software-teachers", "clock hour tracking software teachers"],
  ["educator-credential-tracking-software", "educator credential tracking software"],
  ["cpd-tracking-software", "cpd tracking software"],
  ["enrollment-software-for-school-districts", "enrollment software for school districts"],
  ["student-registration-software-for-school-districts", "student registration software for school districts"],
  ["online-registration-for-school-districts", "online registration for school districts"],
  ["online-enrollment-software-for-schools", "online enrollment software for schools"],
  ["open-enrollment-software-for-districts", "open enrollment software for districts"],
  ["preschool-enrollment-software-for-districts", "preschool enrollment software for districts"],
  ["kindergarten-registration-software", "kindergarten registration software"],
  ["charter-school-lottery-software", "charter school lottery software"],
  ["magnet-school-application-software", "magnet school application software"],
  ["in-district-transfer-software-schools", "in district transfer software schools"],
  ["enrollment-document-verification-software", "enrollment document verification software"],
  ["digital-registration-forms-for-schools", "digital registration forms for schools"],
  ["back-to-school-registration-software", "back to school registration software"],
  ["k-12-enrollment-software", "k-12 enrollment software"],
  ["early-childhood-registration-software", "early childhood registration software"],
  ["coaching-log-template", "coaching log template"],
  ["mentoring-tracking-system", "mentoring tracking system"],
  ["mentor-tracking-software", "mentor tracking software"],
  ["teacher-observation-tool", "teacher observation tool"],
  ["classroom-observation-app", "classroom observation app"],
  ["classroom-walkthrough-software", "classroom walkthrough software"],
  ["walkthrough-observation-app-for-schools", "walkthrough observation app for schools"],
  ["instructional-rounds-software", "instructional rounds software"],
  ["log-coaching-visits-software", "log coaching visits software"],
  ["coaching-tracker", "coaching tracker"],
  ["coaching-caseload-management-software", "coaching caseload management software"],
  ["coaching-cycle-tracking-software", "coaching cycle tracking software"],
  ["coaching-software-for-ccr-r", "coaching software for ccr&r"],
  ["coaching-software-for-early-childhood-programs", "coaching software for early childhood programs"],
  ["instructional-coaching-software-for-districts", "instructional coaching software for districts"],
  ["coaching-documentation-system-schools", "coaching documentation system schools"],
  ["instructional-coaching-tracking-software", "instructional coaching tracking software"],
  ["child-care-intake-software", "child care intake software"],
  ["child-care-provider-database-software", "child care provider database software"],
  ["child-care-quality-improvement-software", "child care quality improvement software"],
  ["early-childhood-technical-assistance-software", "early childhood technical assistance software"],
  ["child-care-search-software-for-agencies", "child care search software for agencies"],
  ["child-care-supply-and-demand-data-software", "child care supply and demand data software"],
  ["family-child-care-referral-system", "family child care referral system"],
  ["child-care-referral-tracking-system", "child care referral tracking system"],
  ["child-care-referral-management-software", "child care referral management software"],
  ["child-care-referral-reporting-software", "child care referral reporting software"],
  ["video-coaching-for-teachers", "video coaching for teachers"],
  ["classroom-observation-software-non-evaluative", "classroom observation software non evaluative"],
  ["cpe-tracking-software-teachers", "cpe tracking software teachers"],
];

const BEST_EXTRA: [string, string][] = [
  // Remaining measured best-X terms (08 §7 / keyword-volumes-bofu.csv)
  ["best-pd-software-for-teachers", "best pd software for teachers"],
  ["best-professional-development-platform-for-k12", "best professional development platform for k12"],
  ["best-student-registration-software", "best student registration software"],
  ["best-enrollment-software-for-charter-schools", "best enrollment software for charter schools"],
  ["best-coaching-software-for-schools", "best coaching software for schools"],
  ["best-teacher-coaching-platform", "best teacher coaching platform"],
  ["best-teacher-induction-software", "best teacher induction software"],
  ["best-ccr-r-software", "best ccr&r software"],
];

const CATEGORY_EXTRA: [string, string][] = [
  // Remaining measured category terms with real volume (08 §2)
  ["school-registration-software", "school registration software"],
  ["student-enrollment-management-system", "student enrollment management system"],
  ["district-enrollment-management-system", "district enrollment management system"],
  ["enrollment-management-system", "enrollment management system"],
  ["course-registration-management-system", "course registration management system"],
  ["education-conference-registration-software", "education conference registration software"],
  ["k-12-online-registration", "k 12 online registration"],
  ["early-childhood-enrollment-system", "early childhood enrollment system"],
  ["instructional-coaching-platform", "instructional coaching platform"],
  ["instructional-coaching-management-software", "instructional coaching management software"],
  ["educator-professional-development-software", "educator professional development software"],
  ["k-12-professional-development-companies", "k 12 professional development companies"],
  ["educational-management-software", "educational management software"],
];

// [state slug, state name] — all 50, for the four spokes per state.
const STATES: [string, string][] = [
  ["alabama", "Alabama"], ["alaska", "Alaska"], ["arizona", "Arizona"],
  ["arkansas", "Arkansas"], ["california", "California"],
  ["colorado", "Colorado"], ["connecticut", "Connecticut"],
  ["delaware", "Delaware"], ["florida", "Florida"], ["georgia", "Georgia"],
  ["hawaii", "Hawaii"], ["idaho", "Idaho"], ["illinois", "Illinois"],
  ["indiana", "Indiana"], ["iowa", "Iowa"], ["kansas", "Kansas"],
  ["kentucky", "Kentucky"], ["louisiana", "Louisiana"], ["maine", "Maine"],
  ["maryland", "Maryland"], ["massachusetts", "Massachusetts"],
  ["michigan", "Michigan"], ["minnesota", "Minnesota"],
  ["mississippi", "Mississippi"], ["missouri", "Missouri"],
  ["montana", "Montana"], ["nebraska", "Nebraska"], ["nevada", "Nevada"],
  ["new-hampshire", "New Hampshire"], ["new-jersey", "New Jersey"],
  ["new-mexico", "New Mexico"], ["new-york", "New York"],
  ["north-carolina", "North Carolina"], ["north-dakota", "North Dakota"],
  ["ohio", "Ohio"], ["oklahoma", "Oklahoma"], ["oregon", "Oregon"],
  ["pennsylvania", "Pennsylvania"], ["rhode-island", "Rhode Island"],
  ["south-carolina", "South Carolina"], ["south-dakota", "South Dakota"],
  ["tennessee", "Tennessee"], ["texas", "Texas"], ["utah", "Utah"],
  ["vermont", "Vermont"], ["virginia", "Virginia"],
  ["washington", "Washington"], ["west-virginia", "West Virginia"],
  ["wisconsin", "Wisconsin"], ["wyoming", "Wyoming"],
];

const PLAYBOOKS: [string, string][] = [
  [
    "research",
    `Used to interpret the SERP material, not to generate it.
- Treat the top organic results as the bar: their titles and snippets show the angle Google rewards for this query.
- People-also-ask questions are section candidates.
- Note every statistic, date, price, or named product you see — the fact-check stage will only allow claims traceable to this material.
- For state renewal and credit-system pages: the state Department of Education's own licensure/renewal page is the ONLY authoritative source for hours, cycles, fees, and deadlines. Record its URL. If the SERP material does not include the state DOE page, say so explicitly in the research notes rather than leaning on third-party summaries.
- For competitor pages (compare/alternatives/reviews): note only what the competitor's own site or public reviews state, with the date. Never note a competitor price unless they publish it.`,
  ],
  [
    "edit",
    `- Cut 15-25% of the words. Delete filler, keep claims.
- Kill formulaic phrases: "in today's world", "it's important to note", "look no further", "game-changer".
- Every sentence must survive the "so what" test for the target audience — if a section doesn't help them decide or do something, rewrite it until it does.
- Solutionwhere voice: plain, specific, thirty years of proof. "Independent since 1996", "a real person answers the phone", "buy one module, not a suite" — used where they fit, never stacked.
- The reader is a district or agency administrator, not a teacher, on money pages; on state/credit-system pages the reader is a teacher and exactly one contextual line addresses the administrator.
- Never badmouth a competitor by implication. State what each product is genuinely good at; the credibility of the page depends on it.`,
  ],
];

async function seed(
  db: Kysely<unknown>,
  rows: [string, string][],
  priority: number,
  slugPrefix = "",
) {
  for (const [slug, keyword] of rows) {
    await sql`
      insert into seo_keywords (keyword, slug, priority)
      values (${keyword}, ${slugPrefix + slug}, ${priority})
      on conflict do nothing
    `.execute(db);
  }
}

export async function up(db: Kysely<unknown>): Promise<void> {
  // P2 — highest intent; comparison/best pages unblock the ads competitor campaigns
  await seed(db, COMPARE.map(([s, n]) => [`solutionwhere-vs-${s}`, `solutionwhere vs ${n.toLowerCase()}`] as [string, string]), 2);
  await seed(db, BEST, 2);
  await seed(db, CATEGORY, 2);
  await seed(db, TRUST, 2);
  // P3 — alternatives/reviews/third-party vs/geo
  await seed(db, COMPARE.map(([s, n]) => [`${s}-alternative`, `${n.toLowerCase()} alternative`] as [string, string]), 3);
  await seed(db, REVIEWS.map(([s, n]) => [`${s}-review`, `${n.toLowerCase()} reviews`] as [string, string]), 3);
  await seed(db, X_VS_Y, 3);
  await seed(db, GEO, 3);
  // P4 — credit-system spokes, for-X/tools, extras
  await seed(db, CREDIT_SPOKES, 4);
  await seed(db, FOR_X, 4);
  await seed(db, BEST_EXTRA, 4);
  await seed(db, CATEGORY_EXTRA, 4);
  // P5 — state spokes (hub-and-spoke around the existing state pages)
  const SPOKES: [string, string][] = STATES.flatMap(([slug, name]) => [
    [`${slug}-teacher-recertification-hours`, `${name.toLowerCase()} teacher recertification hours`] as [string, string],
    [`${slug}-educator-license-lookup`, `${name.toLowerCase()} educator license lookup`] as [string, string],
    [`${slug}-teacher-certification-requirements`, `${name.toLowerCase()} teacher certification requirements 2027`] as [string, string],
    [`${slug}-teacher-professional-development-requirements`, `${name.toLowerCase()} teacher professional development requirements`] as [string, string],
  ]);
  await seed(db, SPOKES, 5);

  for (const [stage, content] of PLAYBOOKS) {
    await sql`
      insert into seo_playbooks (stage, content)
      values (${stage}, ${content})
      on conflict (stage) do update set content = excluded.content, updated_at = now()
    `.execute(db);
  }
}

export async function down(db: Kysely<unknown>): Promise<void> {
  const slugs: string[] = [
    ...COMPARE.map(([s]) => `solutionwhere-vs-${s}`),
    ...COMPARE.map(([s]) => `${s}-alternative`),
    ...REVIEWS.map(([s]) => `${s}-review`),
    ...X_VS_Y.map(([s]) => s),
    ...BEST.map(([s]) => s),
    ...CATEGORY.map(([s]) => s),
    ...GEO.map(([s]) => s),
    ...TRUST.map(([s]) => s),
    ...CREDIT_SPOKES.map(([s]) => s),
    ...FOR_X.map(([s]) => s),
    ...BEST_EXTRA.map(([s]) => s),
    ...CATEGORY_EXTRA.map(([s]) => s),
    ...STATES.flatMap(([s]) => [
      `${s}-teacher-recertification-hours`,
      `${s}-educator-license-lookup`,
      `${s}-teacher-certification-requirements`,
      `${s}-teacher-professional-development-requirements`,
    ]),
  ];
  for (const slug of slugs) {
    await sql`delete from seo_keywords where slug = ${slug} and status = 'pending'`.execute(db);
  }
  for (const [stage] of PLAYBOOKS) {
    await sql`delete from seo_playbooks where stage = ${stage}`.execute(db);
  }
}
