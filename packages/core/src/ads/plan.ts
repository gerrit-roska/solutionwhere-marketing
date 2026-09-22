// The Google Ads account plan, encoded literally from
// docs/03-google-ads-execution.md. If a number or keyword here disagrees with
// the spec, the spec is right and this file is wrong.
//
// Notation preserved from the spec: [keyword] = exact match, "keyword" =
// phrase match. Broad match is banned account-wide (03 §0) — the parser
// below refuses anything else.

export type MatchType = "EXACT" | "PHRASE";

export interface KeywordPlan {
  text: string;
  match: MatchType;
  /** Keyword-level CPC override (03 §3.2: bare competitor brands bid $1.50–$3.00, not the ad-group default). */
  cpcUsd?: number;
  /** Keyword-level landing page override (e.g. [wisdomwhere login] → /support, 03 §3.1). */
  finalUrl?: string;
}

export interface RsaPlan {
  headlines: string[]; // 15 max, 30 chars each
  descriptions: string[]; // 4 max, 90 chars each
  path1?: string;
  path2?: string;
}

export interface AdGroupPlan {
  key: string;
  name: string;
  cpcUsd: number;
  finalUrl: string;
  keywords: KeywordPlan[];
  rsa: RsaPlan;
  /** Ad-group-level negatives (03 §3.7.1 observation-tools). */
  negatives?: string[];
}

export interface CampaignPlan {
  key: string;
  name: string; // [Module] | [Intent] | [Match] | [Geo]  (03 §2)
  monthlyBudgetUsd: number; // steady-state peak-month figure, 03 §2
  phase: string;
  adGroups: AdGroupPlan[];
  /** REF is built paused and never launches (03 §3.6: every term measured zero). */
  neverLaunch?: boolean;
}

export interface NegativeListPlan {
  key: string;
  name: string;
  terms: string[];
  /** Campaign keys, or "ALL". */
  appliesTo: string[] | "ALL";
}

const SITE = "https://home.solutionwhere.com";

/** Parse spec notation: [exact] "phrase". Anything else throws — broad match is banned. */
export function kw(raw: string, overrides: Partial<KeywordPlan> = {}): KeywordPlan {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return { text: trimmed.slice(1, -1), match: "EXACT", ...overrides };
  }
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return { text: trimmed.slice(1, -1), match: "PHRASE", ...overrides };
  }
  throw new Error(`Keyword "${raw}" is not [exact] or "phrase" — broad match is banned (03 §0).`);
}

const kws = (raw: string[]): KeywordPlan[] => raw.map((k) => kw(k));

// ---------------------------------------------------------------------------
// §7 RSA copy. Headlines ≤30 chars, descriptions ≤90 chars — validated by
// validatePlan() below.
// ---------------------------------------------------------------------------

const RSA_PD_MANAGEMENT: RsaPlan = {
  // RSA path fields cap at 15 chars — "professional-development" (24) is
  // rejected by the API, so the display path uses the module shorthand.
  path1: "pd",
  path2: "districts",
  headlines: [
    "PD Management Software",
    "Built for Education Agencies",
    "Serving Districts Since 1996",
    "80% Less Registration Admin",
    "One System of Record for PD",
    "Registration, Credits, Reports",
    "Used in 33+ States",
    "Buy One Module, Not a Suite",
    "Reports Your State Accepts",
    "A Person Answers the Phone",
    "Independent for 30 Years",
    "From Catalog to Transcript",
    "Districts, ISDs, IUs and ESCs",
    "See It in 20 Minutes",
    "Straight Answer on Fit",
  ],
  descriptions: [
    "Registration, approvals, credits and transcripts in one place. Built for agencies.",
    "Thirty years serving districts and regional agencies. No forced migrations.",
    "Buy the module you need now. Add enrollment or coaching later, on the same login.",
    "Twenty-minute demo focused on your reporting requirements. Straight answer on fit.",
  ],
};

const RSA_PD_REGISTRATION: RsaPlan = {
  path1: "pd",
  headlines: [
    "PD Registration Software",
    "End the Registration Backlog",
    "80% Less Admin Time",
    "Self-Service Registration",
    "Waitlists That Run Themselves",
    "Approvals Routed Automatically",
    "PO, Check, Card or E-Check",
    "Built for Districts and ISDs",
    "Rosters, Sign-In, Certificates",
    "Serving Agencies Since 1996",
    "One Catalog, Every Audience",
    "Consortium Sharing Included",
    "Used in 33+ States",
    "See a 20-Minute Demo",
    "Nothing to Host",
  ],
  descriptions: [
    "Staff register themselves. Waitlists, approvals and reminders run on their own.",
    "Rosters, attendance, certificates and transcripts from the registration you already took.",
    "POs, checks, cards and e-checks — how public agencies actually pay.",
    "Cloud hosted, daily backups, upgrades included. Nothing for your IT department to run.",
  ],
};

const RSA_PD_TRACKING: RsaPlan = {
  path1: "pd",
  headlines: [
    "PD Tracking Software",
    "Recertification Reporting",
    "Clock Hours, CEUs, Credits",
    "Transcripts on Demand",
    "Audit-Ready PD Records",
    "Built for State Reporting",
    "SCECH, Act 48, CTLE, LPDC",
    "Every Hour, Documented",
    "Serving Districts Since 1996",
    "Used in 33+ States",
    "One Record Per Educator",
    "No More Spreadsheets",
    "Reports in Seconds",
    "See It in 20 Minutes",
    "Independent Since 1996",
  ],
  descriptions: [
    "One record per educator, registration to transcript. Compliance reports on demand.",
    "Clock hours, CEUs and state credit systems tracked the way your state requires them.",
    "When the audit comes, the evidence is already assembled. No spreadsheet rebuilds.",
    "Twenty-minute demo built around your state's reporting rules. Straight answer on fit.",
  ],
};

