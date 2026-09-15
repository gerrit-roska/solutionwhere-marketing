import type { ModuleSegment } from "../../db/types";

// Title dictionary (06-cold-email-execution.md §3.2): case-insensitive
// substring matching, ranked; the highest-ranked match per account per
// module wins. Executive titles are never first contact.

const DICTIONARY: Record<ModuleSegment, { rank: number; titles: string[] }[]> = {
  pd: [
    {
      rank: 1,
      titles: [
        "director of professional learning",
        "director of professional development",
        "professional development coordinator",
        "professional learning coordinator",
        "supervisor of professional development",
        "coordinator of professional learning",
      ],
    },
    {
      rank: 2,
      titles: [
        "director of curriculum and instruction",
        "director of curriculum",
        "assistant superintendent for curriculum",
        "chief academic officer",
        "director of teaching and learning",
        "director of staff development",
      ],
    },
    {
      rank: 3,
      titles: [
        "professional development specialist",
        "staff development coordinator",
        "certification officer",
        "lpdc chair",
        "act 48 coordinator",
      ],
    },
  ],
  enrollments: [
    {
      rank: 1,
      titles: [
        "director of enrollment",
        "enrollment coordinator",
        "registrar",
        "director of student services",
        "student services coordinator",
        "director of admissions and enrollment",
        "school choice coordinator",
      ],
    },
    {
      rank: 2,
      titles: [
        "director of student information",
        "student data coordinator",
        "director of pupil services",
        "pupil personnel director",
      ],
    },
    {
      // Gatekeeper: second contact only, never the opener.
      rank: 3,
      titles: ["director of technology", "chief technology officer"],
    },
  ],
  coaching: [
    {
      rank: 1,
      titles: [
        "instructional coaching coordinator",
        "director of instructional coaching",
        "coordinator of instructional coaches",
        "early childhood coordinator",
        "quality improvement coordinator",
        "director of early childhood",
      ],
    },
    {
      rank: 2,
      titles: [
        "director of curriculum and instruction",
        "chief academic officer",
        "director of teaching and learning",
        "director of school improvement",
      ],
    },
    {
      rank: 3,
      titles: [
        "lead instructional coach",
        "technical assistance specialist",
        "coaching specialist",
      ],
    },
  ],
  referrals: [
    {
      rank: 1,
      titles: [
        "ccr&r director",
        "director of child care resource and referral",
        "director of family services",
        "referral services manager",
      ],
    },
    {
      rank: 2,
      titles: [
        "program director",
        "director of early childhood services",
        "child care program manager",
      ],
    },
    {
      rank: 3,
      titles: ["data and reporting manager", "quality improvement manager"],
    },
  ],
};

// The executive gate — they evaluate what the champion brings; never cold
// first contact (06 §3.2).
const NEVER_FIRST_CONTACT = [
  "superintendent",
  "assistant superintendent",
  "chief executive",
  "board member",
];

export interface TitleMatch {
  module: ModuleSegment;
  rank: number;
}

/** Every dictionary title — used as the server-side jobTitles filter for
 * GetLeads enrichment so we only pull ICP-shaped people at a domain. */
export function allDictionaryTitles(): string[] {
  const out: string[] = [];
  for (const module of Object.keys(DICTIONARY) as ModuleSegment[]) {
    for (const tier of DICTIONARY[module]) out.push(...tier.titles);
  }
  return out;
}

/** Best (lowest-rank) module match for a raw title string, or null. */
export function matchTitle(rawTitle: string): TitleMatch | null {
  const title = rawTitle.toLowerCase();
  if (NEVER_FIRST_CONTACT.some((t) => title.includes(t))) return null;

  let best: TitleMatch | null = null;
  for (const module of Object.keys(DICTIONARY) as ModuleSegment[]) {
    for (const tier of DICTIONARY[module]) {
      if (tier.titles.some((t) => title.includes(t))) {
        if (!best || tier.rank < best.rank) {
          best = { module, rank: tier.rank };
        }
        break;
      }
    }
  }
  // "executive director" is a rank-1 Referrals title ONLY at a CCR&R; the
  // caller decides using account_type — flagged here as module match with
  // the caller responsible for the ccrr check.
  if (!best && title.includes("executive director")) {
    return { module: "referrals", rank: 1 };
  }
  return best;
}
