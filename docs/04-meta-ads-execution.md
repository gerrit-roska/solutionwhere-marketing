# Solutionwhere — Meta Ads Execution Spec (Andromeda)

**Companion to:** `gtm-strategy.md` §6.4 (superseded by this file), `01-conversion-tracking-spec.md`, `07-graphed-platform-execution.md` §4.10
**Audience:** the engineer/agent building and operating the account.
**Date:** September 7, 2026 — rewritten. The prior version treated Meta as air cover only; that was pre-Andromeda thinking and is withdrawn.

---

## 0. Why Meta is a lead source now

Interest and job-title targeting never reached a Director of Professional Learning at an Intermediate Unit, which is why the last agency's $500/month produced nothing and why the first draft of this spec demoted Meta to retargeting.

Andromeda — Meta's retrieval engine, rolled out across objectives through 2025 — inverts the mechanism. It reads the creative and the landing page, predicts who converts from behavioral signal, and goes and finds them. Targeting inputs matter far less; creative and conversion signal matter far more. The narrow, weird, high-intent audience B2B could never define is now the algorithm's job.

So the plan is the one in Cody's Andromeda playbook (`notion-docs/b2b-facebook-andromeda-guide.md`), applied to this ICP:

1. **Personas** that each produce a distinct creative angle
2. **Sales-call language** mined into hooks and objections
3. **A creative factory** — dozens of distinct AI-avatar and static ads a week, tagged by persona × angle
4. **Broad targeting + Advantage+**, uploaded as paused drafts via the Marketing API
5. **A daily management agent** that kills, scales, and briefs the next batch by persona and angle
6. **Pixel + CAPI with full-funnel server events** — `Lead`, then `qualified_demo` and `closed_won` from the CRM — so Andromeda optimizes toward agencies that buy, not form-fillers

**The economics that make this worth funding:** ACV $20K–$100K on three-year contracts, allowable CAC $5K–$25K (`gtm-strategy.md` §1). A $3,000/month test that produces two qualified demos is a win. Judged on cost per *qualified* demo, never cost per lead.

---

## 1. Prerequisites — signal first, spend second

| # | Item | Detail |
|---|---|---|
| 1 | Meta Business Manager, Solutionwhere-owned; Graphed as Partner | |
| 2 | Domain `solutionwhere.com` verified | Business Settings → Brand Safety → Domains |
| 3 | Pixel via GTM on `home.solutionwhere.com` | Base code, all pages |
| 4 | **Conversions API, server-side, deduplicated** | §2. Non-negotiable — Andromeda learns from conversion events within hours; thin or dirty signal in the first 90 days sets a bad baseline |
| 5 | **Event Match Quality ≥ 6** on `Lead` before scaling past $50/day | Events Manager → Data Sources → Event Match Quality. Hashed `em`, `ph`, `fn`, `ln`, `ct`, `st`, `zp` on every event |
| 6 | Marketing API token with `ads_management` + `ads_read` | For draft uploads and the management agent. Tokens expire ~60 days — the `fb-manage-daily` job alerts at 50 |
| 7 | Ad account: USD, `America/New_York`, spend cap set | |
| 8 | `/demo` form captures `fbclid`, agency type, module, and a phone number | The phone number raises EMQ; agency type is the qualification field |
| 9 | Sales-call transcripts delivered (`gtm-strategy.md` §8 item 4) | Blocks persona validation (§3). Start with the ICP-derived personas; rewrite when transcripts land |

---

## 2. Conversion signal — the whole moat

### 2.1 Events

| Event | Fired by | Where | Value | Purpose |
|---|---|---|---|---|
| `PageView`, `ViewContent` | Pixel | Browser | — | Baseline |
| `Lead` | Pixel + CAPI, deduped on `event_id` | `/demo` submit | $500 | **Optimization event at launch** |
| `Schedule` | CAPI | Calendly confirm | $1,000 | Secondary |
| `qualified_demo` (custom) | CAPI from CRM | HubSpot stage → Qualified | $3,000 | **Optimization event once it has ≥ 25 events / 30 days** |
| `closed_won` (custom) | CAPI from CRM | HubSpot closed-won | deal amount | Sent as offline conversion; Andromeda's ultimate signal |
| `installed_base` (custom) | Pixel | Login/support click | — | **Exclusion only.** Never optimize toward it, never let it leak into `Lead` |