const RSA_ENROLLMENT: RsaPlan = {
  path1: "enrollments",
  headlines: [
    "School Enrollment Software",
    "Registration Without Paper",
    "Families Register by Phone",
    "Documents Verified Digitally",
    "Residency Checks, Automated",
    "Duplicate Detection Built In",
    "Multilingual Registration",
    "Waitlists Families Can See",
    "Built for Districts and ISDs",
    "Serving Agencies Since 1996",
    "One Screen for Your Staff",
    "Transfers Handled in System",
    "Audit Trail on Every Decision",
    "See a 20-Minute Demo",
    "Buy One Module, Not a Suite",
  ],  descriptions: [
    "Families register on a phone, in their language, without coming to the office.",
    "Document review, residency checks and duplicate detection stop being manual work.",
    "Choice, waitlists and transfers on one screen instead of four systems and a spreadsheet.",
    "Thirty years serving education agencies. Buy enrollment now, add PD or coaching later.",
  ],
};

const RSA_LOTTERY: RsaPlan = {
  path1: "enrollments",
  headlines: [
    "School Choice Software",
    "Defensible Lottery Draws",
    "Recorded Seeds, Rerunnable",
    "Ranked Choice Applications",
    "Priority Rules You Configure",
    "Sibling Linking, Automatic",
    "Set-Asides Handled Properly",
    "Family-Visible Waitlists",
    "Equity Reporting Included",
    "Every Draw Has an Audit Trail",
    "Magnet, Charter, Open Enroll",
    "For Districts and Networks",
    "Serving Agencies Since 1996",
    "Explain Any Placement",
    "See It in 20 Minutes",
  ],
  descriptions: [
    "Recorded seeds. Rerun any draw and get the same result — in front of a board.",
    "Ranked preferences, sibling links, set-asides and priority rules set to your policy.",
    "When a family asks why they were placed there, the answer is in the record.",
    "Post-season reporting, equity metrics and a full audit trail. No reconstruction.",
  ],
};

const RSA_COACHING: RsaPlan = {
  path1: "coaching",
  headlines: [
    "Instructional Coaching Tools",
    "Coaching That Leaves a Record",
    "Caseloads, Visits, Evidence",
    "Log Visits From the Classroom",
    "Works Offline on a Tablet",
    "Your Framework, Not a Template",
    "Non-Evaluative by Design",
    "Planned vs. Delivered Visits",
    "Multi-District Reporting",
    "Goals With Evidence Attached",
    "Built for ISDs and Districts",
    "Monitoring-Ready Evidence",
    "Serving Agencies Since 1996",
    "Prove the Coaching Happened",
    "See a 20-Minute Demo",
  ],
  descriptions: [
    "Caseloads, visits, goals and evidence in one place. Docs compile while you coach.",
    "Log a visit from the classroom on a tablet, offline. It syncs when you're back online.",
    "Configured around your observation framework — not a template you work around.",
    "Planned vs. delivered visits, site allocation, cohort progress. Reports without assembly.",
  ],
};

const RSA_REFERRAL: RsaPlan = {
  path1: "referrals",
  headlines: [
    "Child Care Referral Software",
    "Built for CCR&R Agencies",
    "One System, Not Four Tools",
    "Match Families to Openings",
    "Intake, Search, Follow-Up",
    "Referral History in One Place",
    "Provider Records Stay Current",
    "State Reports From Live Data",
    "Track Referrals to Outcome",
    "Licensing and Capacity Tracked",
    "Serving Agencies Since 1996",
    "Subsidy, Language, Hours, Age",
    "Built for Lead Agencies",
    "See a 20-Minute Demo",
    "Straight Answer on Fit",
  ],
  descriptions: [
    "Family intake, live provider search, referral history and funder reporting in one system.",
    "Filter openings by age, schedule, quality rating and distance mid-call.",
    "Follow-up and outcomes recorded automatically — the state report writes itself.",
    "Built for CCR&Rs, lead agencies and early childhood networks. 20-minute demo.",
  ],
};

// §7.8 — competitor groups. No trademarks anywhere in copy (03 §3.2 rule).
const RSA_COMPETITOR: RsaPlan = {
  headlines: [
    "Compare Before You Renew",
    "Independent Since 1996",
    "Buy One Module, Not a Suite",
    "Never Been Acquired",
    "No Forced Migrations",
    "A Person Answers the Phone",
    "Honest Side-by-Side Comparison",
    "Used in 33+ States",
    "Priced for One Problem",
    "See Where We're Not a Fit",
    "30 Years, Same Company",
    "Migration Support Included",
    "Built for Education Agencies",
    "See a 20-Minute Demo",
    "Straight Answer on Fit",
  ],
  descriptions: [
    "An honest side-by-side, including the things the other platform does better. Then decide.",
    "Thirty years independent. No private equity roll-up, no forced migration.",
    "Solve one problem now. Add the next module when you're ready, on the same login.",
    "Certified specialists answer a published phone number, 8:30-5 ET. Not a ticket queue.",
  ],
};

