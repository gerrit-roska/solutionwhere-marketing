# Solutionwhere — Google Ads Execution Spec

**Companion to:** `gtm-strategy.md` §6.3, `01-conversion-tracking-spec.md`
**Audience:** the engineer/agent building the account. Everything needed to build is in this file.
**Date:** September 7, 2026

---

## 0. Read this first

**Hard gate:** do not spend a dollar until conversion tracking from `01-conversion-tracking-spec.md` is live on `home.solutionwhere.com` and `demo_request` has fired at least once in GA4. The prior agency spent ~$500/mo with no tracking and produced nothing measurable. Repeating that is the only way to fail at this.

**Economics that govern every decision below.** ACV $20K–$100K on three-year contracts. Allowable CAC $5,000–$25,000. Target ~5–6 qualified demos/month from all channels combined. Therefore:

- A $200 click that produces a qualified demo is a good click.
- A $2 click from an adjacent consumer-education search is a bad click at any price.
- **Never optimize toward cost per lead.** The target metric is cost per *qualified* demo, and anything under $500 is strong.
- Total searchable volume in these categories is a few hundred searches/month nationally. This account cannot absorb large spend. Do not raise budget to "scale" — there is nothing to scale into.

**Match type policy: exact and phrase only. Broad match is banned account-wide**, including broad-match-with-smart-bidding. The adjacent market (parents, daycare owners, teachers looking for free PD, job seekers) is enormous and Google will spend the entire budget there given permission. This is the single most likely explanation for the prior agency's results.

---

## 1. Prerequisites checklist

| # | Item | Detail | Blocks |
|---|---|---|---|
| 1 | GA4 property live on `home.solutionwhere.com` | Per `01-conversion-tracking-spec.md` | Everything |
| 2 | GA4 ↔ Google Ads linked | Admin → Product links → Google Ads links | Conversion import |
| 3 | Conversion actions created | §5 below | Campaign launch |
| 4 | Google Ads account created + Graphed access granted | Standard access minimum | Everything |
| 5 | Billing set with a monthly spend cap | Prevents runaway | Launch |
| 6 | Call tracking number provisioned | §5.3 | Call conversions |
| 7 | Keyword Planner access | Comes with the Ads account; needed for §3 volume pass | Bid setting |
| 8 | Auto-tagging ON, `gclid` preserved through the demo form | Settings → Account settings → Auto-tagging | Attribution |
| 9 | Customer list uploaded for exclusion | The 30+ existing PD customers — see §6.4 | Waste prevention |
| 10 | No WCAG or SOC 2 claim, and no named customer, in RSA copy, sitelinks, or callouts | `validatePlan()` blocks these before any upload | Launch |

### 1.1 Measured volumes — READ `08-keyword-research.md` BEFORE BUILDING

Volumes were pulled on Sept 7, 2026 (Keywords Everywhere / Google Keyword Planner data). **267 of the 331 keywords in this document have zero monthly searches.** The category vocabulary below is how vendors describe the product, not how buyers search. Keep the zero-volume exact-match terms — they cost nothing and catch the rare query — but understand what the account will actually do:

| What has volume | Where | Change to this spec |
|---|---|---|
| Competitor **bare brand names** (`schoolmint` 22,200; `mylearningplan` 14,800; `frontline professional growth` 1,000; `sibme` 2,400; `escworks` 4,400) | §3.2, §3.7 | Every `[X alternative]` term is zero. Conquest bids on the **bare brand** with login-intent negatives — see §3.2 rewrite |
| Enrollment terms (`school registration software` 300 @ $11.52; `student enrollment management system` 170; `enrollment management system` 50 @ $20.79) | §3.4 | Add these; they are the only category terms with real traffic |
| `mentoring tracking system` 390 @ $6.88; `walkthrough app` 90 @ $14.94 | §3.5 | Add |
| State credit systems (`act 48` 1,600; `scech` 1,900; `ctle` ≥10K; `lpdc` 590) and `{state} teacher license renewal` (Texas 1,600, Ohio 720) | §3.8 | Real volume but teacher-heavy. Cap spend; it is a retargeting feeder |
| **Referrals / CCR&R software terms** | §3.6 | **All zero. Do not launch this campaign.** Referrals is sold by cold email only |

**Budget is cut from ~$28K/yr to ~$13K/yr** (§6.3). The category cannot absorb more.

Ambiguous brand terms — `kickup`, `kalpa`, `avela`, `coaching tracker` — need a SERP check before any bid; their volume is mostly the common-word meaning.

**Re-run quarterly with the Keywords Everywhere or DataForSEO API** — exact calls, the master term list, and the script are in `08-keyword-research.md` §7. Use whichever key exists (`KEYWORDS_EVERYWHERE_API_KEY`, or `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`). Once the Ads account exists, Keyword Planner adds ungrouped figures and top-of-page bid ranges on top; save that export as `data/keyword-planner-baseline.csv` and set max CPCs from its low range.

---

## 2. Account skeleton

### Naming convention

```
[Module] | [Intent] | [Match] | [Geo]
```

Examples: `PD | Category | EX | US`, `ENR | Competitor | EX | US`, `BRAND | Defense | EX | US`

Ad groups: `[Theme] - [Match]` → `pd-management-software - EX`

### Campaign list