**Rule:** the optimization event moves down-funnel as soon as volume allows. `Lead` → `qualified_demo`. Every week the `fb-manage-daily` job (`07` §4.10) checks the 30-day count and flips the ad sets when the threshold is met.

### 2.2 CAPI payload — minimum

```
event_name, event_time, event_id (matches the browser event), action_source: "website" | "system_generated",
event_source_url, user_data: { em, ph, fn, ln, ct, st, zp, country, fbc, fbp, client_ip_address, client_user_agent },
custom_data: { value, currency, module, agency_type, lead_source }
```
All `user_data` fields SHA-256 on lowercased, trimmed values. `fbc` from the `_fbc` cookie / `fbclid`, `fbp` from `_fbp`. For CRM-fired events, `action_source: "system_generated"` and re-send the original `fbc` stored on the contact.

### 2.3 Aggregated Event Measurement priority

```
1. closed_won   2. qualified_demo   3. Schedule   4. Lead   5. ViewContent   6. PageView   7. installed_base
```

### 2.4 Test plan before spend

```
[ ] Test Events shows browser + server Lead with identical event_id, counted once
[ ] EMQ on Lead ≥ 6 with 10 test submissions using real-format data
[ ] qualified_demo fires from a HubSpot stage change within 15 minutes (CRM webhook → CAPI)
[ ] installed_base fires on /support and login clicks, and the exclusion audience populates
[ ] fbclid persists through /demo into HubSpot contact.property_fbclid (verified in the warehouse: `hubspot_*.contact.property_fbclid`)
```

---

## 3. Personas — each one must change the ad

A persona that does not change the hook, the objection, or the proof is documentation, not a persona. Same value prop everywhere: *four things education agencies do every year, one platform, independent since 1996, buy one module.* Everything else changes per row.

| # | Persona | Priority initiative | Pain in their words (hypothesis — replace from transcripts) | Objection | Proof that lands | Module |
|---|---|---|---|---|---|---|
| P1 | **PD Director / Coordinator** at a district or ESA | Get through registration season and the recertification report without losing a month | "I have three spreadsheets and a Google Form and the state report takes a week" | "We're on Frontline / it came with the suite" | 80% less registration admin; Act 48 / SCECH / CTLE reporting on demand; since 1996, never acquired | PD |
| P2 | **Registrar / Director of Student Services** | Survive registration season; defend the lottery to the board | "Paper packets in a filing cabinet and a lottery someone runs in Excel" | "PowerSchool has an enrollment module" | Families register from a phone in their language; seeded, re-runnable lottery with audit trail | Enrollments |
| P3 | **Curriculum & Instruction Director / Coaching Coordinator** | Prove the coaching investment produced something | "My coaches are doing the work and I can't show it happened" | "Our coaches won't log anything" | Offline tablet logging from the classroom; planned vs. delivered by site; non-evaluative, educator data only | Coaching |
| P4 | **CCR&R Executive Director / Program Director** | State reporting without four systems | "Intake in one place, providers in another, referral history in a spreadsheet" | "We've used [WorkLife/iCarol] for 15 years" | One system; funder report generated from operational data; On Track by 5 / LPSS reference | Referrals |
| P5 | **Superintendent / Executive Director** (the gate) | Outcomes, security, compliance — not features | "What happens to our data, and who do I call" | "Never heard of you" | 33+ states since 1996; FERPA and security pages; a published phone number answered by certified staff | All |
| P6 | **CourseWhere / legacy Wisdomwhere admin** | Get off an aging system without a migration disaster | "We've been on this since 2009 and nobody knows how it works anymore" | "Migration will break everything" | Documented upgrade path, data migrated by us, same company | PD |

**Validation step (do this before creative volume):** run the transcript-mining prompt from the playbook §3 against every sales call and demo recording Benjamin delivers. Replace every "pain in their words" cell with verbatim language. Flag which personas appear most; that is where the first creative budget goes. Re-run quarterly.

---

## 4. Angle matrix — the creative brief

Angles across the top, personas down the side. Every cell is an ad concept with its own `creative_id`.