// §7 has no brand-specific RSA; this one is assembled from the same
// positioning (gtm-strategy §5) so every brand ad group can serve.
const RSA_BRAND: RsaPlan = {
  headlines: [
    "Solutionwhere",
    "Official Solutionwhere Site",
    "Wisdomwhere by Solutionwhere",
    "Serving Districts Since 1996",
    "A Person Answers the Phone",
    "PD Registration & Tracking",
    "School Enrollment Software",
    "Independent for 30 Years",
    "Used in 33+ States",
    "Buy One Module, Not a Suite",
    "CourseWhere Upgrade Path",
    "Request a 20-Minute Demo",
    "Talk to a Real Person",
    "North Canton, Ohio",
    "Straight Answer on Fit",
  ],
  descriptions: [
    "Registration, approvals, credits and transcripts in one place. Built for agencies.",
    "Thirty years serving districts and regional agencies. No forced migrations.",
    "Certified specialists answer a published phone number, 8:30-5 ET. Not a ticket queue.",
    "Twenty-minute demo focused on your reporting requirements. Straight answer on fit.",
  ],
};

const compareUrl = (slug: string) => `${SITE}/compare/solutionwhere-vs-${slug}`;

// ---------------------------------------------------------------------------
// §4 Shared negative keyword lists (created first, applied per the spec).
// Match type BROAD — the UI default the spec's list semantics assume.
// ---------------------------------------------------------------------------

export const NEGATIVE_LISTS: NegativeListPlan[] = [
  {
    key: "consumer-parent",
    name: "NEG - Consumer/Parent",
    appliesTo: "ALL",
    terms: [
      "daycare", "day care", "daycare near me", "child care near me",
      "preschool near me", "find child care", "child care assistance",
      "child care subsidy application", "child care voucher", "babysitter",
      "nanny", "after school program", "summer camp", "tuition",
      "parent portal", "parent app", "enroll my child", "how to enroll",
      "school district boundaries", "school ratings", "best schools",
      "kindergarten age", "immunization requirements",
    ],
  },
  {
    key: "job-seeker",
    name: "NEG - Job Seeker",
    appliesTo: "ALL",
    terms: [
      "jobs", "job", "careers", "career", "hiring", "salary", "pay scale",
      "resume", "employment", "vacancy", "openings", "substitute teacher",
      "how to become", "degree", "certification cost", "online course",
      "online courses", "class", "classes", "free training", "free pd",
      "free professional development", "webinar", "conference 2026",
    ],
  },
  {
    key: "wrong-product",
    name: "NEG - Wrong Product",
    appliesTo: "ALL",
    terms: [
      "lms", "learning management system", "canvas", "schoology",
      "google classroom", "blackboard", "moodle", "payroll", "hr software",
      "applicant tracking", "substitute management", "sub finder",
      "gradebook", "report card software", "student information system",
      "sis", "attendance software", "transportation software",
      "food service software", "cafeteria", "iep software",
      "special education software", "crm", "erp", "accounting",
      "billing software", "point of sale", "church", "gym", "fitness",
    ],
  },
  {
    key: "provider-ops",
    name: "NEG - Provider Ops",
    appliesTo: ["ref-category", "cch-category", "pd-category"],
    terms: [
      "brightwheel", "procare", "lillio", "himama", "kangarootime",
      "playground", "tadpoles", "childcare crm", "daycare management software",
      "daycare billing", "child care center software",
      "preschool management software", "family child care software",
      "child care app for parents", "child care licensing application",
      "how to open a daycare", "child care business plan",
    ],
  },
  {
    key: "higher-ed-corporate",
    name: "NEG - Higher Ed & Corporate",
    appliesTo: "ALL",
    terms: [
      "university", "college", "higher education", "campus",
      "student affairs", "admissions crm", "enrollment marketing",
      "corporate training", "employee training", "compliance training",
      "onboarding software", "osha", "hipaa training",
      "association management",
    ],
  },
  {
    key: "login-intent",
    name: "NEG - Login Intent",
    appliesTo: ["pd-competitor", "multi-competitor", "pd-state-compliance"],
    terms: [
      "login", "log in", "logon", "sign in", "signin", "sign up",
      "password", "reset password", "forgot password", "app", "download",
      "install", "support", "help", "help desk", "customer service",
      "phone number", "contact", "tutorial", "how to use",
      "training video", "central login", "admin login",
    ],
  },
];

// ---------------------------------------------------------------------------
// §2/§3 campaigns. Budgets are the peak-month figures from the campaign
// table; the daily budget set on the account is monthly/30.4.
// ---------------------------------------------------------------------------

