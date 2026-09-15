# Solutionwhere — Go-To-Market Strategy

**Prepared for:** Benjamin Waxman
**Prepared by:** Graphed (Cody Schneider, Max Chehab)
**Date:** August 24, 2026
**Status:** Draft for review
**Confidential** — covered by NDA. Not to be shared, quoted, or referenced externally.

---

## 0. A naming correction before anything else

The call transcript renders the company as "Solutionware." It is **Solutionwhere, Inc.** — *where*, not *ware*. `solutionware.com` is an unrelated parked domain listed for sale. Every asset, ad account, and tracking property should be built against **solutionwhere.com**.

---

## 1. Situation

Solutionwhere sells software to education agencies and has done so since 1996. Four modules:

| Module | What it does | Buyer |
|---|---|---|
| **Professional Development** (Wisdomwhere, formerly CourseWhere) | PD registration, rosters, payments, approvals, transcripts | Director of Professional Learning / PD Coordinator |
| **Enrollments** | Online registration, document verification, school choice lotteries, waitlists | Director of Enrollment / Student Services |
| **Coaching** | Caseloads, visits, observations, goals, evidence | Director of Curriculum & Instruction |
| **Referrals** | Matching families to child care openings, referral outcome tracking | CCR&R agency director |

Customers span 33+ states: K-12 districts, ISDs/RESAs/IUs/ESCs/AEAs/BOCES, state education agencies, universities, adult education, early childhood networks.

**Commercial shape:** ~$1M ARR. ACV $20K–$100K depending on district size. Three-year contracts. First AE hired recently. Sales motion is demo → evaluation → close.

**Current marketing:** effectively none. The India agency ran ~$500/mo Google + ~$500/mo Facebook and was shut off for the software business after poor results.

### What this shape means

Three-year contracts at $20K–$100K make the contract value of a single customer **$60K–$300K**. Even at an aggressive 25% CAC against first-year revenue only, the allowable customer acquisition cost is **$5,000–$25,000**.

That number should reframe every channel decision in this document. Solutionwhere is not a business that needs cheap leads. It is a business that needs to reach a specific, small, fully-nameable set of buyers and be present when their evaluation window opens. Optimizing for cost-per-lead here is the wrong instinct and will pull spend toward the cheapest, least qualified traffic available.

---

## 2. The strategic call: this is a named-account market, not a demand-capture market

The entire universe of US buyers is enumerable and roughly fixed:

- ~13,300 public school districts
- ~550 regional service agencies (ISDs, RESAs, IUs, ESCs, AEAs, BOCES)
- 50 state education agencies
- ~500 CCR&R agencies
- Plus adult ed and early childhood networks

Call it **~15,000 accounts**, with three to five relevant titles each. That is a list you can buy, build, and hold in a spreadsheet. It does not grow. Nobody founds a new school district.

Two consequences:

**First, broad prospecting is the wrong default.** Running open-targeted Facebook prospecting into a 15,000-account universe means paying to show ads to the 99.9% of the internet that will never buy. The four-channel template Graphed applies to most companies of this revenue shape assumes an addressable market in the millions. It does not apply cleanly here, and applying it unmodified is how the previous agency wasted budget.

**Second, the constraint is not lead volume — it's timing and coverage.** You need to be in front of ~15,000 accounts and be memorable when their evaluation window opens.

### The volume math

To add $500K net new ARR at a $40K blended ACV, Solutionwhere needs roughly **13 new logos per year**. Working backward at plausible public-sector conversion rates:

| Stage | Rate | Annual | Monthly |
|---|---|---|---|
| New logos | — | 13 | ~1 |
| Qualified demos | 20% close | 65 | 5–6 |
| Qualified leads | 25% to demo | 260 | ~22 |

**Twenty-two qualified leads a month.** That is the whole target. It is a small enough number that it can be hit through precise targeting of a known list — and it is small enough that a broad-reach paid strategy would be wildly inefficient at producing it.

---

## 3. The gate: you cannot measure anything today

`home.solutionwhere.com` currently has **no analytics or tracking of any kind** — no GA4, no Google Tag Manager, no Meta pixel, no LinkedIn insight tag. The GTM container `GTM-KVFXB4S` exists, but it is installed only on the legacy `solutionwhere.com/corp` site, which is not where traffic is being sent.