| # | Campaign | Type | Intent tier | Launch phase | Monthly budget (steady state) |
|---|---|---|---|---|---|
| 1 | `BRAND \| Defense \| EX \| US` | Search | Defensive | **Phase 1 — day one** | $150 |
| 2 | `PD \| Competitor \| EX \| US` | Search | Highest | Phase 1 | $250 |
| 3 | `PD \| Category \| EX-PH \| US` | Search | Low volume | Phase 3 | $100 |
| 4 | `ENR \| Category \| EX-PH \| US` | Search | **Only category campaign with real volume** | Phase 2 | $400 |
| 5 | `CCH \| Category \| EX-PH \| US` | Search | Low volume | Phase 3 | $150 |
| 6 | `REF \| Category \| EX-PH \| US` | Search | **Zero volume — built, paused** | Never | $0 |
| 7 | `MULTI \| Competitor \| EX \| US` | Search | Highest | Phase 3 | $300 |
| 8 | `PD \| State-Compliance \| EX-PH \| US` | Search | High volume, teacher-heavy | Phase 4 | $150 |

Budgets are peak-month (Jan–Apr) figures totaling ~$1,500; see §6.3 for the full-year curve. Revised down after measurement — `08-keyword-research.md` §5.

**Campaign types that are banned:** Performance Max, Demand Gen, Display, Video, Smart campaigns, Discovery. No exceptions. PMax in particular will route spend to Display inventory reaching parents searching for daycare, and its reporting will hide that from you.

---

## 3. Campaigns, ad groups, keywords

Notation: `[keyword]` = exact match. `"keyword"` = phrase match. Starting max CPC in the right column — **replace with Keyword Planner low-range bids per §1.1 before launch.**

### 3.1 Campaign 1 — `BRAND | Defense | EX | US`

Non-negotiable and always on. Protects an installed base that Frontline and PowerSchool can bid against, and captures the CourseWhere migration intent that nobody else can serve.

**Ad group: `brand-core - EX`** — max CPC $3.00
```
[solutionwhere]
[solution where]
[solutionwhere inc]
[solutionwhere software]
[solutionwhere login]
[solutionwhere support]
[solutionware]            ← the common misspelling; see gtm-strategy §0
[solution ware software]
```

**Ad group: `wisdomwhere - EX`** — max CPC $3.00
```
[wisdomwhere]
[wisdom where]
[wisdomwhere login]
[wisdomwhere professional development]
[wisdomwhere software]
[wisdomwhere training]
[wisdomwhere pricing]
```
> Route `[wisdomwhere login]` to `/support`, not `/professional-development`. Login-seekers are existing users; see §6.4 on excluding them from all audience building.

**Ad group: `coursewhere - EX`** — max CPC $4.00
```
[coursewhere]
[course where software]
[coursewhere login]
[coursewhere alternative]
[coursewhere replacement]
[coursewhere upgrade]
[coursewhere to wisdomwhere]
[coursewhere end of life]
[coursewhere support]
```
> This is the highest-value ad group in the brand campaign. Every searcher is either a current user or an agency deciding what to do about an aging system. Landing page: `/coursewhere` (exists) — it must carry an explicit "upgrade path" CTA. See `05-seo-aeo-execution.md` §4.2.

**Ad group: `legacy-products - EX`** — max CPC $3.00
```
[central pd registry]
[central pd approval]
[great school jobs]
[pearson schoolnet eds replacement]
[schoolnet eds alternative]
```

### 3.2 Campaign 2 — `PD | Competitor | EX | US`

Highest-intent traffic available. Landing page is always the matching comparison page from `05-seo-aeo-execution.md` §4.1 — never the generic module page. **Do not launch this campaign until the comparison pages are live.**

**Measured (see `08`):** every `[X alternative]` / `[X competitors]` term below is **zero volume**. The volume is on the bare brand — `mylearningplan` 14,800, `frontline professional growth` 1,000, `escworks` 4,400 — and most of it is end users logging in. So the campaign works like this:

1. Add the **bare brand as exact match** to each ad group: `[mylearningplan]`, `[frontline professional growth]`, `[frontline education professional growth]`, `[escworks]`, `[kalpa professional development]`, `[vector solutions education]`. Keep the "alternative" terms; they cost nothing.
2. Apply the **`NEG - Login Intent`** shared list (§4.6) at the campaign level. It strips the teacher-login majority.
3. Max CPC **$1.50–$3.00** on bare brands — not the $10–12 originally set. After negatives, expect single-digit clicks per day per competitor.
4. Ad copy self-selects the buyer: *"For district administrators comparing PD platforms."* Low CTR is expected and correct.
5. **Do not bid on bare `vector solutions`** (40,500/mo, multi-vertical safety training) or bare `kickup` / `kalpa` (common words). Use the qualified variants only.

**Ad group: `frontline - EX`** — max CPC $12.00
```
[frontline professional growth alternative]
[frontline education alternative]
[frontline pd alternative]
[frontline professional growth competitors]
[frontline professional growth pricing]
[alternative to frontline education]
[frontline professional growth reviews]
```

**Ad group: `mylearningplan - EX`** — max CPC $10.00
```
[mylearningplan alternative]
[mylearningplan replacement]
[my learning plan alternative]
[mylearningplan competitors]
[mylearningplan frontline migration]
```

**Ad group: `vector-solutions - EX`** — max CPC $10.00
```
[vector solutions pd alternative]
[vector solutions professional development alternative]
[safeschools alternative]
[vector solutions competitors education]
```

**Ad group: `pd-other - EX`** — max CPC $9.00
```
[kalpa alternative]
[kalpa professional development alternative]
[escworks alternative]
[pdplanner alternative]
[schooldata.net alternative]
[kickup learning alternative]
[growelab alternative]
[plad alternative]
```

**Ad copy rule for all competitor ad groups:** competitor trademarks may be **bid on** but must **never appear in ad headlines or descriptions** — Google will disapprove the ad and the trademark holder can file a complaint. Write around it: *"Independent since 1996"*, *"Not owned by a private equity roll-up"*, *"Buy one module, not a suite."*