export const CAMPAIGNS: CampaignPlan[] = [
  {
    key: "brand-defense",
    name: "BRAND | Defense | EX | US",
    monthlyBudgetUsd: 150,
    phase: "Phase 1 — day one",
    adGroups: [
      {
        key: "brand-core",
        name: "brand-core - EX",
        cpcUsd: 3.0,
        finalUrl: SITE,
        rsa: RSA_BRAND,
        keywords: kws([
          "[solutionwhere]", "[solution where]", "[solutionwhere inc]",
          "[solutionwhere software]", "[solutionwhere login]",
          "[solutionwhere support]", "[solutionware]",
          "[solution ware software]",
        ]),
      },
      {
        key: "wisdomwhere",
        name: "wisdomwhere - EX",
        cpcUsd: 3.0,
        finalUrl: `${SITE}/professional-development`,
        rsa: RSA_BRAND,
        keywords: [
          ...kws([
            "[wisdomwhere]", "[wisdom where]",
            "[wisdomwhere professional development]", "[wisdomwhere software]",
            "[wisdomwhere training]", "[wisdomwhere pricing]",
          ]),
          // Login-seekers are existing users — route to /support (03 §3.1).
          kw("[wisdomwhere login]", { finalUrl: `${SITE}/support` }),
        ],
      },
      {
        key: "coursewhere",
        name: "coursewhere - EX",
        cpcUsd: 4.0,
        finalUrl: `${SITE}/coursewhere`,
        rsa: RSA_BRAND,
        keywords: kws([
          "[coursewhere]", "[course where software]", "[coursewhere login]",
          "[coursewhere alternative]", "[coursewhere replacement]",
          "[coursewhere upgrade]", "[coursewhere to wisdomwhere]",
          "[coursewhere end of life]", "[coursewhere support]",
        ]),
      },
      {
        key: "legacy-products",
        name: "legacy-products - EX",
        cpcUsd: 3.0,
        finalUrl: `${SITE}/professional-development`,
        rsa: RSA_BRAND,
        keywords: kws([
          "[central pd registry]", "[central pd approval]",
          "[great school jobs]", "[pearson schoolnet eds replacement]",
          "[schoolnet eds alternative]",
        ]),
      },
    ],
  },
  {
    key: "pd-competitor",
    name: "PD | Competitor | EX | US",
    monthlyBudgetUsd: 250,
    phase: "Phase 1 — gated on comparison pages live",
    adGroups: [
      {
        key: "frontline",
        name: "frontline - EX",
        cpcUsd: 12.0,
        finalUrl: compareUrl("frontline-professional-growth"),
        rsa: RSA_COMPETITOR,
        keywords: [
          ...kws([
            "[frontline professional growth alternative]",
            "[frontline education alternative]",
            "[frontline pd alternative]",
            "[frontline professional growth competitors]",
            "[frontline professional growth pricing]",
            "[alternative to frontline education]",
            "[frontline professional growth reviews]",
          ]),
          // §3.2 rewrite: the volume is on the bare brand; bid it exact at
          // $1.50–$3.00 with the Login Intent list stripping teachers.
          kw("[frontline professional growth]", { cpcUsd: 2.0 }),
          kw("[frontline education professional growth]", { cpcUsd: 2.0 }),
        ],
      },
      {
        key: "mylearningplan",
        name: "mylearningplan - EX",
        cpcUsd: 10.0,
        finalUrl: compareUrl("mylearningplan"),
        rsa: RSA_COMPETITOR,
        keywords: [
          ...kws([
            "[mylearningplan alternative]", "[mylearningplan replacement]",
            "[my learning plan alternative]", "[mylearningplan competitors]",
            "[mylearningplan frontline migration]",
          ]),
          kw("[mylearningplan]", { cpcUsd: 2.0 }),
        ],
      },
      {
        key: "vector-solutions",
        name: "vector-solutions - EX",
        cpcUsd: 10.0,
        finalUrl: compareUrl("vector-solutions"),
        rsa: RSA_COMPETITOR,
        keywords: [
          ...kws([
            "[vector solutions pd alternative]",
            "[vector solutions professional development alternative]",
            "[safeschools alternative]",
            "[vector solutions competitors education]",
          ]),
          // Qualified variant only — never bare "vector solutions" (03 §3.2).
          kw("[vector solutions education]", { cpcUsd: 2.0 }),
        ],
      },
      {
        key: "pd-other",
        name: "pd-other - EX",
        cpcUsd: 9.0,
        finalUrl: compareUrl("kalpa"),
        rsa: RSA_COMPETITOR,
        keywords: [
          kw("[kalpa alternative]", { finalUrl: compareUrl("kalpa") }),
          kw("[kalpa professional development alternative]", {
            finalUrl: compareUrl("kalpa"),
          }),
          kw("[kalpa professional development]", {
            cpcUsd: 2.0,
            finalUrl: compareUrl("kalpa"),
          }),
          kw("[escworks alternative]", { finalUrl: compareUrl("escworks") }),
          kw("[escworks]", { cpcUsd: 2.0, finalUrl: compareUrl("escworks") }),
          kw("[pdplanner alternative]", { finalUrl: compareUrl("pdplanner") }),
          kw("[schooldata.net alternative]", {
            finalUrl: compareUrl("schooldata-net"),
          }),
          kw("[kickup learning alternative]", {
            finalUrl: compareUrl("kickup-learning"),
          }),
          kw("[growelab alternative]", { finalUrl: compareUrl("growelab") }),
          kw("[plad alternative]", { finalUrl: compareUrl("plad") }),
        ],
      },
    ],
  },
  {
    key: "pd-category",
    name: "PD | Category | EX-PH | US",
    monthlyBudgetUsd: 100,
    phase: "Phase 3",
    adGroups: [
      {
        key: "pd-management-software",
        name: "pd-management-software - EX-PH",
        cpcUsd: 14.0,
        finalUrl: `${SITE}/professional-development`,
        rsa: RSA_PD_MANAGEMENT,
        keywords: kws([
          "[professional development management software]",
          "[professional development software for schools]",
          "[professional development software for school districts]",
          "[professional learning management system]",
          "[pd management software]",
          "[educator professional development software]",
          "[teacher professional development software]",
          '"professional development management system"',
          '"professional development platform for districts"',
        ]),
      },
      {
        key: "pd-registration",
        name: "pd-registration - EX-PH",
        cpcUsd: 12.0,
        finalUrl: `${SITE}/professional-development`,
        rsa: RSA_PD_REGISTRATION,
        keywords: kws([
          "[professional development registration software]",
          "[pd registration system for schools]",
          "[training registration software for schools]",
          "[workshop registration software for school districts]",
          "[course registration software for districts]",
          "[education conference registration software]",
          "[pd catalog software]",
          '"registration software for professional development"',
          '"online pd registration system"',
        ]),
      },
      {
        key: "pd-tracking-credits",
        name: "pd-tracking-credits - EX-PH",
        cpcUsd: 11.0,
        finalUrl: `${SITE}/professional-development`,
        rsa: RSA_PD_TRACKING,
        keywords: kws([
          "[professional development tracking software]",
          "[teacher pd tracking system]",
          "[ceu tracking software for schools]",
          "[clock hour tracking software teachers]",
          "[professional development record keeping software]",
          "[educator credential tracking software]",
          "[teacher recertification tracking software]",
          '"track professional development hours software"',
        ]),
      },
      {
        key: "pd-agency-type",
        name: "pd-agency-type - EX-PH",
        cpcUsd: 10.0,
        finalUrl: `${SITE}/professional-development`,
        rsa: RSA_PD_MANAGEMENT,
        keywords: kws([
          "[professional development software for isd]",
          "[professional development software for boces]",
          "[professional development software for intermediate unit]",
          "[training management software for educational service center]",
          "[pd software for regional education agency]",
          "[professional development software for state education agency]",
          "[professional development software for esc]",
          "[professional development software for aea]",
        ]),
      },
    ],
  },
  {
    key: "enr-category",
    name: "ENR | Category | EX-PH | US",
    monthlyBudgetUsd: 400,
    phase: "Phase 2 — only category campaign with real volume",
    adGroups: [
      {
        key: "enrollment-software",
        name: "enrollment-software - EX-PH",
        cpcUsd: 22.0,
        finalUrl: `${SITE}/enrollments`,
        rsa: RSA_ENROLLMENT,
        keywords: kws([
          "[school enrollment software]",
          "[student enrollment software for districts]",
          "[online enrollment software for schools]",
          "[district enrollment management system]",
          "[k-12 enrollment software]",
          '"enrollment software for school districts"',
          '"online enrollment system for schools"',
        ]),
      },
      {
        key: "online-registration",
        name: "online-registration - EX-PH",
        cpcUsd: 12.0,
        finalUrl: `${SITE}/enrollments`,
        rsa: RSA_ENROLLMENT,
        keywords: kws([
          "[school registration software]",
          "[online student registration]",
          "[online student registration software]",
          "[student registration system]",
          "[school registration system]",
          "[k 12 online registration]",
          "[online school registration system]",
          "[back to school registration software]",
          "[student registration software for school districts]",
          '"online registration for school districts"',
          '"paperless school registration"',
        ]),
      },
      {
        key: "enrollment-management",
        name: "enrollment-management - EX-PH",
        cpcUsd: 16.0,
        finalUrl: `${SITE}/enrollments`,
        rsa: RSA_ENROLLMENT,
        keywords: kws([
          "[student enrollment management system]",
          "[enrollment management system]",
          "[student enrollment software]",
          "[online enrollment management system]",
          "[school enrollment management software]",
        ]),
      },
      {
        key: "school-choice-lottery",
        name: "school-choice-lottery - EX-PH",
        cpcUsd: 10.0,
        finalUrl: `${SITE}/enrollments`,
        rsa: RSA_LOTTERY,
        keywords: kws([
          "[school choice lottery]", "[magnet lottery]",
          "[charter school lottery software]", "[school choice software]",
          "[school lottery software]", "[student lottery software]",
          "[magnet school application software]",
          "[open enrollment software for districts]",
          "[school choice application system]",
          "[weighted lottery software schools]",
          '"school choice lottery platform"',
        ]),
      },
      {
        key: "early-childhood-enrollment",
        name: "early-childhood-enrollment - EX-PH",
        cpcUsd: 16.0,
        finalUrl: `${SITE}/enrollments`,
        rsa: RSA_ENROLLMENT,
        keywords: kws([
          "[pre k enrollment software]",
          "[preschool enrollment software for districts]",
          "[early childhood enrollment system]",
          "[kindergarten registration software]",
          "[pre k application system]",
          "[early childhood registration software]",
          '"pre-k enrollment platform"',
        ]),
      },
      {
        key: "enrollment-ops",
        name: "enrollment-ops - EX-PH",
        cpcUsd: 18.0,
        finalUrl: `${SITE}/enrollments`,
        rsa: RSA_ENROLLMENT,
        keywords: kws([
          "[student residency verification software]",
          "[school enrollment waitlist software]",
          "[in district transfer software schools]",
          "[enrollment document verification software]",
          "[sibling preference enrollment software]",
        ]),
      },
    ],
  },
  {
    key: "cch-category",
    name: "CCH | Category | EX-PH | US",
    monthlyBudgetUsd: 150,
    phase: "Phase 3",
    adGroups: [
      {
        key: "instructional-coaching",
        name: "instructional-coaching - EX-PH",
        cpcUsd: 16.0,
        finalUrl: `${SITE}/coaching`,
        rsa: RSA_COACHING,
        keywords: kws([
          "[instructional coaching software]",
          "[instructional coaching platform]",
          "[instructional coaching software for districts]",
          "[teacher coaching software]",
          "[coaching software for schools]",
          '"instructional coaching management software"',
          '"software for instructional coaches"',
        ]),
      },
      {
        key: "coaching-documentation",
        name: "coaching-documentation - EX-PH",
        cpcUsd: 13.0,
        finalUrl: `${SITE}/coaching`,
        rsa: RSA_COACHING,
        keywords: kws([
          "[coaching log software]",
          "[instructional coaching tracking software]",
          "[coaching cycle tracking software]",
          "[coaching caseload management software]",
          "[teacher observation and coaching software]",
          "[coaching documentation system schools]",
          '"log coaching visits software"',
        ]),
      },
      {
        key: "mentoring-induction",
        name: "mentoring-induction - EX-PH",
        cpcUsd: 7.0,
        finalUrl: `${SITE}/coaching`,
        rsa: RSA_COACHING,
        keywords: kws([
          "[mentoring tracking system]",
          "[mentor tracking software]",
          "[teacher mentoring software]",
          "[teacher induction software]",
          "[new teacher mentoring program software]",
        ]),
      },
      {
        key: "walkthroughs",
        name: "walkthroughs - EX-PH",
        cpcUsd: 14.0,
        finalUrl: `${SITE}/coaching`,
        rsa: RSA_COACHING,
        keywords: kws([
          "[walkthrough app]",
          "[classroom walkthrough software]",
          "[walkthrough observation app for schools]",
          "[classroom observation software non evaluative]",
          "[instructional rounds software]",
        ]),
      },
      {
        key: "early-childhood-coaching",
        name: "early-childhood-coaching - EX-PH",
        cpcUsd: 11.0,
        finalUrl: `${SITE}/coaching`,
        rsa: RSA_COACHING,
        keywords: kws([
          "[early childhood coaching software]",
          "[child care coaching software]",
          "[technical assistance tracking software]",
          "[qris coaching software]",
          "[early childhood technical assistance software]",
          "[child care quality improvement software]",
          "[coaching software for ccr&r]",
          '"coaching software for early childhood programs"',
        ]),
      },
      {
        // §3.7.1 — the one BOFU term with measured volume. Observation ≠
        // evaluation; the ad-group negatives enforce that.
        key: "observation-tools",
        name: "observation-tools - EX-PH",
        cpcUsd: 4.0,
        finalUrl: `${SITE}/coaching`,
        rsa: RSA_COACHING,
        negatives: ["evaluation", "rubric", "danielson", "marzano"],
        keywords: kws([
          "[teacher observation tool]",
          "[classroom observation tool]",
          "[walkthrough tool for administrators]",
          '"teacher observation tool"',
        ]),
      },
    ],
  },
  {
    key: "ref-category",
    name: "REF | Category | EX-PH | US",
    monthlyBudgetUsd: 1, // API floor — the spec budgets $0: built, paused, never launches (03 §3.6)
    phase: "Never — zero measured volume",
    neverLaunch: true,
    adGroups: [
      {
        key: "child-care-referral",
        name: "child-care-referral - EX-PH",
        cpcUsd: 10.0,
        finalUrl: `${SITE}/referrals`,
        rsa: RSA_REFERRAL,
        keywords: kws([
          "[child care referral software]",
          "[child care resource and referral software]",
          "[ccr&r software]",
          "[ccrr software]",
          "[child care referral tracking system]",
          "[child care referral management software]",
          '"software for child care resource and referral agencies"',
        ]),
      },
      {
        key: "referral-ops",
        name: "referral-ops - EX-PH",
        cpcUsd: 9.0,
        finalUrl: `${SITE}/referrals`,
        rsa: RSA_REFERRAL,
        keywords: kws([
          "[child care provider database software]",
          "[child care intake software]",
          "[family child care referral system]",
          "[child care search software for agencies]",
          "[child care supply and demand data software]",
          "[child care referral reporting software]",
        ]),
      },
    ],
  },
  {
    key: "multi-competitor",
    name: "MULTI | Competitor | EX | US",
    monthlyBudgetUsd: 300,
    phase: "Phase 3 — gated on comparison pages live",
    adGroups: [
      {
        key: "enr-competitors",
        name: "enr-competitors - EX",
        cpcUsd: 18.0,
        finalUrl: compareUrl("schoolmint"),
        rsa: RSA_COMPETITOR,
        keywords: [
          kw("[schoolmint alternative]", { finalUrl: compareUrl("schoolmint") }),
          kw("[schoolmint competitors]", { finalUrl: compareUrl("schoolmint") }),
          kw("[powerschool enrollment alternative]", {
            finalUrl: compareUrl("powerschool-enrollment"),
          }),
          kw("[powerschool registration alternative]", {
            finalUrl: compareUrl("powerschool-enrollment"),
          }),
          kw("[infinite campus online registration alternative]", {
            finalUrl: compareUrl("infinite-campus-online-registration"),
          }),
          kw("[avela alternative]", { finalUrl: compareUrl("avela") }),
          // No comparison page exists for Final Forms / Registration Gateway
          // in 05 §4.2 — module page until one ships.
          kw("[final forms alternative]", { finalUrl: `${SITE}/enrollments` }),
          kw("[registration gateway alternative]", {
            finalUrl: `${SITE}/enrollments`,
          }),
          kw("[enrollwise alternative]", { finalUrl: compareUrl("enrollwise") }),
          kw("[edbrix alternative]", { finalUrl: compareUrl("edbrix") }),
        ],
      },
      {
        key: "cch-competitors",
        name: "cch-competitors - EX",
        cpcUsd: 14.0,
        finalUrl: compareUrl("sibme"),
        rsa: RSA_COMPETITOR,
        keywords: [
          kw("[sibme alternative]", { finalUrl: compareUrl("sibme") }),
          kw("[kickup alternative]", { finalUrl: compareUrl("kickup-learning") }),
          kw("[kickup foundations alternative]", {
            finalUrl: compareUrl("kickup-foundations"),
          }),
          kw("[teachboost alternative]", { finalUrl: compareUrl("teachboost") }),
          kw("[schoolstatus boost alternative]", {
            finalUrl: compareUrl("schoolstatus-coach"),
          }),
          kw("[schoolstatus coach alternative]", {
            finalUrl: compareUrl("schoolstatus-coach"),
          }),
          kw("[edthena alternative]", { finalUrl: compareUrl("edthena") }),
          kw("[iris connect alternative]", {
            finalUrl: compareUrl("iris-connect"),
          }),
          kw("[whetstone education alternative]", {
            finalUrl: compareUrl("whetstone-education"),
          }),
          kw("[bullseye evaluation alternative]", {
            finalUrl: compareUrl("bullseye"),
          }),
        ],
      },
      {
        key: "ref-competitors",
        name: "ref-competitors - EX",
        cpcUsd: 10.0,
        finalUrl: compareUrl("worklife-systems"),
        rsa: RSA_COMPETITOR,
        keywords: [
          kw("[worklife systems alternative]", {
            finalUrl: compareUrl("worklife-systems"),
          }),
          kw("[icarol alternative]", { finalUrl: compareUrl("icarol") }),
          kw("[kindersystems alternative]", {
            finalUrl: compareUrl("kindersystems"),
          }),
          kw("[bridgecare alternative]", { finalUrl: compareUrl("bridgecare") }),
          // No Tootris comparison page in 05 §4.2 — module page until one ships.
          kw("[tootris alternative]", { finalUrl: `${SITE}/referrals` }),
          kw("[wonderschool alternative]", {
            finalUrl: compareUrl("wonderschool"),
          }),
          kw("[insight child care software alternative]", {
            finalUrl: compareUrl("insight"),
          }),
        ],
      },
    ],
  },
  {
    key: "pd-state-compliance",
    name: "PD | State-Compliance | EX-PH | US",
    monthlyBudgetUsd: 150,
    phase: "Phase 4 — launches with the four existing state pages",
    adGroups: [
      // §3.8 template for the four states whose pages already exist
      // (05 §1: Indiana, Louisiana, Michigan, Arizona).
      ...(
        [
          ["indiana", "Indiana"],
          ["louisiana", "Louisiana"],
          ["arizona", "Arizona"],
          ["michigan", "Michigan"],
        ] as [string, string][]
      ).map(([slug, name]): AdGroupPlan => {
        const lower = name.toLowerCase();
        return {
          key: `${slug}-recert`,
          name: `${slug}-recert - EX-PH`,
          cpcUsd: 4.0,
          finalUrl: `${SITE}/blog/steps-to-${slug}-teacher-certification`,
          rsa: RSA_PD_TRACKING,
          keywords: kws([
            `[${lower} teacher certification renewal]`,
            `[${lower} teacher license renewal requirements]`,
            `[${lower} professional development requirements teachers]`,
            `[how to renew teaching license in ${lower}]`,
            `"${lower} teacher recertification hours"`,
          ]),
        };
      }),
      // §3.8 state credit systems — the credit system IS the software
      // requirement. Hubs exist at the root per 05 §3 revised.
      {
        key: "scech",
        name: "scech - EX",
        cpcUsd: 4.0,
        finalUrl: `${SITE}/scech`,
        rsa: RSA_PD_TRACKING,
        keywords: kws([
          "[scech tracking software]",
          "[scech reporting requirements]",
          "[how to submit scech]",
        ]),
      },
      {
        key: "act-48",
        name: "act-48 - EX",
        cpcUsd: 4.0,
        finalUrl: `${SITE}/act-48`,
        rsa: RSA_PD_TRACKING,
        keywords: kws([
          "[act 48 tracking software]",
          "[act 48 reporting for districts]",
          "[act 48 hours tracking]",
        ]),
      },
      {
        key: "cpe-texas",
        name: "cpe-texas - EX",
        cpcUsd: 4.0,
        finalUrl: `${SITE}/blog/steps-to-texas-teacher-certification`,
        rsa: RSA_PD_TRACKING,
        keywords: kws([
          "[cpe tracking software teachers]",
          "[texas cpe hours tracking]",
        ]),
      },
      {
        key: "lpdc",
        name: "lpdc - EX",
        cpcUsd: 4.0,
        finalUrl: `${SITE}/lpdc`,
        rsa: RSA_PD_TRACKING,
        keywords: kws([
          "[lpdc tracking software]",
          "[local professional development committee software]",
        ]),
      },
      {
        key: "ctle",
        name: "ctle - EX",
        cpcUsd: 4.0,
        finalUrl: `${SITE}/ctle`,
        rsa: RSA_PD_TRACKING,
        keywords: kws(["[ctle tracking software]", "[ctle hours reporting]"]),
      },
      {
        key: "illinois-clock-hours",
        name: "illinois-clock-hours - EX",
        cpcUsd: 4.0,
        finalUrl: `${SITE}/blog/steps-to-illinois-teacher-certification`,
        rsa: RSA_PD_TRACKING,
        keywords: kws([
          "[illinois pd clock hours tracking]",
          "[isbe professional development reporting]",
        ]),
      },
    ],
  },
];