| Angle | What it does | Example hook (P1) |
|---|---|---|
| **A1 Time cost** | Names the weeks lost to the manual process | "Registration season shouldn't cost your team six weeks." |
| **A2 Compliance / audit** | The state report, the board, the audit — already assembled | "When PDE asks for Act 48 hours, is the answer a button or a project?" |
| **A3 Peer proof** | A named agency in their state or archetype | "Lyons Township has run PD registration on this since [year]." |
| **A4 Independence** | Acquisition fatigue; since 1996, same company | "Frontline bought MyLearningPlan. We've been the same company for 30 years." |
| **A5 Buy one module** | Anti-suite; solve one problem now | "You don't need a platform commitment. You need registration to work by August." |
| **A6 Real support** | A phone number a person answers | "231-935-3000. A certified specialist answers. That's the whole pitch." |
| **A7 Migration** | For P6 and competitor switchers | "Still on CourseWhere? The upgrade path is documented and we move the data." |
| **A8 Product demo** | 20-second screen capture of the actual workflow | (no hook — show the lottery seed being re-run, the coaching log syncing) |

6 personas × 8 angles = 48 concepts. Each ships in **2–3 formats** (talking-head avatar video, static product screenshot with headline, short screen-capture demo) → **100–140 distinct ads per cycle.** That is the volume Andromeda needs; one perfect ad gives it one door.

**Creative rules that survive from the old spec:** no stock photography of children (it teaches the algorithm to find parents); show the real product; name the peer; every ad carries `?utm_source=facebook&utm_medium=paid_social&utm_campaign={{campaign.name}}&utm_content={{ad.name}}`; the `creative_id` is in the ad name.

**Creative rules specific to Andromeda:** no two ads share a headline (Meta collapses them into one auction entry); vary the subject, format, and tone between concepts, not just the color; refresh the whole batch every 2–3 weeks — fatigue is faster under Andromeda.

---

## 5. Creative factory

Implements playbook §4. Runs weekly as `fb-creative-factory-weekly` (`07` §4.10).

**Input:** `clients/solutionwhere/creative/matrix.json` — one row per persona × angle:
```json
{ "creative_id": "P1-A2-v1", "persona": "P1", "angle": "A2", "module": "pd",
  "hook": "When PDE asks for Act 48 hours, is the answer a button or a project?",
  "pain": "...", "proof": "...", "cta": "See it in 20 minutes", "landing": "https://home.solutionwhere.com/professional-development?module=pd" }
```

**Per row, the job:**
1. Writes a 30-second script in the persona's language — hook, pain, proof, one CTA.
2. Generates a talking-head video. Through Graphed Tools: `heygen:videos.avatar_iii` (listed in `graphed docs tools`); avatar and voice ids in project config. Static variants via `kie:` image models or a templated PNG with the product screenshot.
3. Writes primary text (≤125 chars visible), headline (≤40), description (≤30) — **unique per ad**.
4. Saves to `./creatives/YYYY-MM-DD/{creative_id}.mp4|png` + `{creative_id}.json` and appends to `creatives.csv` (`creative_id, persona, angle, module, format, file, headline`).

Target: 100+ distinct assets per cycle, weighted toward the personas the transcript mining flagged as most common.

---

## 6. Upload — paused drafts, broad targeting

Implements playbook §5. The repo already has the uploader: `src/fb-ads/fb-ads-draft.ts` (`npm run fb-ads-draft -- --adset <id> --creatives <dir> --link <url>`), with `fb-api-client.ts` wrapping the Marketing API. Reuse it; extend it to read `creatives.csv` for per-ad copy and to keep `creative_id` in the ad name.

**Campaign structure:**

```
CAMP 01 | Andromeda | Sales objective, conversion event Lead → qualified_demo
  AS 01 | Broad - PD           Advantage+ audience ON, no interests, no lookalike, no age/gender narrowing
  AS 02 | Broad - Enrollments  same
  AS 03 | Broad - Coaching     same
  AS 04 | Broad - Referrals    same
  (one ad set per module so the landing page and conversion value stay coherent; ads within it span all personas)

CAMP 02 | Retargeting | Sales, Lead
  AS 05 | Site visitors 180d + demo-page abandoners, minus converters

CAMP 03 | ABM | Reach, 2 imp / 7 days
  AS 06 | Customer-list upload from the cold-email list (06), timed ahead of each wave
```

**Exclusions on every ad set — the one targeting input that still matters:** `EXCL_InstalledBase` (365d `installed_base` event), `EXCL_Customers` (customer-list upload of every contact at a current account), `EXCL_Employees`, `EXCL_Converted_365` (on CAMP 01 and 03). Without these the algorithm's cheapest "conversions" are existing users visiting the login page.

**Settings:** Advantage+ placements ON (let it run); daily budgets at ad-set level; every new ad enters PAUSED and is reviewed before activation; Advantage+ creative enhancements OFF at first (they rewrite headlines and break the one-headline-per-ad rule) — revisit after 30 days.

