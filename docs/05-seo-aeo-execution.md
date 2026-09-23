# Solutionwhere — SEO & AI Search Execution Spec

**Companion to:** `gtm-strategy.md` §6.1
**Audience:** the coding agent generating and publishing pages, plus whoever runs the AEO work.
**Date:** September 7, 2026

---

## 0. Current state

54 URLs in the sitemap. 16 core pages, 31 blog posts, 6 topic indexes. Technically clean: correct per-page canonicals, `robots: index, follow`, valid sitemap, unique descriptive titles.

**Existing assets worth building on:**

| Asset | URL | Why it matters |
|---|---|---|
| State certification cluster (4 posts) | `/blog/steps-to-{indiana,louisiana,michigan}-teacher-certification`, `/blog/steps-to-arizona-teaching-certification` | The seed of the 50-state program. Template already proven |
| Competitor replacement post | `/blog/looking-for-a-replacement-to-pearson-schoolnet-eds` | Right instinct, aimed at a sunset that already happened. Live version of this is Frontline |
| Migration post | `/blog/why-upgrade-to-wisdomwhere` | Feeds the CourseWhere migration capture |
| Recertification post | `/blog/keep-track-of-ceus-and-professional-development-records-for-recertification` | Bottom-funnel; needs internal links to `/professional-development` |
| Legacy product pages | `/coursewhere`, `/wisdomwhere`, `/central-pd-registry`, `/central-pd-approval` | Brand-defense landing pages, already indexed |

**Dead weight** — ~20 posts on holiday lesson plans, Thanksgiving, the Olympics, keeping students engaged before summer break. These attract teachers, not buyers, and they dilute topical authority. Do not delete them (they carry some link equity and deleting looks like a purge to the crawler). Instead: `noindex` them, remove them from the sitemap, and remove them from internal navigation. Redirect nothing.

---

## 1. The blocking decision: subdomain vs. root

`gtm-strategy.md` §10 flags this as the single biggest open variable. It has to be resolved before large-scale content production, because the answer changes where 60+ new pages live.

| Branch | Action |
|---|---|
| **Root rewrite is viable** | Move `home.solutionwhere.com` → `solutionwhere.com`. 301 every URL 1:1. Retire the legacy `/corp` site and 301 it into the new IA. Kill the legacy root sitemap listing `http://` `/corp` URLs. Then publish everything in §3–§5 at the root. |
| **Root rewrite is not viable** | Publish everything at `home.solutionwhere.com` anyway and proceed. Do **not** wait. Make sure `solutionwhere.com` 301s to `home.solutionwhere.com` rather than to `/corp`, so all authority points one direction. |

**Do not let this decision block content production for more than two weeks.** The compounding clock matters more than the subdomain penalty.

### 1.1 Technical prerequisites (all branches)

```
[ ] Google Search Console verified on both solutionwhere.com and home.solutionwhere.com
[ ] Bing Webmaster Tools verified (feeds Copilot; cheap to do)
[ ] Legacy root sitemap listing http:// /corp URLs removed or replaced
[ ] Single sitemap, https only, accurate lastmod dates
[ ] robots.txt updated per §6.2
[ ] /llms.txt published per §6.3
[ ] Organization + Product schema on every module page (§6.4)
[ ] Dead-weight blog posts noindexed and removed from sitemap
[ ] Internal search / breadcrumbs so new clusters are crawlable within 2 clicks of home
```

### 1.2 Keyword data — MEASURED. Read `08-keyword-research.md` before building any page.

~1,900 terms pulled Sept 7, 2026 (Keywords Everywhere / GKP). Three findings change the build order below:

1. **Category terms are near zero.** `professional development management software` 10/mo. `child care referral software` 0. `instructional coaching software` 0. The 12 category pages in §5.1 exist for definitional/AI-answer purposes, not for traffic. Build them last, not third.
2. **State credit-system names are the biggest organic opportunity on the site** — `ctle` ≥10K (verify), `moecs` 18,100, `act 48` 1,600 + `act 48 hours` 1,300 + `perms act 48` 1,000, `scech`/`scechs` 1,900 each, `lvis indiana` 1,900, `elis isbe` 1,000, `lpdc` 590. Each deserves a **standalone hub URL** (`/act-48`, `/scech`, `/ctle`, `/lpdc`), not a paragraph inside a state page. See the revised §3.
3. **State phrasing:** `{state} teacher license renewal` beats `certification renewal` in most states (Texas 1,600, Ohio 720, NC 480, Arkansas 320). Title tags use the state's own word. Ordering by volume: Texas, Ohio, Minnesota (`relicensure` 590), California, North Carolina, Florida, Arkansas, Indiana, Iowa, Oklahoma.