// §3.7.1 modifier catch-alls — one phrase-match ad group per module campaign,
// $3.00 bid, so the Planner-rounds-to-zero long tail still matches.
const CATCHALL_MODIFIERS = [
  "for school districts",
  "for k12",
  "for k-12",
  "for charter schools",
  "for esc",
  "for boces",
  "for isd",
  "for intermediate unit",
  "pricing",
  "cost",
  "demo",
  "vendors",
  "rfp",
];

function catchallGroup(
  key: string,
  headTerm: string,
  finalUrl: string,
  rsa: RsaPlan,
): AdGroupPlan {
  return {
    key,
    name: `${key} - PH`,
    cpcUsd: 3.0,
    finalUrl,
    rsa,
    keywords: CATCHALL_MODIFIERS.map((m) => kw(`"${headTerm} ${m}"`)),
  };
}

const catchalls: [string, AdGroupPlan][] = [
  ["pd-category", catchallGroup("pd-longtail", "pd software", `${SITE}/professional-development`, RSA_PD_MANAGEMENT)],
  ["enr-category", catchallGroup("enr-longtail", "enrollment software", `${SITE}/enrollments`, RSA_ENROLLMENT)],
  ["cch-category", catchallGroup("cch-longtail", "coaching software", `${SITE}/coaching`, RSA_COACHING)],
  ["ref-category", catchallGroup("ref-longtail", "referral software", `${SITE}/referrals`, RSA_REFERRAL)],
];
for (const [campaignKey, group] of catchalls) {
  CAMPAIGNS.find((c) => c.key === campaignKey)?.adGroups.push(group);
}