Until this is fixed, every dollar of ad spend is unattributable and every optimization decision is a guess. **No paid channel should launch before instrumentation is live.** This was flagged on the call as "a day or two of back-and-forth"; that estimate is right, but its priority is higher than the call implied — it is the gate, not a parallel task.

### What gets instrumented

The `/demo` page is a native form capturing name, organization, email, phone, role, and module interest. There is no calendar booking. So the conversion set is:

| Event | Trigger | Value |
|---|---|---|
| `demo_request` | Successful `/demo` form submit | Primary conversion — all channels optimize to this |
| `phone_click` | Click on `231-935-3000` | Secondary — significant in this segment |
| `module_page_view` | View of `/professional-development`, `/enrollments`, `/coaching`, `/referrals` | Intent signal for audience building |
| `login_click` | Click on Login | **Negative signal** — existing customers, must be excluded from all remarketing and lookalikes |

That last one is not a detail. In a business with a large installed base and a login link in the global nav, a meaningful share of site traffic is existing customers. If they are not excluded, they will pollute every audience and make paid performance look better than it is.

Graphed will supply exact implementation instructions to hand to a coding agent. The module picker on the demo form should be passed through as a conversion parameter — it tells us which module drives pipeline, which determines where budget goes in Q2.

### Recommendation: add instant booking

The form is a fine capture mechanism but it introduces a delay between intent and conversation. Adding a "book a time now" path alongside the form typically lifts demo-held rates materially. Low effort, worth doing in the same instrumentation pass.

---

## 4. The structural fix: get the marketing site onto the root domain

Right now:

- `solutionwhere.com` → redirects to `/corp` — the legacy site on Rackspace, still live, still in a sitemap listing `http://` URLs
- `home.solutionwhere.com` → the new site on Vercel — 54 pages, clean titles, correct per-page canonicals, indexable

The new site is technically well built. The problem is where it lives. Thirty years of accumulated links, citations, and brand mentions point at `solutionwhere.com`. Google treats a subdomain as a substantially separate entity for authority purposes, so **the new marketing site inherits close to none of that equity** and starts from a standing position it has not earned.

Benjamin's reason for the subdomain is sound — legacy customer hosting lives on the root DNS and must not break. But the constraint is narrower than the solution chosen. The customer application lives under paths like `solutionwhere.com/ww/<district>`. The marketing site needs the *other* paths.

**Recommendation:** serve the Vercel marketing site from the root domain via path-based rewrites, leaving `/ww/*` and other legacy application paths routed to Rackspace exactly as they are today. Nothing about existing customer hosting changes. The marketing site gains three decades of domain authority.

This is the single highest-leverage technical change in this document, and it is worth more than the first several months of ad spend. It is also the kind of change that is much cheaper to make now, before the new site has accumulated its own links, than in a year.

If it turns out to be genuinely impossible, the fallback is a full 301 map from the legacy `/corp` URLs to their `home.` equivalents — which recovers some equity but not most of it.

---

## 5. Positioning

The new site's copy is already good and should be preserved. The strongest lines in it are the ones that lean on longevity and specificity rather than on feature lists:

> "Four things education agencies do every year. One platform that does them."

> "Tell us which part of the year costs you the most time."

> "A straight answer on whether we are a fit — including when we are not."

That voice is a genuine differentiator against Frontline and PowerSchool, who sell as consolidated HCM suites with enterprise procurement motions. Solutionwhere's advantages are real and should be the spine of every ad, page, and email:

1. **Since 1996.** In a segment that has been repeatedly burned by acquisitions and forced migrations — MyLearningPlan → Frontline, Pearson Schoolnet EDS sunset — thirty years of independent operation is a trust asset, not a legacy liability.
2. **Buy one module, not a suite.** Districts with constrained budgets can solve one problem now. Frontline sells a platform commitment.
3. **You reach people who know the software.** A published phone number answered 8:30–5:00 ET by certified support specialists, against enterprise vendors' ticket queues.
4. **Four adjacent problems, one login.** Land on PD, expand to enrollment or coaching. This is the ACV expansion path.

**What to stop saying:** feature enumeration. Rosters, waitlists, and attendance tracking are table stakes and every competitor lists them.

---

## 6. Channel strategy

Reordered from the four-channel default to fit a named-account market. Priority is by expected contribution, not by ease of setup.

### 6.1 SEO and AI search — highest leverage, longest lead time

**Start immediately. This is the strongest asset and the most underexploited.**

The existing blog already contains state teacher certification content — Indiana, Louisiana, Arizona, Michigan. This is the seed of the single best content play available:

**State-by-state PD requirement and recertification pages.** Every state has distinct certification renewal rules, clock-hour requirements, and PD tracking mandates. The people searching these terms are exactly the people who buy PD management software, and they are searching with a problem Solutionwhere solves. Four states are done. Forty-six are not. The template is proven and the content is mechanically generatable at quality with a coding agent.

Second content line: **comparison and replacement pages.** The blog already contains "Looking for a Replacement to Pearson Schoolnet EDS?" — which is precisely the right instinct, aimed at a sunset that has already happened. The live version of that opportunity is Frontline. Searches for "Frontline Professional Growth alternative" and "MyLearningPlan alternative" come from people actively in an evaluation, and the acquisition-and-migration history in this category means there are real, specific grievances to speak to.

Third line: **AI search presence.** Increasingly, a district administrator's first move is asking an LLM which PD platforms exist. Being present in those answers requires structured, factual, well-cited pages that state plainly what the product does, who it serves, and what it costs to evaluate. The `/faq` and `/platform` pages are the right foundation; they need to be expanded to answer procurement questions directly.

**Deliverable:** SEO agent deployed against the four module categories plus the 50-state template.

> **Blocked:** the `SERPER_API_KEY` and `KEYWORDS_EVERYWHERE_API_KEY` in the Graphed environment are both returning auth errors, and the Ahrefs connection is unauthorized. Keyword volumes, live SERP positions, and competitor backlink profiles are not yet available. Prioritization within this section is currently based on category structure and competitor content, not on volume data. Restoring one of these keys is a prerequisite for a ranked keyword plan.

### 6.2 Cold email — best fit for this ICP, fastest to pipeline

**Start immediately, in parallel with SEO.**

This channel fits the market shape better than any other. The buyer universe is finite, public, and enumerable. District staff directories are published by law. Titles are standardized across the country in a way they are in almost no other industry — "Director of Professional Learning" means the same thing in Ohio and Nevada.

**Segmentation** mirrors the module structure, because the pain and the language differ per buyer:

| Segment | Title targets | Message spine |
|---|---|---|
| PD | Director of Professional Learning, PD Coordinator, Curriculum Director | Time lost to registration admin; recertification compliance reporting |
| Enrollment | Director of Enrollment, Student Services, Registrar | Lottery and school choice administration; document verification burden |
| Coaching | Director of Curriculum & Instruction, Academic Officer | Proving coaching investment produced outcomes |
| Referrals | CCR&R agency directors | Referral tracking to outcome; state reporting |

**Timing is the differentiator.** District procurement runs on a fiscal year starting July 1, with evaluation concentrated January through April and implementation in summer. Cold email that lands in the evaluation window converts at a multiple of the same email sent in October. This should drive send-volume pacing directly — see §7.

**Required input from Benjamin:** the ICP document, plus sales call transcripts and demo recordings. The purpose is to extract the actual language customers use to describe the pain, and the specific objections that come up. Generic B2B SaaS copy will not work on a public-sector buyer who has heard from Frontline eleven times.

### 6.3 Google Ads — small budget, high intent, always on

**Start after instrumentation.**

Low volume, high intent, cheap relative to a $5K–$25K allowable CAC. Structure:

| Campaign | Match | Purpose |
|---|---|---|
| **Brand defense** | Exact | `wisdomwhere`, `coursewhere`, `solutionwhere`, plus login variants. Cheap, protects an installed base that competitors can bid against. Non-negotiable. |
| **Competitor conquest** | Exact/phrase | `frontline professional growth alternative`, `mylearningplan alternative`, `vector solutions pd alternative`. Highest-intent traffic available. Point at comparison pages from §6.1. |
| **Category** | Exact/phrase | `professional development management software`, `school enrollment lottery software`, `child care referral software`, etc. Tight match types only. |

Broad match should stay off. In a market this small, broad match spends the budget on the adjacent consumer education market, which is enormous and entirely irrelevant. This is the most likely explanation for the prior agency's poor software-side results.

**Budget:** modest and capped. The searchable volume here does not absorb large spend. Expect this channel to be efficient but small.

### 6.4 Facebook/Meta Ads — reframed, and deliberately deprioritized

> **Superseded Sept 7, 2026 by `04-meta-ads-execution.md`.** Under Andromeda, Meta is run as a lead source: broad targeting, creative as the targeting input, full-funnel CAPI signal, a weekly creative factory and a daily management agent. The retargeting and matched-audience roles below survive as secondary campaigns. The paragraph that follows is kept for the record.