### 3.3 Campaign 3 — `PD | Category | EX-PH | US`

**Ad group: `pd-management-software - EX-PH`** — max CPC $14.00
```
[professional development management software]
[professional development software for schools]
[professional development software for school districts]
[professional learning management system]
[pd management software]
[educator professional development software]
[teacher professional development software]
"professional development management system"
"professional development platform for districts"
```

**Ad group: `pd-registration - EX-PH`** — max CPC $12.00
```
[professional development registration software]
[pd registration system for schools]
[training registration software for schools]
[workshop registration software for school districts]
[course registration software for districts]
[education conference registration software]
[pd catalog software]
"registration software for professional development"
"online pd registration system"
```

**Ad group: `pd-tracking-credits - EX-PH`** — max CPC $11.00
```
[professional development tracking software]
[teacher pd tracking system]
[ceu tracking software for schools]
[clock hour tracking software teachers]
[professional development record keeping software]
[educator credential tracking software]
[teacher recertification tracking software]
"track professional development hours software"
```

**Ad group: `pd-agency-type - EX-PH`** — max CPC $10.00
```
[professional development software for isd]
[professional development software for boces]
[professional development software for intermediate unit]
[training management software for educational service center]
[pd software for regional education agency]
[professional development software for state education agency]
[professional development software for esc]
[professional development software for aea]
```
> These terms are low volume and near-zero competition, and every searcher is a named account. Keep them even if Planner reports 0 volume.

### 3.4 Campaign 4 — `ENR | Category | EX-PH | US`

**Ad group: `enrollment-software - EX-PH`** — max CPC $22.00
```
[school enrollment software]
[student enrollment software for districts]
[online enrollment software for schools]
[district enrollment management system]
[k-12 enrollment software]
"enrollment software for school districts"
"online enrollment system for schools"
```

**Ad group: `online-registration - EX-PH`** — max CPC $12.00
Measured (`08` §2): `school registration software` **300/mo @ $11.52** — the single highest-volume category term in the account. `online student registration` 50 @ $5.18, `student registration system` 30, `k 12 online registration` 20 @ $8.30.
```
[school registration software]                 ← 300/mo, lead term
[online student registration]
[online student registration software]
[student registration system]
[school registration system]
[k 12 online registration]
[online school registration system]
[back to school registration software]
[student registration software for school districts]
"online registration for school districts"
"paperless school registration"
```

**Ad group: `enrollment-management - EX-PH`** — max CPC $16.00
Measured: `student enrollment management system` 170 @ $4.66, `enrollment management system` 50 @ $20.79, `student enrollment software` 40. Negatives `university`, `college`, `admissions crm` matter here — the term overlaps higher-ed.
```
[student enrollment management system]
[enrollment management system]
[student enrollment software]
[online enrollment management system]
[school enrollment management software]
```

**Ad group: `school-choice-lottery - EX-PH`** — max CPC $10.00
Measured: `school choice lottery` 90 @ $3.71 (bare, no "software"), `magnet lottery` 30, `school lottery software` 10 @ $3.48, `charter school lottery software` 10. Everything with "software" appended is ≤10 — bid the bare terms.
```
[school choice lottery]
[magnet lottery]
[charter school lottery software]
[school choice software]
[school lottery software]
[student lottery software]
[magnet school application software]
[open enrollment software for districts]
[school choice application system]
[weighted lottery software schools]
"school choice lottery platform"
```
> Highest-CPC ad group in the account and worth it — SchoolMint and PowerSchool both bid here, and the audit trail / re-runnable seeded lottery is a genuine product differentiator. Landing page: `/enrollments`, with the lottery-audit section anchored.

**Ad group: `early-childhood-enrollment - EX-PH`** — max CPC $16.00
```
[pre k enrollment software]
[preschool enrollment software for districts]
[early childhood enrollment system]
[kindergarten registration software]
[pre k application system]
[early childhood registration software]
"pre-k enrollment platform"
```

**Ad group: `enrollment-ops - EX-PH`** — max CPC $18.00
```
[student residency verification software]
[school enrollment waitlist software]
[in district transfer software schools]
[enrollment document verification software]
[sibling preference enrollment software]
```

### 3.5 Campaign 5 — `CCH | Category | EX-PH | US`

**Ad group: `instructional-coaching - EX-PH`** — max CPC $16.00
```
[instructional coaching software]
[instructional coaching platform]
[instructional coaching software for districts]
[teacher coaching software]
[coaching software for schools]
"instructional coaching management software"
"software for instructional coaches"
```

**Ad group: `coaching-documentation - EX-PH`** — max CPC $13.00
```
[coaching log software]
[instructional coaching tracking software]
[coaching cycle tracking software]
[coaching caseload management software]
[teacher observation and coaching software]
[coaching documentation system schools]
"log coaching visits software"
```

**Ad group: `mentoring-induction - EX-PH`** — max CPC $7.00
Measured: `mentoring tracking system` **390/mo @ $6.88** — the highest-volume Coaching term by far, and teacher induction/mentoring is a Coaching use case the product page does not yet mention. Add a section to `/coaching` for it before launching.
```
[mentoring tracking system]
[mentor tracking software]
[teacher mentoring software]
[teacher induction software]
[new teacher mentoring program software]
```

**Ad group: `walkthroughs - EX-PH`** — max CPC $14.00
Measured: `walkthrough app` 90 @ $14.94. `coaching log template` 110 and `instructional coaching log` 20 are content terms — send to a template download page, not `/coaching`.
```
[walkthrough app]
[classroom walkthrough software]
[walkthrough observation app for schools]
[classroom observation software non evaluative]
[instructional rounds software]
```