// ---------------------------------------------------------------------------
// §6.2 geographic bid modifiers (resolved to geoTargetConstants at apply time)
// ---------------------------------------------------------------------------

export const GEO_MODIFIERS: { name: string; modifier: number }[] = [
  { name: "Michigan", modifier: 1.35 },
  { name: "Pennsylvania", modifier: 1.35 },
  { name: "Louisiana", modifier: 1.4 },
  { name: "Illinois", modifier: 1.3 },
  { name: "Ohio", modifier: 1.2 },
  { name: "New York", modifier: 1.15 },
  { name: "Texas", modifier: 1.15 },
  { name: "Nevada", modifier: 1.1 },
];

// ---------------------------------------------------------------------------
// §7.9 account-level assets
// ---------------------------------------------------------------------------

export const SITELINKS: { text: string; desc1: string; desc2: string; url: string }[] = [
  { text: "See the Platform", desc1: "Four modules, one login", desc2: "Buy one, add others later", url: `${SITE}/platform` },
  { text: "Common Questions", desc1: "Pricing, security, timeline", desc2: "Straight answers", url: `${SITE}/faq` },
  { text: "Security & FERPA", desc1: "What data we hold, and don't", desc2: "Answers for your IT team", url: `${SITE}/faq` },
  { text: "Talk to Support", desc1: "Certified specialists, 8:30–5 ET", desc2: "A published phone number", url: `${SITE}/support` },
  { text: "About Solutionwhere", desc1: "Independent since 1996", desc2: "North Canton, Ohio", url: `${SITE}/about` },
  { text: "Request a Demo", desc1: "20 minutes, focused on you", desc2: "Straight answer on fit", url: `${SITE}/demo` },
];

