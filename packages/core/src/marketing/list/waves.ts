import type { SelectQueryBuilder } from "kysely";
import { getDb } from "../../db";
import type { AccountType, Database } from "../../db/types";
import { upsertAccount } from "./shared";

// Spec 06 §7.1: do not blast the 15k-account TAM. Sequence by reference
// density, then by the budget calendar. These waves are the crawl/send
// order — Instantly campaigns stay draft until warmup says otherwise.

export const T3_STATES = ["MI", "PA", "OH", "NY"] as const;
export const T4_STATES = ["LA", "IL"] as const;
export const T5_STATES = ["TX", "CA", "GA", "IL"] as const;
export const T4_TYPES: AccountType[] = ["ccrr", "head_start", "county_network"];

export const STATE_NAME: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi",
  MO: "Missouri", MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire",
  NJ: "New Jersey", NM: "New Mexico", NY: "New York", NC: "North Carolina",
  ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee",
  TX: "Texas", UT: "Utah", VT: "Vermont", VA: "Virginia", WA: "Washington",
  WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming", DC: "District of Columbia",
};

export function stateCodeFromName(name: string | null | undefined): string | null {
  if (!name) return null;
  const trimmed = name.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase();
  const lower = trimmed.toLowerCase();
  for (const [code, full] of Object.entries(STATE_NAME)) {
    if (full.toLowerCase() === lower) return code;
  }
  return null;
}

export const ARKANSAS_ESCS: { name: string; domain: string; url: string }[] = [
  { name: "Arch Ford ESC", domain: "archford.org", url: "https://www.archford.org/" },
  { name: "Arkansas River ESC", domain: "aresc.k12.ar.us", url: "http://www.aresc.k12.ar.us/" },
  { name: "Crowley's Ridge EC", domain: "crowleys.k12.ar.us", url: "http://www.crowleys.k12.ar.us/" },
  { name: "Dawson ESC", domain: "dawsonesc.com", url: "https://www.dawsonesc.com/" },
  { name: "DeQueen/Mena ESC", domain: "dmesc.org", url: "http://www.dmesc.org/" },
  { name: "Great Rivers ESC", domain: "greatrivers.net", url: "https://www.greatrivers.net/" },
  { name: "Guy Fenter ESC", domain: "gfesc.us", url: "https://www.gfesc.us/" },
  { name: "Northcentral Arkansas ESC", domain: "naesc.k12.ar.us", url: "https://www.naesc.k12.ar.us/" },
  { name: "Northeast Arkansas EC", domain: "nea.k12.ar.us", url: "http://nea.k12.ar.us/" },
  { name: "Northwest Arkansas ESC", domain: "nwaesc.org", url: "https://www.nwaesc.org/" },
  { name: "OUR ESC", domain: "oursc.k12.ar.us", url: "https://www.oursc.k12.ar.us/" },
  { name: "South Central SC", domain: "scscoop.org", url: "http://www.scscoop.org/" },
  { name: "Southeast Arkansas ESC", domain: "searkcoop.com", url: "https://www.searkcoop.com/" },
  { name: "Southwest Arkansas EC", domain: "swaec.org", url: "https://www.swaec.org/" },
  { name: "Wilbur D. Mills ESC", domain: "wilbur.k12.ar.us", url: "http://www.wilbur.k12.ar.us/" },
];

export interface PeopleWave {
  id: string;
  label: string;
  tier: number;
  states?: string[];
  types?: AccountType[];
}

export const PEOPLE_WAVES: PeopleWave[] = [
  {
    id: "t2-ar",
    label: "Arkansas ESCs — same-state peers of the installed base",
    tier: 2,
    states: ["AR"],
    types: ["esa"],
  },
  {
    id: "t3-regional",
    label: "Michigan / Pennsylvania / Ohio / New York regional agencies",
    tier: 3,
    states: [...T3_STATES],
    types: ["esa"],
  },
  {
    id: "t4-ec",
    label: "Louisiana + Illinois early childhood (CCR&R / Head Start / county)",
    tier: 4,
    states: [...T4_STATES],
    types: T4_TYPES,
  },
  {
    id: "t5-large",
    label: "Texas / California / Georgia / Illinois regional agencies",
    tier: 5,
    states: [...T5_STATES],
    types: ["esa"],
  },
  {
    id: "t6-national",
    label: "National districts and remaining ESAs by enrollment",
    tier: 6,
  },
];

export interface AccountScope {
  states?: string[];
  types?: AccountType[];
}

type AccountsQB<O> = SelectQueryBuilder<Database, "accounts", O>;

export function applyAccountScope<O>(
  qb: AccountsQB<O>,
  scope?: AccountScope,
): AccountsQB<O> {
  let q = qb;
  if (scope?.states?.length) q = q.where("state", "in", scope.states);
  if (scope?.types?.length) q = q.where("account_type", "in", scope.types);
  return q;
}

export function scopeForWave(wave: PeopleWave): AccountScope {
  return { states: wave.states, types: wave.types };
}

export function waveById(id: string): PeopleWave {
  const wave = PEOPLE_WAVES.find((w) => w.id === id);
  if (!wave) {
    throw new Error(
      `Unknown wave "${id}". Expected one of: ${PEOPLE_WAVES.map((w) => w.id).join(", ")}`,
    );
  }
  return wave;
}

/** Spec §7.1 tier for a newly upserted account. */
export function priorityFor(state: string, type: AccountType): number {
  const s = state.toUpperCase();
  if (s === "AR") return 2;
  if (type === "esa" && (T3_STATES as readonly string[]).includes(s)) return 3;
  if ((T4_TYPES as string[]).includes(type) && (T4_STATES as readonly string[]).includes(s)) {
    return 4;
  }
  if (type === "esa" && (T5_STATES as readonly string[]).includes(s)) return 5;
  return 6;
}

/**
 * Re-stamp every account so crawl order matches §7.1. Later rules win.
 * Existing customers are suppression-list domains, not a sendable tier-1
 * cold list — cross-sell stays on its own Instantly campaign.
 */
export async function stampPriorityTiers(): Promise<{ updated: number }> {
  const db = getDb();
  await db.updateTable("accounts").set({ priority_tier: 6 }).execute();
  await db
    .updateTable("accounts")
    .set({ priority_tier: 5 })
    .where("account_type", "=", "esa")
    .where("state", "in", [...T5_STATES])
    .execute();
  await db
    .updateTable("accounts")
    .set({ priority_tier: 4 })
    .where("account_type", "in", T4_TYPES)
    .where("state", "in", [...T4_STATES])
    .execute();
  await db
    .updateTable("accounts")
    .set({ priority_tier: 3 })
    .where("account_type", "=", "esa")
    .where("state", "in", [...T3_STATES])
    .execute();
  const ar = await db
    .updateTable("accounts")
    .set({ priority_tier: 2 })
    .where("state", "=", "AR")
    .executeTakeFirst();
  return { updated: Number(ar.numUpdatedRows ?? 0) };
}

/** George's Identifying-leads list: 15 Arkansas co-ops with known sites. */
export async function seedArkansasEscs(): Promise<{ upserted: number }> {
  let upserted = 0;
  for (const esc of ARKANSAS_ESCS) {
    await upsertAccount({
      account_name: esc.name,
      account_type: "esa",
      domain: esc.domain,
      website: esc.url,
      state: "AR",
      modules_fit: ["pd", "coaching"],
      priority_tier: 2,
      source: "george-identifying-leads",
      source_url: esc.url,
    });
    upserted += 1;
  }
  return { upserted };
}