**Ad group: `early-childhood-coaching - EX-PH`** — max CPC $11.00
```
[early childhood coaching software]
[child care coaching software]
[technical assistance tracking software]
[qris coaching software]
[early childhood technical assistance software]
[child care quality improvement software]
[coaching software for ccr&r]
"coaching software for early childhood programs"
```
> This ad group serves the wedge described in the ICP doc (CCR&R coaching). Volume will be tiny. Keep it — the LPSS-shape deal is ~$30K implementation plus $10K+/yr and unlocks a state.

### 3.6 Campaign 6 — `REF | Category | EX-PH | US` — DO NOT LAUNCH

**Measured (`08` §2): every term in this campaign is zero.** `child care referral software` 0, `ccr&r software` 0, `child care resource and referral software` 0. The only related volume is the agency type itself (`ccr r` 170) and consumer intent (`childcare referral service` 40). Referrals is sold through cold email and the CCR&R relationship (`06` §2.3). Keep the campaign built and paused so the structure exists if a term ever appears in Search Console.

**Ad group: `child-care-referral - EX-PH`** — max CPC $10.00
```
[child care referral software]
[child care resource and referral software]
[ccr&r software]
[ccrr software]
[child care referral tracking system]
[child care referral management software]
"software for child care resource and referral agencies"
```

**Ad group: `referral-ops - EX-PH`** — max CPC $9.00
```
[child care provider database software]
[child care intake software]
[family child care referral system]
[child care search software for agencies]
[child care supply and demand data software]
[child care referral reporting software]
```

> **Critical:** this campaign sits closest to the enormous consumer market. Apply the `NEG - Consumer/Parent` and `NEG - Provider Ops` shared lists (§4) at the campaign level *and* verify search terms twice weekly for the first month.

### 3.7 Campaign 7 — `MULTI | Competitor | EX | US`

Same rules as §3.2 — exact match only, comparison-page landing, no trademarks in copy. Launch only when the matching comparison page is live.

**Ad group: `enr-competitors - EX`** — max CPC $18.00
```
[schoolmint alternative]
[schoolmint competitors]
[powerschool enrollment alternative]
[powerschool registration alternative]
[infinite campus online registration alternative]
[avela alternative]
[final forms alternative]
[registration gateway alternative]
[enrollwise alternative]
[edbrix alternative]
```

**Ad group: `cch-competitors - EX`** — max CPC $14.00
```
[sibme alternative]
[kickup alternative]
[kickup foundations alternative]
[teachboost alternative]
[schoolstatus boost alternative]
[schoolstatus coach alternative]
[edthena alternative]
[iris connect alternative]
[whetstone education alternative]
[bullseye evaluation alternative]
```

**Ad group: `ref-competitors - EX`** — max CPC $10.00
```
[worklife systems alternative]
[icarol alternative]
[kindersystems alternative]
[bridgecare alternative]
[tootris alternative]
[wonderschool alternative]
[insight child care software alternative]
```

### 3.7.1 Bottom-of-funnel — what else exists (measured)

~170 additional BOFU terms were pulled on Sept 7 (`data/keyword-volumes-bofu.csv`): `[category] pricing / cost / demo / vendors / rfp / quote / comparison`, `[competitor] review / reviews / vs / competitors / pricing`, `best [category] for [districts | k12 | charter | esc | boces]`, `[category] for districts / k12`, `switch from / replace / migrate from [competitor]`, and the early-childhood/QRIS set.

**Result: one term with volume — `teacher observation tool` 110/mo @ $2.80.** Everything else is 0–20. The commercial long tail in this category does not exist as measurable search demand; buyers arrive via the competitor's name, the state credit system, or a colleague.

What to do with that:

**Ad group: `observation-tools - EX-PH`** (add to Campaign 5, CCH) — max CPC $4.00
```
[teacher observation tool]
[classroom observation tool]
[walkthrough tool for administrators]
"teacher observation tool"
```
> Careful: observation ≠ evaluation. Copy leads with "non-evaluative" and the landing page is `/coaching`. Add `evaluation`, `rubric`, `danielson`, `marzano` as ad-group negatives.

**Modifier phrase-match catch-alls** — one ad group per module, phrase match, low bid ($3.00), so the rare long-tail query that Planner rounds to zero still matches:
```
"for school districts"        → paired with each module's head term as phrase: "pd software for school districts", etc.
"for k12" / "k-12"
"for charter schools"
"for esc" / "for boces" / "for isd" / "for intermediate unit"
"pricing" / "cost" / "demo" / "vendors" / "rfp"   → as phrase on each module head term
```
These will show near-zero impressions. That is fine. They are the net; Search Console and the Search Terms report will reveal what real queries look like within 60 days, and those get promoted to exact.

**The `[competitor] review/vs/pricing` terms:** all ≤ 20/mo. Keep them as exact match in the conquest ad groups (§3.2, §3.7); they cost nothing. The pages that answer them (`05` §4.5) matter for AI answers and for the buyer who is already in an evaluation, not for search volume.

### 3.8 Campaign 8 — `PD | State-Compliance | EX-PH | US`

The bridge between paid and the 50-state SEO program (`05-seo-aeo-execution.md` §3). Every keyword here points at a state certification page, not a product page — these searchers are early and the page's job is to capture them into retargeting and the newsletter, not to close.

Launch with the four states where content already exists (Indiana, Louisiana, Arizona, Michigan), then add one ad group per state as pages ship.

**Ad group template: `{state}-recert - EX-PH`** — max CPC $4.00
```
[{state} teacher certification renewal]
[{state} teacher license renewal requirements]
[{state} professional development requirements teachers]
[how to renew teaching license in {state}]
"{state} teacher recertification hours"
```