**Do not:** use Instant Forms (a lead form bypasses the site, skips `fbclid` capture and the agency-type question, and produces exactly the low-quality `Lead` events that poison the baseline). Traffic lands on the module page with the `/demo` form.

---

## 7. Management agent — daily

Implements playbook §6 as `fb-manage-daily` (`07` §4.10). Reads `fb_ads_*` from the warehouse joined to `creatives.csv` on `creative_id`.

```
TARGET_CPL          = $150     (Lead)             — launch target
TARGET_CPQD         = $500     (qualified_demo)   — the number that matters
MAX_DAILY_INCREASE  = 30% account-wide
```

| Rule | Condition | Action |
|---|---|---|
| Kill | spend > 2 × TARGET_CPL and 0 `Lead` in 7 days | Pause ad |
| Kill | ≥ 3 `Lead` and 0 `qualified_demo` in 30 days at > 3 × TARGET_CPQD | Pause ad — it finds form-fillers, not buyers |
| Scale | CPL ≤ TARGET_CPL over 7 days with ≥ 3 leads | Ad-set budget +20% (respecting the 30% daily cap) |
| Rotate | frequency > 3.0 / 7d, or CTR down 40% from week-1 | Flag creative for replacement in the next batch |
| Flip | `qualified_demo` ≥ 25 in 30 days on an ad set | Change optimization event to `qualified_demo` |
| Aggregate | always | CPL and CPQD by persona and by angle; top 2 of each |
| Brief | always | Writes next week's `matrix.json` weights — double the winning persona × angle cells, drop the bottom quartile |
| Report | always | Slack: spend, blended CPL/CPQD, killed, scaled, winning persona/angle, token days remaining |

The agent never raises total daily spend more than 30% in a day. The failure mode it exists to prevent is 10×-ing a creative that looked good for two hours.

---

## 8. Budget

| Period | Monthly | What |
|---|---|---|
| Sept 2026 | $0 | Pixel + CAPI, EMQ ≥ 6, personas, first 100 creatives as paused drafts |
| Oct 2026 | $1,500 | CAMP 01 live at $50/day; retargeting on. Learning |
| Nov–Dec 2026 | $3,000 | Full creative rotation; ABM layer ahead of email waves |
| **Jan–Apr 2027** | **$4,500** | Evaluation window; scale whatever holds CPQD ≤ $500 |
| May–Jun 2027 | $2,500 | Taper |
| Jul–Aug 2027 | $1,500 | Retargeting + summer-PD creative only |

~$33,000/year. Kill criterion: **if CPQD is above $1,500 for two consecutive months after the optimization event has flipped to `qualified_demo`, cut to retargeting only and revisit the creative, not the targeting.**

---

## 9. Measurement

- Primary: **cost per qualified demo**, from CRM-confirmed `qualified_demo` events, 7-day click. Report 7-day-click / 1-day-view alongside; the gap is Meta's over-claim.
- Secondary: leads by persona × angle (the only view that tells you what to make more of); EMQ; frequency; share of `Lead` events from `.k12`/`.org`/`.gov` email domains (a proxy for "found the right people" that is available on day one, before any demo is qualified).
- Holdout: keep 20% of the cold-email list out of `CL_ABM_All` so the ABM layer's lift on reply rate is measurable.
- Cross-check against GA4 first-touch in the warehouse; where Meta's self-reported conversions exceed GA4's Meta-attributed number by > 2×, trust GA4.

---

## 10. Build checklist

```
[ ] BM, domain verification, pixel via GTM
[ ] CAPI live; Lead deduped; qualified_demo and closed_won firing from HubSpot stage changes
[ ] EMQ ≥ 6 on Lead
[ ] /demo captures fbclid, agency type, module, phone; fbclid lands in HubSpot
[ ] Exclusion audiences built and verified on every ad set
[ ] matrix.json — 6 personas × 8 angles; transcript-validated hooks where transcripts exist
[ ] fb-creative-factory-weekly producing ≥ 100 tagged assets per run
[ ] fb-ads-draft upload extended for per-ad copy + creative_id in ad name; 100 paused drafts reviewed
[ ] CAMP 01 live, broad, Advantage+, $50/day, optimization = Lead
[ ] fb-manage-daily running: kill / scale / flip / brief / Slack, 30% cap enforced
[ ] Token-expiry alert at day 50
```