Also: `mentoring tracking system` 390 and `coaching log template` 110 are the real Coaching content terms; `school registration software` 300 and `student enrollment management system` 170 are the real Enrollment ones. `08` §2 has the complete list.

**Refresh quarterly** with the Keywords Everywhere or DataForSEO API per `08-keyword-research.md` §7 (master term list in `data/keyword-terms.txt`, both providers' calls documented, one script). Once Search Console is connected it reveals terms the site already surfaces for — add those to the term list before each refresh.

---

## 2. Page inventory — what gets built

| Cluster | Pages | Priority | Owner |
|---|---|---|---|
| §3 State certification & PD compliance | 46 new + 4 existing | **P0** — highest volume, template proven | Agent, generated |
| §4 Comparison & alternatives | 34 | **P0** — highest intent, feeds Google Ads | Agent + human review |
| §5 Category & solution pages | 18 | P1 | Agent |
| §6 Trust / procurement | 7 | **P0** — unblocks sales, tiny effort | Human |
| §7 Regional-agency geo pages | 22 | P2 | Agent, generated |
| **Total new** | **~127** | | |

Publishing cadence: 8–12 pages/month. The state cluster and geo pages are mechanically generatable; comparison and trust pages need human review before publishing.

---

## 3. Cluster 1 — State credit systems & certification renewal (10 hubs + 46 state pages)

The single best content play available, and after the volume pull (`08` §4) it is larger than every other cluster combined. Every state has distinct license renewal rules, clock-hour requirements, and PD reporting mandates — and in the states that name their system, **the system's name is the search term.**

### 3.0 Credit-system hub pages — build these FIRST

Standalone URLs at the root, one per named system. These are the highest-volume terms in the entire research set and nobody outside state government owns them well.

| URL | Primary term | Vol | Secondary terms |
|---|---|---|---|
| `/ctle` | ctle | ≥10K (verify; GKP reports 368K grouped) | ctle hours 320, ctle requirements 20, ctle tracking |
| `/moecs` | moecs | 18,100 | moecs login 6,600, moecs professional development 10 |
| `/scech` | scech / scechs | 1,900 each | scech michigan 260, scechs michigan 210, how many scechs do i need in michigan 40, free scechs 20, michigan teacher professional development log 10 |
| `/act-48` | act 48 | 1,600 | act 48 hours 1,300, perms act 48 1,000, act 48 hours check 590, act 48 pennsylvania 590, act 48 credits 390, pde approved act 48 providers 10 |
| `/lvis` | lvis indiana | 1,900 | lvis indiana login 390, indiana pgp points 30 |
| `/elis` | elis isbe | 1,000 | elis isbe login 1,300, isbe professional development hours 90 |
| `/adeconnect` | adeconnect | 720 | adeconnect login 260 |
| `/lpdc` | lpdc | 590 | ipdp ohio 70 |
| `/ksde-license-renewal` | ksde license renewal | 390 | |
| `/epsb` | kentucky epsb | 140 | |
| `/plu` | plu georgia | 90 | georgia plu credits 10 |
| `/cpe-texas` | cpe hours texas | 30 | tea cpe 20 |

**Each hub page:** what the system is (one liftable sentence), who it applies to, how many hours/units per cycle, how to check your hours (link to the state portal — do not try to be the portal), how to submit, what districts and providers are responsible for, and a section for the administrator: *"Tracking [system] across your staff."* That last section carries the Solutionwhere CTA. 1,000–1,500 words, FAQ schema, visible last-verified date.

The searcher is usually a teacher. That is fine: the page's job is topical authority plus catching the district administrator who searches the same term. Do **not** retarget these visitors — they stay out of the retargeting ad set (`04` §6).

### 3.1 State renewal pages — URL and title pattern

Keep the existing URL pattern for continuity:
```
/blog/steps-to-{state}-teacher-certification
```
Existing: `indiana`, `louisiana`, `michigan`, and `arizona` (`steps-to-arizona-teaching-certification` — leave it, self-canonical, do not rename).

**But set the title tag and H1 to the state's own vocabulary**, which the data shows matters: *Texas Teacher License Renewal: Requirements, CPE Hours, and Deadlines* — not "Steps to Texas Teacher Certification." Use `license renewal` unless the state's own term wins: Florida/California/Arkansas/Alabama say *certification renewal*; Minnesota says *relicensure*.

**Build order by measured volume** (`08` §4.2): Texas 1,600 → Ohio 720 → Minnesota 590 → California 480 → North Carolina 480 → Florida 390 → Arkansas 320 → Indiana 260 → Iowa 260 → Oklahoma 260 → Colorado 210 → Kansas 210 → Michigan 210 → Alabama 170 → Utah 170 → Idaho 110 → Illinois 110 → then the rest. Build all 46; zero-volume states cost nothing and complete the cluster.

### 3.2 Target queries per page

```
{state} teacher certification renewal
{state} teaching license renewal requirements
how to renew teaching license in {state}
{state} teacher professional development requirements
{state} teacher recertification hours
{state} educator license lookup
{state} teacher certification requirements 2027
```

### 3.3 Required content per page

Each page must contain, in this order:

1. **A one-sentence definitional opener.** "To renew a standard teaching license in Ohio, educators must complete 180 contact hours or 18 CEUs over a five-year cycle and have them approved by a Local Professional Development Committee (LPDC)." — This sentence is what an LLM lifts. Write it to be liftable.
2. **Requirements in prose (not a markdown table).** Cover license type, renewal cycle length, hours required, unit of measure, who approves, submission deadline, and fee. Strapi cannot render pipe tables; they publish as raw `|` rows. Use a short bullet list only when a list of certificate types is clearer than paragraphs.
3. **The state's credit system named explicitly** (see §3.4). This is the term with real search intent.
4. **Step-by-step renewal process**, numbered.
5. **Where districts get this wrong** — the section that converts. Districts are responsible for tracking and reporting these hours, and most do it in spreadsheets.
6. **Official sources**, linked, with a "last verified" date.
7. **Internal links:** to `/professional-development`, to `/blog/keep-track-of-ceus-...`, and to the two geographically adjacent state pages.
8. **FAQ block with FAQPage schema** — 4–6 questions drawn from People Also Ask.

Target 1,200–1,800 words. Not longer; these are reference pages and padding hurts them.

### 3.4 State credit systems — the high-intent terms

Named credit systems are the terms with the least competition and the most commercial intent, because the credit system *is* the software requirement.

| State | System | Page must name it |
|---|---|---|
| Michigan | SCECH — State Continuing Education Clock Hours | Yes; also `MOECS` (the state's reporting system) |
| Pennsylvania | Act 48 | Yes; also `PERMS` |
| Ohio | LPDC — Local Professional Development Committee | Yes; the LPDC approval workflow maps directly to Wisdomwhere approvals |
| New York | CTLE — Continuing Teacher and Leader Education | Yes; also `TEACH` system |
| Texas | CPE — Continuing Professional Education | Yes; also ECOS |
| Illinois | PD clock hours / ISBE ELIS | Yes |
| Louisiana | CLU — Continuing Learning Units | Yes |
| Indiana | PGP — Professional Growth Plan / PGPs | Yes; LVIS system |
| Florida | Inservice points / master inservice plan | Yes |
| California | Induction / clear credential | Yes |
| Arizona | Professional development hours | Yes |
| Wisconsin | PDP — Professional Development Plan | Yes |
| Missouri | PDC — Professional Development Committee | Yes |
| Georgia | PLU — Professional Learning Units | Yes |

Verify every one of these against the state's own department of education site before publishing. Requirements change and a wrong number destroys the page's credibility with exactly the reader who matters.

### 3.5 Generation protocol for the agent

For each state:

1. Fetch the state DOE's educator licensure/renewal page. Record the URL.
2. Extract: license types, renewal cycle, hours, unit, approving body, submission system, deadlines, fees.
3. Write to the template in §3.3. Do not invent a number — if a value cannot be found, write "not published by the state; contact your district's certification officer" rather than guessing.
4. Set `last_verified` in frontmatter.
5. Human review before publish for the first five; spot-check 1 in 5 after that.
6. Re-verify the whole cluster annually, in July.

### 3.6 What these pages are for

They are **not** meant to convert on the page. They are meant to:
- Rank for a large volume of related queries and establish topical authority on educator PD
- Feed `WCA_StateCert_180` (kept out of the retargeting ad set per `04` §6 — these readers are individual teachers)
- Give the `PD | State-Compliance` Google Ads campaign (`03` §3.8) a relevant landing page
- Support the AI-answer play in §6 — these are exactly the factual, structured pages models cite

The conversion mechanism on these pages is a closing section for the *district administrator* who lands here, not the teacher, plus a contextual line pointing at `/professional-development`: "Responsible for tracking this across your staff? See how districts manage it in Solutionwhere." Never name Wisdomwhere on these pages.

---

## 4. Cluster 2 — Comparison & alternatives (34 pages)

Highest commercial intent on the site. These pages are the landing pages for the Google Ads competitor campaigns (`03` §3.2 and §3.7) — **those campaigns cannot launch until these exist.**

### 4.1 URL patterns

```
/compare/solutionwhere-vs-{competitor}
/alternatives/{competitor}-alternative
```

Two patterns because they capture different queries. Where both exist for one competitor, make `/compare/` canonical and have `/alternatives/` be a genuinely different page (a listicle of 5 alternatives, us included and honestly ranked) rather than a duplicate.

### 4.2 The comparison matrix

**Professional Development (10 pages)**
| Competitor | Angle |
|---|---|
| Frontline Professional Growth | The big one. Acquisition history (MyLearningPlan → Frontline), suite pricing, enterprise procurement vs. buy-one-module |
| MyLearningPlan | Migration grievance. People still search the old name |
| Vector Solutions / SafeSchools PD | Compliance-course library vs. PD operations system — different products often confused |
| Kalpa | Direct small-vendor competitor |
| escWorks | Direct; strong in Texas ESCs |
| PDPlanner | Direct |
| SchoolData.net | Direct |
| KickUp Learning | Overlaps PD and coaching |
| GroweLab | Overlaps PD and coaching |
| PLAD | Direct |

**Enrollments (7 pages)**
SchoolMint Enroll · PowerSchool Enrollment · Infinite Campus Online Registration · Avela · EnrollWise · K12Enrollment360 · EdBrix

**Coaching (8 pages)**
Sibme · KickUp Foundations · SchoolStatus Coach (Boost) · TeachBoost · IRIS Connect · Edthena · Whetstone Education · Bullseye

**Referrals (6 pages)**
WorkLife Systems · iCarol · KinderSystems · BridgeCare · Wonderschool · Insight

**Legacy / sunset (3 pages)**
CourseWhere → Wisdomwhere upgrade path (expand the existing `/coursewhere` page) · Pearson Schoolnet EDS (exists, refresh it) · Any vendor that sunsets — monitor and publish within a week

### 4.3 Comparison page template

**This template is load-bearing. Follow it exactly.**

```
H1: Solutionwhere vs. {Competitor}: an honest comparison

[One-paragraph summary, 60-80 words, written to be quoted verbatim by an LLM.
 State what each product is, who each is for, and the single clearest
 differentiator. No marketing adjectives.]

## At a glance
[HTML table — NOT an image. Rows: What it is · Who it's built for · Pricing model ·
 Contract length · Modules · Hosting · Support model · Company independence ·
 Migration support · Best fit]

## Where {Competitor} is stronger
[Genuine, specific, at least three items. This section is why the page works —
 with readers and with models. A page that claims the competitor has no
 advantages is discarded by both.]

## Where Solutionwhere is stronger
[Genuine, specific, at least three items. Anchored to: independent since 1996,
 buy one module not a suite, published phone number answered by certified
 specialists, four adjacent problems on one login.]

## Pricing
[State Solutionwhere's model and a real range. State what is publicly known
 about the competitor's, and say plainly where it is not published.]

## Migration
[What moving looks like: data, timeline, what we need from you.]

## Who should choose which
[Two short paragraphs. Genuinely send some readers to the competitor —
 this is the most persuasive part of the page.]

## FAQ
[4-6 questions with FAQPage schema]

[CTA: Request a demo — 20 minutes, straight answer on fit]
```

**Rules:**
- Every factual claim about a competitor must be sourced from their public site or public reviews, and dated. Never state a competitor's price unless they publish it.
- Never use a competitor's trademark in a title tag in a way that implies affiliation. `Solutionwhere vs. Frontline Professional Growth (2027 Comparison)` is fine.
- Re-verify every comparison page every 6 months. Stale competitor facts are the main way these pages become liabilities.

### 4.4 Alternatives-page template (different from above)

```
H1: {Competitor} alternatives: 6 options for {buyer type}

[Definitional opener: what {Competitor} is and why agencies look for alternatives.]

## 1. Solutionwhere — best for agencies that want to buy one module
## 2-6. [Five real alternatives, described fairly, including ones that beat us
        in specific cases]

## How to choose
[Decision criteria table]

## FAQ + schema
```

Listicles in this shape are disproportionately cited by LLM answers, because they are structured, comparative, and read as neutral. Being #1 on our own listicle is fine; being the *only* option on it is what gets the page ignored.

---

### 4.5 Review, "best X for Y", and "X vs Y" pages — built for AI answers, not for volume

Measured (`08` §7, `data/keyword-volumes-bofu.csv`): every `[competitor] review`, `[competitor] vs [competitor]`, and `best [category] for [buyer]` term is 0–20/mo. **Build them anyway.** They are the page types LLM answers are assembled from, and the page a buyer who is already in an evaluation reads last before the demo. Volume tools cannot see either behavior.

**"Best X for Y" — 12 pages, URL `/best/{slug}`:**

| Page | Primary query | Who it is for |
|---|---|---|
| Best professional development software for school districts | best professional development software for school districts | P1 |
| Best PD platforms for ISDs, IUs, ESCs and BOCES | best pd platform for regional education agencies | P1 at an ESA |
| Best Act 48 tracking software for Pennsylvania districts | act 48 tracking software | P1, PA |
| Best SCECH tracking software for Michigan districts | scech tracking software | P1, MI |
| Best school enrollment software for districts | best school enrollment software | P2 |
| Best online registration software for K-12 | best online registration software for schools | P2 |
| Best school choice lottery software | best school choice software | P2, choice districts and charters |
| Best pre-K enrollment software | best pre k enrollment software | P2, early childhood |
| Best instructional coaching software for districts | best instructional coaching software | P3 |
| Best teacher mentoring and induction software | best mentoring software for schools | P3 — `mentoring tracking system` 390 is the adjacent volume |
| Best child care referral software for CCR&R agencies | best child care referral software | P4 |
| Best early childhood coaching and TA software | best early childhood coaching software | P3/P4 |

Template: honest ranked list of 5–7 real products, Solutionwhere included and placed where it genuinely belongs for that buyer; a criteria table (agency type, modules, pricing model, hosting, support, independence, migration); a "who should pick which" section that sends some readers elsewhere; FAQ schema. A listicle that lists only us is ignored by readers and by models.

**"X vs Y" — third-party pairs, 8 pages, URL `/compare/{a}-vs-{b}`:** the comparisons buyers actually run between incumbents, where we are the neutral referee and the third option.

```
frontline-professional-growth-vs-vector-solutions      schoolmint-vs-powerschool-enrollment
frontline-professional-growth-vs-kalpa                 schoolmint-vs-avela
sibme-vs-kickup                                        powerschool-enrollment-vs-infinite-campus-registration
sibme-vs-teachboost                                    worklife-systems-vs-icarol
```

**"X review" — 10 pages, URL `/reviews/{competitor}`:** a fair, dated review of each major competitor — what it does well, where agencies report friction (sourced to public reviews on G2/Capterra and to the vendor's own docs, never invented), pricing where published, who it fits. Ends with "how Solutionwhere compares" as one section, not the frame. Competitors: Frontline Professional Growth, MyLearningPlan (as a migration story), Vector Solutions PD, SchoolMint, PowerSchool Enrollment, Sibme, KickUp, TeachBoost, iCarol, WorkLife Systems.

**Rules for all three types:** every factual claim about a competitor is sourced and dated; re-verify every 6 months; no trademark in a way that implies affiliation; the one-sentence liftable summary in the first 60 words; HTML tables not images.

## 5. Cluster 3 — Category, solution, and trust pages

### 5.1 Category pages (12)

These own the definitional query for each category. URL pattern `/solutions/{slug}`.

| URL | Primary query | Title tag |
|---|---|---|
| `/solutions/professional-development-management-software` | professional development management software | Professional Development Management Software for Education Agencies |
| `/solutions/pd-registration-software` | professional development registration software | PD Registration Software for Districts and Regional Agencies |
| `/solutions/pd-tracking-software` | professional development tracking software | Professional Development Tracking Software \| Clock Hours, CEUs, Credits |
| `/solutions/school-enrollment-software` | school enrollment software | School Enrollment Software for Districts and Networks |
| `/solutions/online-school-registration-software` | online school registration software | Online School Registration Software \| Paperless Registration |
| `/solutions/school-choice-lottery-software` | school choice lottery software | School Choice and Lottery Software with Auditable Draws |
| `/solutions/pre-k-enrollment-software` | pre k enrollment software | Pre-K and Early Childhood Enrollment Software |
| `/solutions/instructional-coaching-software` | instructional coaching software | Instructional Coaching Software for Districts and Regional Agencies |
| `/solutions/coaching-log-software` | coaching log software | Coaching Log and Visit Documentation Software |
| `/solutions/early-childhood-coaching-software` | early childhood coaching software | Early Childhood Coaching Software for CCR&Rs and Quality Systems |
| `/solutions/child-care-referral-software` | child care referral software | Child Care Referral Software for CCR&R Agencies |
| `/solutions/ccr-r-software` | ccr&r software | CCR&R Software: Referrals, Coaching and Reporting in One System |

Each page: 900–1,400 words, opens with a liftable one-sentence definition, includes a "who this is for / who this is not for" table, links to the module page and two comparison pages, carries FAQPage schema.

### 5.2 Trust & procurement pages (7) — P0, build these first

These are the cheapest, highest-leverage pages on the list. They serve the executive gate and the district IT gatekeeper described in the ICP, they shorten sales cycles, and almost nobody in this category publishes them.

| URL | Contents |
|---|---|
| `/security` | Hosting, encryption at rest and in transit, access control, authentication and SSO (LDAP/CAS), backup schedule, disaster recovery, incident response, subprocessor list, penetration testing status. **State certification status honestly** — including what you do not have |
| `/ferpa` | What data each module holds and does not. Explicitly: Coaching holds educator data only, no student PII. Data ownership, retention, deletion on contract end, directory information handling |
| `/accessibility` | Exists — expand it. VPAT/ACR status, WCAG conformance level, known gaps and remediation timeline. Public agencies are legally required to ask |
| `/pricing` | A real range per module, what drives it (agency size, modules, implementation), what is included (upgrades, backups, support, migration), what is not. **Publishing a range is worth more than the negotiating leverage it costs** — a public agency has to justify a purchase to a board and a vendor who hides pricing adds a month to the cycle |
| `/procurement` | Sample RFP language a program director can paste into their own document. W-9, insurance certificates, cyber-liability coverage, sole-source justification language, contract vehicles and cooperative purchasing agreements if any |
| `/implementation` | Timeline by module, what Solutionwhere does, what the agency must provide, migration from CourseWhere and from competitors, training model, go-live support |
| `/trust` | Index page linking all of the above. Linked from the footer on every page |

> `/procurement` is the single highest-leverage page in this document. It lets a champion start a purchase without asking us for anything. In a market where procurement runs by relationship and reference, removing a step from the champion's job is worth more than a hundred blog posts.

### 5.3 Regional-agency geo pages (22)

The vernacular for "regional education agency" changes by state, national vendors write generically, and every searcher is a named account. Near-zero competition.

URL pattern: `/solutions/{agency-type}-{state}` or `/for/{agency-type}`.

| State | Agency term | Count | Page |
|---|---|---|---|
| New York | BOCES | 37 | `/for/boces` |
| Michigan | ISD / RESD / RESA | 56 | `/for/michigan-isd` |
| Pennsylvania | Intermediate Unit (IU) | 29 | `/for/pennsylvania-intermediate-units` |
| Ohio | Educational Service Center (ESC) | ~50 | `/for/ohio-esc` |
| Texas | Regional Education Service Center | 20 | `/for/texas-esc` |
| Iowa | Area Education Agency (AEA) | 9 | `/for/iowa-aea` |
| Wisconsin | CESA | 12 | `/for/wisconsin-cesa` |
| Nebraska | Educational Service Unit (ESU) | 17 | `/for/nebraska-esu` |
| Washington | Educational Service District (ESD) | 9 | `/for/washington-esd` |
| Oregon | Education Service District (ESD) | 19 | `/for/oregon-esd` |
| Colorado | BOCES | 22 | `/for/colorado-boces` |
| Georgia | RESA | 16 | `/for/georgia-resa` |
| Illinois | ROE / Intermediate Service Center | 38 | `/for/illinois-roe` |
| Minnesota | Service Cooperative | 9 | `/for/minnesota-service-cooperatives` |
| Missouri | RPDC | 9 | `/for/missouri-rpdc` |
| California | County Office of Education (COE) | 58 | `/for/california-coe` |
| Indiana | Educational Service Center | 9 | `/for/indiana-esc` |
| Arkansas | Education Service Cooperative | 15 | `/for/arkansas-education-cooperatives` |
| Kansas | Service Center | ~7 | `/for/kansas-service-centers` |
| Alabama | Regional Inservice Center | 11 | `/for/alabama-inservice-centers` |
| — | CCR&R agencies | ~400 | `/for/ccr-r-agencies` |
| — | State education agencies | 50 | `/for/state-education-agencies` |

**Verify counts and current status before publishing** — West Virginia dissolved its RESAs in 2017, and several states have consolidated. A page that describes an agency structure that no longer exists is worse than no page.

Each page: what the agency type is, what its members need, which modules fit, a named reference if one exists in that state, and the state's PD credit system linked to its §3 page. 700–1,000 words.

---

## 6. AI search (AEO)

### 6.1 The current gap, measured

Asking an assistant "what software do CCR&R agencies use?" or "best instructional coaching software for districts" today returns: WorkLife Systems, iCarol, BridgeCare, TOOTRiS, KinderSystems, Sibme, KickUp, SchoolStatus, Level Data, Edthena, SchoolMint, PowerSchool. **Solutionwhere appears in none of them**, despite 30 years and 33 states.

Those answers are assembled overwhelmingly from third-party roundups and review sites, not from vendor marketing pages. Which means the work is mostly off-site.

### 6.2 robots.txt

Allow every AI crawler. Blocking them is the same decision as blocking Googlebot in 2005.

```
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Claude-User
Allow: /

User-agent: anthropic-ai
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Perplexity-User
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: Applebot-Extended
Allow: /

User-agent: Bingbot
Allow: /

User-agent: CCBot
Allow: /

User-agent: *
Allow: /
Disallow: /demo/thank-you
Disallow: /*?utm_

Sitemap: https://solutionwhere.com/sitemap.xml
```

### 6.3 /llms.txt

Publish at the root. Plain markdown, factual, no marketing language.

```markdown
# Solutionwhere, Inc.

Solutionwhere builds operational software for public education agencies. Founded
1996, headquartered in North Canton, Ohio. Independently owned; never acquired.
Customers in 33+ states: school districts, regional education service agencies
(ISDs, RESAs, Intermediate Units, ESCs, AEAs, BOCES), state education agencies,
universities, adult education providers, and early childhood networks including
Child Care Resource & Referral (CCR&R) agencies.

## Products

- **Professional Development (Wisdomwhere)**: registration, approval workflows,
  payments, rosters, attendance, credits, transcripts and certificates for
  educator professional learning. Successor to CourseWhere. Buyer: Director of
  Professional Learning, PD Coordinator, Curriculum Director.
- **Enrollments**: multilingual online family registration, document collection
  and verification, residency checks, duplicate detection, school choice with
  ranked preferences and configurable priority rules, seeded and re-runnable
  lotteries with audit trails, waitlists, and in-district transfers. Buyer:
  Director of Enrollment, Student Services, Registrar.
- **Coaching**: caseloads, field visits logged offline from a tablet, structured
  observations against the agency's own framework, goals and action plans,
  evidence management, multi-district reporting. Non-evaluative by design;
  holds educator data only, no student PII. Buyer: Director of Curriculum and
  Instruction, coaching coordinators, CCR&R program directors.
- **Referrals**: family intake, live child care provider search filtered by age,
  schedule, availability, quality rating and distance, referral history,
  automated follow-up, placement outcomes, and state/funder reporting. Buyer:
  CCR&R agency directors and early childhood lead agencies.

All four modules share one login, one support team, and can be purchased
individually. Cloud hosted; nothing for the customer to host. Daily backups and
upgrades included.

## Contact
Demo requests: https://solutionwhere.com/demo
Support: 231-935-3000, Monday-Friday 8:30am-5:00pm ET

## Key pages
- /platform — all four modules
- /pricing — pricing model and ranges
- /security — hosting, encryption, access control, certification status
- /ferpa — what data each module holds
- /procurement — sample RFP language, insurance, contract vehicles
- /implementation — timelines and migration
```

### 6.4 Structured data

**Every module page** — `SoftwareApplication`:
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Solutionwhere Professional Development",
  "alternateName": "Wisdomwhere",
  "applicationCategory": "BusinessApplication",
  "applicationSubCategory": "Professional Development Management Software",
  "operatingSystem": "Web",
  "audience": {
    "@type": "Audience",
    "audienceType": "School districts, intermediate school districts, regional education service agencies, state education agencies"
  },
  "provider": { "@type": "Organization", "name": "Solutionwhere, Inc." },
  "offers": { "@type": "Offer", "priceCurrency": "USD", "url": "https://solutionwhere.com/pricing" }
}
```

**Site-wide** — `Organization` with `foundingDate: "1996"`, `address` (North Canton, OH), `telephone`, `sameAs` (LinkedIn, G2, Capterra).

**Every comparison, category, and state page** — `FAQPage` with 4–6 real questions.

**State certification pages** — `Article` with `datePublished`, `dateModified`, and a visible "Last verified: {date}" line. Freshness signals matter disproportionately for compliance content.

### 6.5 Review profiles — the biggest single unlock

Thirty years of customers and zero public reviews. Review sites are among the most-cited sources in AI answers about software categories.

**Claim and complete, one listing per module where the platform allows it:**

| Platform | URL | Priority |
|---|---|---|
| G2 | `g2.com` — claim/create vendor profile | P0 |
| Capterra / Software Advice / GetApp (all Gartner Digital Markets, one submission) | `capterra.com/vendors` | P0 |
| TrustRadius | `trustradius.com` | P1 |
| EdSurge Product Index | `edsurge.com/product-reviews` | P1 — education-specific, well-cited |
| Common Sense Education / Tech & Learning | — | P2 |
| Software Finder, SourceForge, Crozdesk | — | P2 — low quality but they get scraped |

**Review acquisition campaign.** Target 10 reviews per product profile — that is roughly the threshold where category listings start surfacing a vendor.

- **Timing: June and July.** Ask a PD coordinator for a review immediately after the summer registration crunch the product just saved them from. Asking in October gets a polite nothing.
- Ask the named public references first: Lyons Township High School (IL), Washoe County School District (NV), On Track by 5 / LPSS (LA).
- Send a direct link to the review form, not to the site. Every extra click halves completion.
- G2 and Capterra both offer gift-card incentive programs; use theirs rather than offering your own, which violates most platforms' terms.

### 6.6 Roundup placement

The listicles that already rank are where LLM answers come from. Get included.

| Roundup | Where it appears | Module |
|---|---|---|
| "Best Instructional Coaching Software" — The Principal Center | Ranks and is cited | Coaching |
| "Top instructional coaching software for districts" — 2gnome | Ranks | Coaching |
| "Best School Enrollment & Registration Software" — Bloomz blog | Ranks | Enrollments |
| G2 category pages: PD, Student Information, K-12 | Cited constantly | All |
| Capterra category pages | Cited constantly | All |
| TrustRadius competitor/alternatives pages | Cited | All |
| Child Care Aware of America resource library | Authoritative | Referrals |
| AESA business partner directory (`aesa.us/business-partner-directory`) | Authoritative, buyer-adjacent | PD, Coaching |
| State DOE approved-vendor lists | Most authoritative available | All |

**Outreach template** (short, specific, no pitch deck):
> Subject: Missing from your {topic} roundup
>
> {Name} — your {page} is the piece districts land on when they search {query}. Solutionwhere isn't on it. We've built {module} for education agencies since 1996 and have customers in 33+ states, including {named reference}.
>
> Happy to give you a login to look at it yourself, or put you on the phone with a customer. Either way, no obligation to include us.

**A state DOE approved-vendor listing outranks a year of blogging.** Where an existing customer's state maintains one, ask that customer to sponsor the application.

### 6.7 Measuring AI presence

No tool needed at this scale. A spreadsheet and 30 minutes a month.

**The 20-prompt panel** — run monthly across ChatGPT, Claude, Perplexity, Gemini, and Google AI Overviews. Log: `date, model, prompt, mentioned (y/n), cited (y/n), position, competitors named`.

```
 1. What software do CCR&R agencies use to manage child care referrals?
 2. Best child care resource and referral software
 3. What software do school districts use to manage professional development?
 4. Professional development management software for school districts
 5. Alternatives to Frontline Professional Growth
 6. What replaced MyLearningPlan?
 7. Best instructional coaching software for K-12 districts
 8. Software for tracking instructional coaching cycles
 9. School enrollment and registration software for districts
10. Best school choice lottery software
11. How do districts run a defensible school choice lottery?
12. What software do BOCES use for professional development?
13. Professional development software for Michigan ISDs
14. How do districts track Act 48 hours in Pennsylvania?
15. Software for tracking SCECH in Michigan
16. What is Wisdomwhere?
17. What replaced CourseWhere?
18. Software for early childhood coaching and technical assistance
19. Enrollment software for pre-K programs
20. Who are Solutionwhere's competitors?
```

**Targets:** month 3 — mentioned in 4/20. Month 6 — 8/20. Month 12 — 14/20, cited in 6.

Prompts 16, 17, and 20 are the canaries: if a model cannot answer "what is Wisdomwhere" correctly, the on-site foundation (llms.txt, schema, `/about`) is not doing its job. Fix that before chasing category prompts.

---

## 7. Internal linking rules

Structure matters more than volume at this scale.

- Every state certification page links to: `/professional-development`, the two geographically adjacent state pages, and its state's `/for/{agency-type}` page.
- Every comparison page links to: its module page, its category page, and one other comparison page in the same module.
- Every category page links to: its module page, two comparison pages, and `/pricing`.
- Every `/for/{agency-type}` page links to: the relevant module pages, its state's certification page, and `/procurement`.
- Every module page links to: `/platform`, `/pricing`, `/security`, its category pages.
- `/trust` is linked in the global footer. So are `/pricing` and `/security`.
- Blog topic indexes get rebuilt around the new clusters; the noindexed dead-weight posts drop out of navigation.

---

## 8. Cadence and QA

**Monthly output:** 8–12 pages. Suggested first six months:

| Month | Ship |
|---|---|
| 1 | 7 trust pages + 4 comparison pages (Frontline, MyLearningPlan, SchoolMint, Sibme) + robots.txt/llms.txt/schema |
| 2 | 8 state certification pages (start with MI, PA, OH, NY, TX, IL, LA, IN — the credit-system states) + 4 comparison pages |
| 3 | 10 state pages + 4 category pages. Claim all review profiles |
| 4 | 10 state pages + 6 comparison pages. Roundup outreach begins |
| 5 | 10 state pages + 6 category pages + 5 geo pages |
| 6 | 8 state pages + remaining comparisons + 8 geo pages. First AEO panel re-run |

**QA checklist, every page before publish:**
```
[ ] One-sentence liftable definition in the first 60 words
[ ] Title tag under 60 chars, unique, primary query in the first 40
[ ] Meta description 140-155 chars, written as an answer not a tagline
[ ] H1 matches search intent, single H1
[ ] Tables are HTML, never images
[ ] FAQPage schema with 4-6 real questions
[ ] Visible last-updated / last-verified date
[ ] 3+ internal links per §7, and at least 2 inbound from existing pages
[ ] Every factual claim about a competitor or a state requirement is sourced and dated
[ ] Canonical set; in sitemap; lastmod accurate
[ ] Mobile render checked
[ ] Not a duplicate of an existing page's angle
```