**State-specific credit systems** — these are the high-value terms because the credit system *is* the software requirement:

| State | System | Keywords |
|---|---|---|
| Michigan | SCECH | `[scech tracking software]`, `[scech reporting requirements]`, `[how to submit scech]` |
| Pennsylvania | Act 48 | `[act 48 tracking software]`, `[act 48 reporting for districts]`, `[act 48 hours tracking]` |
| Texas | CPE | `[cpe tracking software teachers]`, `[texas cpe hours tracking]` |
| Ohio | LPDC | `[lpdc tracking software]`, `[local professional development committee software]` |
| New York | CTLE | `[ctle tracking software]`, `[ctle hours reporting]` |
| Illinois | PD clock hours | `[illinois pd clock hours tracking]`, `[isbe professional development reporting]` |

> LPDC and CTLE in particular are terms almost nobody outside this niche bids on, and they identify a district administrator with an exact compliance problem Wisdomwhere solves.

---

## 4. Negative keywords — build these as shared lists first

Create five shared lists under Tools → Shared library → Negative keyword lists, then apply as specified. **Do this before any campaign goes live.**

### 4.1 `NEG - Consumer/Parent` — apply to ALL campaigns
```
daycare
day care
daycare near me
child care near me
preschool near me
find child care
child care assistance
child care subsidy application
child care voucher
babysitter
nanny
after school program
summer camp
tuition
parent portal
parent app
enroll my child
how to enroll
school district boundaries
school ratings
best schools
kindergarten age
immunization requirements
```

### 4.2 `NEG - Job Seeker` — apply to ALL campaigns
```
jobs
job
careers
career
hiring
salary
pay scale
resume
employment
vacancy
openings
substitute teacher
how to become
degree
certification cost
online course
online courses
class
classes
free training
free pd
free professional development
webinar
conference 2026
```

### 4.3 `NEG - Wrong Product` — apply to ALL campaigns
```
lms
learning management system
canvas
schoology
google classroom
blackboard
moodle
payroll
hr software
applicant tracking
substitute management
sub finder
gradebook
report card software
student information system
sis
attendance software
transportation software
food service software
cafeteria
iep software
special education software
crm
erp
accounting
billing software
point of sale
church
gym
fitness
```
> `student information system` and `sis` are negatives on purpose. Solutionwhere is not an SIS and traffic looking for one converts at zero.

### 4.4 `NEG - Provider Ops` — apply to REF, CCH, and PD campaigns
```
brightwheel
procare
lillio
himama
kangarootime
playground
tadpoles
childcare crm
daycare management software
daycare billing
child care center software
preschool management software
family child care software
child care app for parents
child care licensing application
how to open a daycare
child care business plan
```
> These are center-management tools for the people our customers *serve*, not for our customers. Every one of these clicks is waste.

### 4.5 `NEG - Higher Ed & Corporate` — apply to ALL campaigns
```
university
college
higher education
campus
student affairs
admissions crm
enrollment marketing
corporate training
employee training
compliance training
onboarding software
osha
hipaa training
association management
```

### 4.6 `NEG - Login Intent` — apply to BOTH competitor campaigns and PD State-Compliance
Measured: `frontline education login` 33,100, `moecs login` 6,600, `icarol login` 2,400, `kickup login` 1,300, `sibme login` 720, `my learning plan login` 720, `escworks login` 480, `teachboost login` 480. This list is what makes competitor conquest affordable.
```
login
log in
logon
sign in
signin
sign up
password
reset password
forgot password
app
download
install
support
help
help desk
customer service
phone number
contact
tutorial
how to use
training video
central login
admin login          ← keep [schoolmint admin] as a positive; negate the login phrase only
```

### 4.7 Ongoing negative process

- **Weeks 1–4:** review the Search Terms report **every Monday and Thursday.** Add negatives at the campaign or shared-list level. Expect 30–60 additions per session in week one.
- **Weeks 5–12:** weekly, Monday.
- **Steady state:** biweekly.
- **Rule:** any search term that produced a click and is not plausibly from a district, regional agency, CCR&R, or state education agency gets negated at the shared-list level the same day.
- Log every addition to `clients/solutionwhere/data/negative-keyword-log.csv` with columns `date,term,list,campaign,cost_wasted`.

---

## 5. Conversion actions

### 5.1 Actions to create

| Name | Source | Category | Count | Value | Primary? |
|---|---|---|---|---|---|
| `demo_request` | GA4 import | Submit lead form | One | $500 | **Yes** |
| `demo_booked` | GA4 import (calendar confirm) | Book appointment | One | $1,000 | **Yes** |
| `phone_call_60s` | Google forwarding number | Phone call lead | One | $500 | **Yes** |
| `qualified_demo` | Offline import from CRM | Qualified lead | One | $3,000 | **Yes** |
| `opportunity_created` | Offline import from CRM | Converted lead | One | $10,000 | No — observe |
| `pricing_page_view` | GA4 import | Page view | One | $0 | No — observe |
| `comparison_page_view` | GA4 import | Page view | One | $0 | No — observe |
| `support_or_login_click` | GA4 import | Other | One | $0 | **No — and exclude from all bidding** |

Values are proxies for ranking traffic quality, not revenue forecasts. They exist so that if smart bidding is ever enabled it optimizes toward the right event.

### 5.2 Offline conversion import — do not skip this

Sales cycles run months and close at $20K–$100K. A form fill is not the outcome. Without offline import, the account will optimize toward whatever produces cheap form fills, which in this market means the wrong traffic.

**Mechanism:** Google Ads → Tools → Conversions → Uploads, weekly CSV, or the Google Ads API.

