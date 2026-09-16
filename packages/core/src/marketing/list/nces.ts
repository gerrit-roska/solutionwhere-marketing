import { CRAWL_USER_AGENT, domainOf, recordRun, upsertAccount } from "./shared";

// NCES CCD LEA universe — the spine of the district list (06 §2.1).
//
// Served via the Urban Institute Education Data API, which republishes the
// CCD district directory as paginated JSON (no key, no zip parsing):
//   https://educationdata.urban.org/api/v1/school-districts/ccd/directory/{year}/
// Filters per the spec: operational regular districts (agency_type 1/2/7)
// with pre-K/K and enrollment >= 2500 → tier 6; 1000-2500 → PD-only tier 6.
// LEA_TYPE 3 (regional service agencies) are captured as `esa` rows — NCES
// is the second source for the AESA segment.

interface UrbanDistrict {
  leaid?: string;
  lea_name?: string;
  state_location?: string;
  city_location?: string;
  county_name?: string;
  agency_type?: number;
  enrollment?: number | null;
  lowest_grade_offered?: number | null;
  urls?: string | null; // present in some vintages; often null
  phone?: string;
}

interface UrbanPage {
  next: string | null;
  results: UrbanDistrict[];
}

// CCD "lowest grade offered": -1 = PK, 0 = KG.
const HAS_EARLY_GRADES = (g: number | null | undefined): boolean =>
  g !== null && g !== undefined && g <= 0;

const START_YEAR = 2023; // latest broadly-available CCD directory vintage

export async function runNces(): Promise<void> {
  await recordRun("nces-ccd", async () => {
    let seen = 0;
    let added = 0;
    let updated = 0;

    let url: string | null =
      `https://educationdata.urban.org/api/v1/school-districts/ccd/directory/${START_YEAR}/`;
    while (url) {
      // The API 403s node's default UA; a browser UA passes.
      const response = await fetch(url, {
        headers: { "User-Agent": CRAWL_USER_AGENT },
      });
      if (!response.ok) {
        throw new Error(`Urban CCD API failed: ${response.status} at ${url}`);
      }
      const page = (await response.json()) as UrbanPage;
      for (const row of page.results) {
        seen += 1;
        if (!row.lea_name || !row.state_location) continue;
        const agencyType = row.agency_type ?? 0;
        const enrollment = row.enrollment ?? null;

        const isRegular = [1, 2, 7].includes(agencyType);
        const isEsa = agencyType === 4 || agencyType === 3; // regional/supervisory-union service shapes vary by vintage

        if (isRegular) {
          const bigEnough = (enrollment ?? 0) >= 2500;
          const pdTier = (enrollment ?? 0) >= 1000 && (enrollment ?? 0) < 2500;
          if (!bigEnough && !pdTier) continue;
          // 06 §2.1 GSLO rule: enrollments/EC fit requires pre-K/K. A big
          // district whose lowest grade is above KG stays PD-only.
          const modulesFit =
            bigEnough && HAS_EARLY_GRADES(row.lowest_grade_offered)
              ? ["pd", "enrollments", "coaching"]
              : ["pd"];
          const website = row.urls ?? null;
          const { isNew } = await upsertAccount({
            account_name: row.lea_name,
            account_type: "district",
            domain: domainOf(website),
            website,
            state: row.state_location,
            city: row.city_location ?? null,
            county: row.county_name ?? null,
            nces_leaid: row.leaid ?? null,
            enrollment,
            modules_fit: modulesFit,
            source: "nces-ccd",
            source_url: `https://educationdata.urban.org/api/v1/school-districts/ccd/directory/${START_YEAR}/`,
          });
          if (isNew) added += 1;
          else updated += 1;
        } else if (isEsa) {
          const website = row.urls ?? null;
          const { isNew } = await upsertAccount({
            account_name: row.lea_name,
            account_type: "esa",
            domain: domainOf(website),
            website,
            state: row.state_location,
            city: row.city_location ?? null,
            county: row.county_name ?? null,
            nces_leaid: row.leaid ?? null,
            modules_fit: ["pd", "coaching"],
            source: "nces-ccd",
          });
          if (isNew) added += 1;
          else updated += 1;
        }
      }
      url = page.next;
    }
    return { seen, added, updated };
  });
}