export const CALLOUTS: string[] = [
  "Since 1996", "33+ States", "Nothing to Host", "Daily Backups",
  "Upgrades Included", "Buy One Module", "Real Phone Support",
  "Migration Support", "No Long Onboarding",
];

export const STRUCTURED_SNIPPETS: { header: string; values: string[] }[] = [
  {
    header: "Services",
    values: ["Professional Development", "Enrollments", "Coaching", "Referrals"],
  },
  {
    header: "Types",
    values: ["School Districts", "Intermediate Units", "ESCs", "BOCES", "CCR&R Agencies", "State Agencies"],
  },
];

export const CALL_ASSET = {
  phoneNumber: "+1 231-935-3000",
  // Mon–Fri 8:30am–5:00pm ET (03 §7.9). Ad schedules run on the ACCOUNT
  // timezone — the account must be set to America/New_York at creation.
  startHour: 8,
  startMinute: 30,
  endHour: 17,
  endMinute: 0,
};

/** §6.1 ad schedule: Mon–Fri 6:00am–6:00pm (account timezone). */
export const AD_SCHEDULE = {
  days: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"] as const,
  startHour: 6,
  endHour: 18,
};

// ---------------------------------------------------------------------------
// Validation — run at bootstrap time so a spec violation fails locally
// before a single API call.
// ---------------------------------------------------------------------------