**Start last, and not as prospecting.**

This is where the standard template needs the most modification, and where the previous agency most likely burned money. Broad Meta prospecting into a 15,000-account universe is structurally inefficient.

Meta earns its place in two specific roles:

**Role one — matched-audience reach against the named list.** Upload the account and contact list built for cold email as a custom audience. Now Meta becomes a way to be repeatedly present with the *same* known buyers between email touches, at low cost. This is account-based advertising, not prospecting, and it is a legitimate and effective use of the channel.

**Role two — retargeting.** Anyone who viewed a module page or started the demo form. Small audience, high value, must exclude the `login_click` cohort from §3.

**The exception worth flagging:** the course partnership Benjamin mentioned at the end of the call — the company holding digital course licenses — has fundamentally different economics. Selling digital courses is a volume, consumer-adjacent motion where broad Meta prospecting genuinely works. If that becomes the fifth module, it deserves its own strategy, its own budget line, and a very different channel mix from the enterprise modules. It should not be blended into the same account structure or the same performance targets.

---

## 7. Sequencing

The school procurement calendar should drive the entire plan. Today is late August; the school year has just started. That is fortunate timing — it means the slow-building channels have time to mature before the window that matters.

### Phase 1 — Foundation (Sept)

| Work | Owner |
|---|---|
| NDA executed | Both |
| Conversion tracking instrumented on `home.solutionwhere.com` | Benjamin's coding agent, Graphed instructions |
| Root-domain rewrite evaluated and, if viable, implemented | Benjamin's team |
| Google Ads + Meta Business accounts created | Benjamin |
| API keys and user access granted to Graphed | Benjamin, Graphed docs |
| ICP doc, sales transcripts, demo recordings delivered | Benjamin |
| Instant-booking path added to `/demo` | Benjamin's coding agent |

Nothing else starts until tracking is live.

### Phase 2 — Compounding channels on (Sept–Oct)

SEO agent deployed. State certification page program begins. Competitor comparison pages published. Cold email list built and segmented by module; sequences written from real customer language; sending starts at low volume to warm domains and test messaging.

Rationale: both channels need lead time. SEO needs months to index and rank. Cold email needs domain warming and message iteration. Starting both now means they are at full strength in January.

### Phase 3 — Paid on, spend ramping into the window (Nov–Jan)

Google Ads live on brand and competitor terms. Meta matched-audience and retargeting live. Spend deliberately increases through December and peaks January–April, tracking the district evaluation window.

### Phase 4 — Evaluation window (Jan–Apr)

Maximum spend and maximum send volume. This is the period the previous three phases exist to prepare for. Module-level conversion data from §3 now determines budget allocation across the four modules.

### Phase 5 — C&D Packaging (after the software playbook is established)

The packaging business onboards second, as agreed. It is a genuinely different motion — consumer brand buyers, shorter cycles, broader addressable market, and a channel mix where Meta prospecting is far more appropriate. It should not reuse this document's conclusions.

---

## 8. What Graphed needs from Benjamin

Ordered by how much they block other work. Benjamin is traveling to Spain, so the first three matter most.

1. **Facebook Ads and Google Ads accounts created** — blocks all paid work
2. **User access granted to Graphed** once created — Graphed sends forward-deployed access documentation; Graphed configures API keys and infrastructure and hands back working accounts
3. **ICP documentation** — blocks cold email copy and paid audience definition
4. **Sales call transcripts, demo recordings, implementation audits** — whatever exists, transcribed or not; blocks message development
5. **A decision on the root-domain rewrite** — blocks the highest-leverage SEO work
6. **Confirmation that a coding agent can be pointed at the site** for tracking and booking implementation

---

## 9. How this gets measured

Reporting begins the day tracking goes live. Targets reflect the volume math in §2 — deliberately modest, because the business needs ~22 qualified leads a month, not hundreds.

| Metric | Definition | Where it comes from |
|---|---|---|
| Demo requests | `demo_request` conversions | GA4 / warehouse |
| Qualified demos held | Demo requests that met ICP and attended | CRM |
| Cost per qualified demo | Blended paid spend ÷ qualified demos | Warehouse |
| Pipeline by module | Demo form module picker → opportunity value | CRM + form parameter |
| Channel contribution | First-touch and last-touch to demo request | GA4 |
| Installed-base contamination rate | Share of site sessions hitting `login_click` | GA4 — sanity check on all audience data |