Required plumbing on Solutionwhere's side (task for Benjamin's coding agent):
1. Capture `gclid` from the URL on landing, persist to a first-party cookie (`sw_gclid`, 90-day expiry).
2. Add a hidden `gclid` field to the `/demo` form; submit it with the lead.
3. Store `gclid` on the CRM contact/deal record.
4. When an AE marks a demo `Qualified` or a deal `Opportunity`, emit a row to the weekly upload file:
   `Google Click ID, Conversion Name, Conversion Time, Conversion Value, Conversion Currency`
5. Upload weekly, Monday.

### 5.3 Call tracking

The phone number is on every page and this buyer segment calls. Without call conversions the account will look like it is failing.

- Enable **Google forwarding numbers** at the account level.
- Add a **Call asset** to every campaign, scheduled 8:30am–5:00pm ET, Monday–Friday (matches published support hours).
- Count calls **≥ 60 seconds** as `phone_call_60s`.
- Add call-only ads to the BRAND and REF campaigns for mobile only.
- Have whoever answers ask "how did you find us?" and log it. At this volume, manual attribution is more reliable than any model.

---

## 6. Campaign settings

### 6.1 Settings that apply to every campaign

| Setting | Value | Why |
|---|---|---|
| Networks | **Search only.** Uncheck Search Partners. Uncheck Display Network. | Partners and Display are where the budget goes to die in this vertical |
| Bidding | **Manual CPC** (enhanced off) at launch | Volume will never support smart bidding learning. Revisit only if a single campaign holds 30+ conversions in 30 days |
| Locations | United States, plus Puerto Rico if CCR&R expansion is in scope | — |
| Location option | **Presence** — "People in or regularly in your targeted locations" | The default (presence *or interest*) serves ads to anyone worldwide researching US schools |
| Languages | English | — |
| Ad rotation | Optimize | — |
| Ad schedule | Mon–Fri 6:00am–6:00pm ET | Public-sector buyers do not evaluate software at 11pm. Cuts ~20% of wasted spend |
| Dynamic Search Ads | **Off** | Will generate ads against blog posts about Thanksgiving lesson plans |
| Auto-applied recommendations | **All OFF** | Google will add broad match and PMax on your behalf. Turn every one of these off at the account level |
| Final URL expansion | **Off** | Same reason |
| Audience targeting | **Observation**, never Targeting | Audiences here are for reporting and bid adjustment only |

### 6.2 Geographic bid modifiers

Layer on top of nationwide targeting. Rationale: existing installed base and the wedge states from the ICP doc.

| Location | Modifier | Why |
|---|---|---|
| Michigan | +35% | PD installed base — ISDs/RESAs. Cross-sell territory |
| Pennsylvania | +35% | PD installed base — Intermediate Units |
| Louisiana | +40% | Active CCR&R wedge; live reference (On Track by 5 / LPSS) |
| Illinois | +30% | 16 state-funded SDAs under INCCRRA; existing reference (Lyons Township HS) |
| Ohio | +20% | Home state; 50+ ESCs |
| New York | +15% | 37 BOCES, high PD budget |
| Texas | +15% | 20 regional ESCs, each large |
| Nevada | +10% | Existing reference (Washoe County SD) |

### 6.3 Budget pacing across the year — revised against measured volume

Spend tracks the district evaluation window (Jan–Apr), per `gtm-strategy.md` §7. Do not spend flat. **Revised down from $28K to ~$13K/year after the volume pull in `08-keyword-research.md` §5** — the category cannot absorb more, and forcing it means broad match and Display, which is how the last agency lost the money.

| Period | Monthly | Live campaigns |
|---|---|---|
| Sept 2026 | $400 | Brand + PD Competitor (bare brands, login negatives) |
| Oct 2026 | $700 | + ENR Category (the only category campaign with real volume) |
| Nov–Dec 2026 | $900 | + CCH Category, MULTI Competitor, PD Category |
| **Jan–Apr 2027** | **$1,500** | All except REF. Peak. |
| May–Jun 2027 | $900 | Taper; POs already cut |
| Jul–Aug 2027 | $400 | Brand + Competitor only |

Approx. annual media: **$13,000.** Expected: 25–35 qualified demos/year at ≤$500 each, ~5–7 logos. Paid is now explicitly the third channel; the $15K removed goes to SEO content production (`05` §3 credit-system and state clusters) and cold-email list building (`06`), which is where the measured demand actually lives.

**`REF | Category` does not launch.** Every child-care-referral software term measured zero.

### 6.4 Excluding the installed base

33+ states of existing customers use `wisdomwhere` daily and search for their login. Their clicks are pure waste, and worse, they contaminate every audience the account builds.

1. Build a GA4 audience: `Installed base` = users who fired `support_or_login_click` OR viewed `/support` OR any `wisdomwhere-updates-*` blog URL.
2. Import to Google Ads; apply as a **negative audience** on all Category and Competitor campaigns.
3. Upload the existing-customer email list as a Customer List; apply as a **negative** on the same campaigns.
4. Leave BRAND campaigns un-excluded — you *want* to catch a customer searching `wisdomwhere login` and route them to `/support` cheaply rather than let a competitor's brand-conquest ad get them.

---

## 7. Ad copy

Every responsive search ad needs 15 headlines (30 char max) and 4 descriptions (90 char max). Pin nothing except where noted. Copy below follows the positioning in `gtm-strategy.md` §5 — longevity, modularity, real humans, four problems one login. **No feature enumeration.**

### 7.1 RSA — `pd-management-software`
**Final URL:** `https://home.solutionwhere.com/professional-development`
**Path:** `/professional-development` `/districts`