export function validatePlan(): string[] {
  const errors: string[] = [];
  const names = new Set<string>();
  for (const campaign of CAMPAIGNS) {
    if (names.has(campaign.name)) errors.push(`duplicate campaign name ${campaign.name}`);
    names.add(campaign.name);
    for (const group of campaign.adGroups) {
      if (group.rsa.headlines.length > 15) {
        errors.push(`${group.key}: ${group.rsa.headlines.length} headlines (>15)`);
      }
      if (group.rsa.headlines.length < 3) {
        errors.push(`${group.key}: ${group.rsa.headlines.length} headlines (<3)`);
      }
      for (const h of group.rsa.headlines) {
        if (h.length > 30) errors.push(`${group.key}: headline "${h}" is ${h.length} chars (>30)`);
      }
      if (group.rsa.descriptions.length > 4) {
        errors.push(`${group.key}: ${group.rsa.descriptions.length} descriptions (>4)`);
      }
      // RSA display paths cap at 15 chars each.
      if (group.rsa.path1 && group.rsa.path1.length > 15) {
        errors.push(`${group.key}: path1 "${group.rsa.path1}" is ${group.rsa.path1.length} chars (>15)`);
      }
      if (group.rsa.path2 && group.rsa.path2.length > 15) {
        errors.push(`${group.key}: path2 "${group.rsa.path2}" is ${group.rsa.path2.length} chars (>15)`);
      }
      for (const d of group.rsa.descriptions) {
        if (d.length > 90) errors.push(`${group.key}: description ${d.length} chars (>90)`);
      }
      for (const keyword of group.keywords) {
        if (keyword.text.length > 80) errors.push(`${group.key}: keyword "${keyword.text}" >80 chars`);
        if (keyword.text.split(" ").length > 10) {
          errors.push(`${group.key}: keyword "${keyword.text}" >10 words`);
        }
      }
    }
  }
  return errors;
}