**Benchmark to hold this against:** at a $5K–$25K allowable CAC, a cost per qualified demo anywhere under $500 is strong performance. If any channel is being optimized toward a sub-$50 cost per lead, it is being optimized toward the wrong traffic.

---

## 10. Risks and open questions

**The subdomain decision may not be reversible cheaply.** If the root-domain rewrite proves impossible, the SEO ceiling in §6.1 is materially lower and the timeline to results extends. This is the single biggest open variable in the plan.

**No keyword or backlink data yet.** Three of the relevant API integrations on the Graphed side are unauthorized. The SEO section is currently structured on category logic rather than measured volume; it needs a data pass before the keyword plan is final.

**Sales call transcript coverage is thin.** Benjamin flagged that recording only started recently and that some demos may not be transcribed. If little usable material exists, the first cold email sequences will be built on hypothesis and will need a faster iteration loop than usual. Recording every demo going forward — including the two scheduled the day of the call — should start immediately regardless.

**One AE is a throughput constraint.** At 5–6 qualified demos a month the plan fits within one AE's capacity. If any channel outperforms materially, sales capacity becomes the bottleneck before marketing does. Worth deciding in advance whether that is a good problem.

**The engagement model is platform, not forward-deployed.** Graphed builds the infrastructure, configures the agents, and hands over the keys; Benjamin runs them via Claude Code or Codex with Graphed supporting on technical challenges. Strategy iteration after handoff is Benjamin's. This document is intended to be the durable strategic layer that survives that handoff.

---

## Appendix A — Audit findings

Collected from live sources on August 24, 2026.

| Finding | Detail |
|---|---|
| Correct company name | Solutionwhere, Inc. — not "Solutionware." North Canton, OH. Since 1996. |
| `solutionware.com` | Unrelated parked domain, listed for sale via Grails.com |
| Legacy site | `solutionwhere.com` → 301 → `/corp`, hosted on Rackspace (98.129.157.84) |
| New site | `home.solutionwhere.com`, hosted on Vercel |
| New site scale | 54 URLs in sitemap: 16 core pages, 31 blog posts, 6 topic indexes |
| New site technical state | Correct per-page canonicals, `robots: index, follow`, valid sitemap, descriptive unique titles — clean |
| **Tracking on new site** | **None.** No GA4, GTM, Meta pixel, or LinkedIn insight tag |
| Existing GTM container | `GTM-KVFXB4S` — installed only on legacy `/corp` |
| Legacy sitemap | Still live at root, listing `http://` `/corp` URLs at `yearly` changefreq |
| Conversion mechanism | Native form on `/demo`: name, organization, email, phone, role, module picker, free text. No calendar booking. |
| Existing SEO seed content | State teacher certification posts: Indiana, Louisiana, Arizona, Michigan |
| Existing competitor content | "Looking for a Replacement to Pearson Schoolnet EDS?" |
| Stated proof points | 33+ states, 80% less PD registration admin time, since 1996 |
| Named references on site | Lyons Township High School (IL), Washoe County School District (NV) |

### Competitive landscape by module

| Module | Competitors identified |
|---|---|
| Professional Development | Frontline Professional Growth (ex-MyLearningPlan), Vector Solutions PD Tracking, KickUp Learning, Kalpa, escWorks, PDPlanner, SchoolData.net, PLAD, GroweLab |
| Enrollments | SchoolMint Enroll, Avela, PowerSchool Enrollment, EnrollWise, K12Enrollment360, EdBrix |
| Coaching | Sibme, SchoolStatus Coach, KickUp Foundations, TeachBoost, IRIS Connect, Bullseye, GroweLab |
| Referrals | Worklife Systems, KinderSystems, iCarol, Insight, Wonderschool, BridgeCare |

**Structural read:** Frontline and PowerSchool dominate PD and enrollment respectively, both selling consolidated suites through enterprise procurement. The category has a documented history of acquisition and forced migration — MyLearningPlan into Frontline, Pearson Schoolnet EDS sunset — which is exactly the grievance Solutionwhere's thirty years of independence speaks to. That is the wedge.

---

## Appendix B — Source call

15 min meeting — Max Chehab & Benjamin Waxman, August 19, 2026. Full notes and action items: `transcripts/2026-08-19-benjamin-waxman-solutionware.md`.