Headlines:
```
1.  PD Management Software
2.  Built for Education Agencies
3.  Serving Districts Since 1996
4.  80% Less Registration Admin
5.  One System of Record for PD
6.  Registration, Credits, Reports
7.  Used in 33+ States
8.  Buy One Module, Not a Suite
9.  Reports Your State Accepts
10. A Real Person Answers the Phone
11. Independent for 30 Years
12. From Catalog to Transcript
13. Districts, ISDs, IUs and ESCs
14. See It in 20 Minutes
15. Straight Answer on Fit
```
Descriptions:
```
1. Registration, approvals, credits and transcripts in one place. Built for education agencies.
2. Thirty years serving districts and regional agencies. No acquisitions, no forced migrations.
3. Buy the module you need now. Add enrollment or coaching later, on the same login.
4. Twenty-minute demo focused on your reporting requirements. We'll tell you if we're not a fit.
```

### 7.2 RSA — `pd-registration`
**Final URL:** `/professional-development`

Headlines:
```
1.  PD Registration Software
2.  End the Registration Backlog
3.  80% Less Admin Time
4.  Self-Service Registration
5.  Waitlists That Manage Themselves
6.  Approvals Routed Automatically
7.  PO, Check, Card or E-Check
8.  Built for Districts and ISDs
9.  Rosters, Sign-In, Certificates
10. Serving Agencies Since 1996
11. One Catalog, Every Audience
12. Consortium Sharing Included
13. Used in 33+ States
14. See a 20-Minute Demo
15. Nothing to Host
```
Descriptions:
```
1. Staff register themselves. Waitlists, approvals and reminders run without you touching them.
2. Rosters, attendance, certificates and transcripts generated from the registration you already took.
3. Purchase orders, checks, cards and e-checks — the payment methods public agencies actually use.
4. Cloud hosted, daily backups, upgrades included. Nothing for your IT department to run.
```

### 7.3 RSA — `pd-tracking-credits`
**Final URL:** `/professional-development`

Headlines:
```
1.  PD Tracking Software
2.  Recertification Reporting
3.  Clock Hours, CEUs, Credits
4.  Transcripts on Demand
5.  Audit-Ready PD Records
6.  Built for State Reporting
7.  SCECH, Act 48, CTLE, LPDC
8.  Every Hour, Documented
9.  Serving Districts Since 1996
10. Used in 33+ States
11. One Record Per Educator
12. No More Spreadsheets
13. Reports in Seconds
14. See It in 20 Minutes
15. Independent Since 1996
```
> Headline 7 names credit systems, not competitor trademarks — allowed and highly relevant. If the ad serves nationally, swap to "Built for Your State's Rules".

Descriptions:
```
1. One record per educator, from registration to transcript. Pull compliance reports on demand.
2. Clock hours, CEUs and state credit systems tracked the way your state requires them.
3. When the audit comes, the evidence is already assembled. No reconstructing from spreadsheets.
4. Twenty-minute demo built around your state's reporting rules. Straight answer on fit.
```

### 7.4 RSA — `enrollment-software` / `online-registration`
**Final URL:** `/enrollments`

Headlines:
```
1.  School Enrollment Software
2.  Registration Without Paper
3.  Families Register by Phone
4.  Documents Verified Digitally
5.  Residency Checks, Automated
6.  Duplicate Detection Built In
7.  Multilingual Registration
8.  Waitlists Families Can See
9.  Built for Districts and ISDs
10. Serving Agencies Since 1996
11. One Screen for Your Staff
12. Transfers Handled in System
13. Audit Trail on Every Decision
14. See a 20-Minute Demo
15. Buy One Module, Not a Suite
```
Descriptions:
```
1. Families complete registration on a phone, in their language, without coming to the office.
2. Document review, residency verification and duplicate detection stop being manual work.
3. Choice, waitlists and transfers on one screen instead of four systems and a spreadsheet.
4. Thirty years serving education agencies. Buy enrollment now, add PD or coaching later.
```

### 7.5 RSA — `school-choice-lottery`
**Final URL:** `/enrollments`

Headlines:
```
1.  School Choice Software
2.  Defensible Lottery Draws
3.  Recorded Seeds, Rerunnable
4.  Ranked Choice Applications
5.  Priority Rules You Configure
6.  Sibling Linking, Automatic
7.  Set-Asides Handled Properly
8.  Waitlists With Family Visibility
9.  Equity Reporting Included
10. Every Draw Has an Audit Trail
11. Magnet, Charter, Open Enroll
12. Built for Districts and Networks
13. Serving Agencies Since 1996
14. Explain Any Placement
15. See It in 20 Minutes
```
Descriptions:
```
1. Lottery draws with recorded seeds. Rerun any draw and get the same result — in front of a board.
2. Ranked preferences, sibling links, set-asides and priority rules configured to your policy.
3. When a family asks why they were placed where they were, the answer is already in the record.
4. Post-season reporting on demand, equity metrics and a full audit trail. No reconstruction.
```

### 7.6 RSA — `instructional-coaching` / `coaching-documentation`
**Final URL:** `/coaching`

Headlines:
```
1.  Instructional Coaching Software
2.  Coaching That Leaves a Record
3.  Caseloads, Visits, Evidence
4.  Log Visits From the Classroom
5.  Works Offline on a Tablet
6.  Your Framework, Not a Template
7.  Non-Evaluative by Design
8.  Planned vs. Delivered Visits
9.  Multi-District Reporting
10. Goals With Evidence Attached
11. Built for ISDs and Districts
12. Monitoring-Ready Evidence
13. Serving Agencies Since 1996
14. Prove the Coaching Happened
15. See a 20-Minute Demo
```
Descriptions:
```
1. Caseloads, visits, goals and evidence in one place. Documentation compiles while you coach.
2. Log a visit from the classroom on a tablet, offline. It syncs when you're back on the network.
3. Configured around your observation framework — not a generic template you have to work around.
4. Planned vs. delivered visits, site-level allocation, cohort progress. Reports without assembly.
```

### 7.7 RSA — `child-care-referral`
**Final URL:** `/referrals`

Headlines:
```
1.  Child Care Referral Software
2.  Built for CCR&R Agencies
3.  One System, Not Four Tools
4.  Match Families to Real Openings
5.  Intake, Search, Follow-Up
6.  Referral History in One Place
7.  Provider Records That Stay Current
8.  State Reports From Live Data
9.  Track Referrals to Outcome
10. Licensing and Capacity Tracked
11. Serving Agencies Since 1996
12. Subsidy, Language, Hours, Age
13. Built for Lead Agencies
14. See a 20-Minute Demo
15. Straight Answer on Fit
```
Descriptions:
```
1. Family intake, live provider search, referral history and funder reporting in one system.
2. Filter openings by age, schedule, availability, quality rating and distance while the family is on the phone.
3. Follow-up and placement outcomes recorded automatically — so the state report writes itself.
4. Built for CCR&Rs, lead agencies and early childhood networks. Twenty-minute demo, straight answer.
```

### 7.8 RSA — competitor ad groups (all)
**Final URL:** the matching comparison page.

Headlines (no trademarks):
```
1.  Compare Before You Renew
2.  Independent Since 1996
3.  Buy One Module, Not a Suite
4.  Never Been Acquired
5.  No Forced Migrations
6.  A Person Answers the Phone
7.  Honest Side-by-Side Comparison
8.  Used in 33+ States
9.  Priced for One Problem
10. See Where We're Not a Fit
11. 30 Years, Same Company
12. Migration Support Included
13. Built for Education Agencies
14. See a 20-Minute Demo
15. Straight Answer on Fit
```
Descriptions:
```
1. An honest side-by-side, including the things the other platform does better. Then decide.
2. Thirty years independent. No private equity roll-up, no acquisition, no forced platform migration.
3. Solve one problem now. Add the next module when you're ready, on the same login.
4. Certified support specialists answer a published phone number, 8:30-5:00 ET. Not a ticket queue.
```

### 7.9 Assets (extensions)

**Sitelinks** — account level, 6 minimum:
| Text | Description line 1 | Description line 2 | URL |
|---|---|---|---|
| See the Platform | Four modules, one login | Buy one, add others later | `/platform` |
| Common Questions | Pricing, security, timeline | Straight answers | `/faq` |
| Security & FERPA | What data we hold, and don't | Answers for your IT team | `/faq` (until the trust pages ship — see `05` §5) |
| Talk to Support | Certified specialists, 8:30–5 ET | A published phone number | `/support` |
| About Solutionwhere | Independent since 1996 | North Canton, Ohio | `/about` |
| Request a Demo | 20 minutes, focused on you | Straight answer on fit | `/demo` |

**Callouts** — account level:
```
Since 1996 · 33+ States · Nothing to Host · Daily Backups · Upgrades Included
Buy One Module · Real Phone Support · Migration Support · No Long Onboarding
```

**Structured snippets:**
- Header `Services`: Professional Development, Enrollments, Coaching, Referrals
- Header `Types`: School Districts, Intermediate Units, ESCs, BOCES, CCR&R Agencies, State Agencies

**Call asset:** 231-935-3000, Mon–Fri 8:30am–5:00pm ET.

**Lead form assets: do not use.** They bypass the site, break `gclid` capture, and fill with unqualified traffic.

---

## 8. Landing page requirements

Google Ads will underperform against good landing pages that are missing three things. Task for Benjamin's coding agent:

1. **Preserve the module context into `/demo`.** Link `/coaching → /demo?module=coaching` and pre-select the module picker. Without this, pipeline-by-module reporting in `gtm-strategy.md` §9 does not work.
2. **Add an instant booking path.** A calendar embed on `/demo` alongside the form. A form that produces an email reply two days later loses the buyer who was ready now. This is called out in `gtm-strategy.md` §3 as a recommendation; for paid traffic it is a requirement.
3. **Persist `gclid`** per §5.2.

Additionally, for the competitor campaigns: the comparison pages in `05-seo-aeo-execution.md` §4 must exist before those campaigns launch. Pointing conquest traffic at a generic module page wastes the most expensive clicks in the account.

---

## 9. Operating cadence

**Every Monday**
- Search terms report → negatives (twice weekly for the first month)
- Check spend pacing against the month's budget in §6.3
- Upload offline conversions (§5.2)

**Every month**
- Cost per qualified demo by campaign. Kill or cut any campaign above $1,500 for two consecutive months.
- Check the installed-base contamination rate (`support_or_login_click` share of paid sessions). If it exceeds 15%, the negative audience in §6.4 is not working.
- Review Auction Insights on the competitor campaigns — who is bidding against us and where.
- Confirm no auto-applied recommendation switched anything back on.

**Every quarter**
- Re-run the Keyword Planner pass (§1.1)
- Add new competitor ad groups for any vendor that appeared in a sales call
- Rewrite the two lowest-performing RSAs

### Kill criteria

| Condition | Action |
|---|---|
| Campaign > $1,500 cost per qualified demo, 2 months running | Pause, reallocate to Brand + Competitor |
| Ad group with 0 conversions after 100 clicks | Pause, re-examine its landing page before deleting |
| Keyword with > $400 spend and 0 conversions | Pause |
| Installed-base contamination > 15% of paid sessions | Stop Category campaigns until audience exclusion is fixed |
| Total account < 3 qualified demos in a month during Jan–Apr | Escalate — this is a landing page or offer problem, not a bidding problem |
