# Solutionwhere — Cold Email Execution Spec

**Companion to:** `gtm-strategy.md` §6.2
**Audience:** the engineer/agent building the list pipeline and the sequences.
**Date:** September 7, 2026

---

## 0. Why this channel fits and what makes it work

The entire US buyer universe is enumerable, public, and legally required to publish its staff directories. Titles are standardized across the country in a way they are in almost no other industry — "Director of Professional Learning" means the same thing in Ohio and Nevada.

That means the hard part of cold email — finding the right people — is a data engineering problem with a known answer, not a guessing game.

**Target universe: ~15,000 accounts.**

| Segment | Count | Modules |
|---|---|---|
| Public school districts (filtered, §2.1) | ~4,000 of 13,300 | Enrollments, PD, Coaching |
| Regional education service agencies | ~500 | PD, Coaching |
| CCR&R agencies | ~400 | Referrals, Coaching |
| County/parish early childhood lead agencies | ~3,100 ceiling; ~300 realistic | Referrals, Enrollments |
| State education agencies | 50 | All |
| Head Start grantees | ~1,600 | Referrals, Coaching |
| Charter management organizations | ~1,000 | Enrollments |
| Existing customers (cross-sell) | 30+ | The other three modules |

At 2–3 contacts per account, that is 30,000–45,000 contacts. At the sending capacity in §5 that is a multi-year program, which is why §7 sequences it by state and by season rather than blasting.

---

## 1. Suppression first

**Build the suppression list before building the prospect list.** Solutionwhere has customers in 33+ states and existing relationships everywhere; a cold email to a current customer's colleague is the fastest way to damage the reference network this whole GTM depends on.

Suppress:
1. Every domain belonging to a current customer account (domain-level, not contact-level).
2. Every domain in an open sales opportunity in the CRM.
3. Every contact who has ever submitted the `/demo` form.
4. Every past customer, unless sales explicitly clears them.
5. Any agency where a peer reference is being cultivated.
6. Known competitors, resellers, and marketing agencies.

Maintain as `data/suppression-domains.csv` with columns `domain,reason,added_date,source`. **Every send checks against it at send time, not at list-build time.**

---

## 2. Data extraction — where these people actually are

Each source below is a real, accessible dataset. For each: what it is, how to get it, what you get, and the traps.

### 2.1 NCES Common Core of Data — every public school district

**The spine of the district list.**

- **URL:** `https://nces.ed.gov/ccd/files.asp` → "Local Education Agency (School District) Universe Survey"
- **Method:** direct CSV download. No key, no scraping, no rate limit.
- **Also download:** the LEA "Membership" file (enrollment by grade) and "Directory" file. Join on `LEAID`.
- **Volume:** ~19,600 LEA records; ~13,300 after filtering to operational regular districts.

**Fields you get:** `LEAID`, `LEA_NAME`, `PHONE`, `MSTREET1`, `MCITY`, `MSTATE`, `MZIP`, `WEBSITE`, `LEA_TYPE`, `SY_STATUS`, `GSLO`, `GSHI`, `CHARTER_LEA`, `OPERATIONAL_SCHOOLS`, plus enrollment from the membership file.

**Filters to apply:**
```
SY_STATUS = 1                          # operational
LEA_TYPE IN (1, 2, 7)                  # regular local, supervisory union, independent charter
TOTAL_ENROLLMENT >= 2500               # buying capacity — below this, no budget or no staff role
GSLO IN ('PK','KG')                    # has pre-K or K — required for Enrollments/EC fit
```
Result: ~4,000 districts. Add a second tier of 1,000–2,500 enrollment for the PD module only, where a regional agency is not already serving them.

**Traps:** `WEBSITE` is missing or stale for roughly 15% of records — resolve by searching `"{LEA_NAME}" {MSTATE} school district` and taking the first `.k12.xx.us`/`.org`/`.net` result. `LEA_TYPE = 3` is a regional service agency; **split those into the §2.2 segment rather than dropping them** — NCES is a second source for regional agencies.

**Refresh:** annually, each fall.

### 2.2 AESA member directory — regional education service agencies

- **URL:** `https://members.aesa.us/directory/Find`
- **Method:** paginated HTML scrape. Returns 50 per page; the interface reports **482 total results.** Detail pages follow `https://members.aesa.us/directory/Details/{slug}-{id}` (e.g. `.../accept-education-collaborative-2358890`).
- **Fields:** organization name, mailing address, website, sometimes a contact email, "More Details" profile.
- **Volume:** 482 agencies across 39 states.

**Method:** iterate the state filter rather than trying to page past the 50-result cap. Then fetch each detail URL and parse.

**Cross-reference with:**
- `https://www.aesa.us/state-associations/` — state ESA associations, each of which publishes its own member list (often more complete and with named staff)
- NCES `LEA_TYPE = 3` records from §2.1
- The per-state agency directories in `05-seo-aeo-execution.md` §5.3 — e.g. `gomaisa.org` for Michigan ISDs, PAIU for Pennsylvania Intermediate Units, OESCA for Ohio ESCs, `boces.org` for New York

**Traps:** AESA membership is voluntary — 482 members against ~550 agencies nationally. Use the state association lists to fill gaps. Do not scrape the *Business Partner Directory*; those are vendors, not buyers (though it is a useful competitor list, see `05` §6.6).

### 2.3 CCR&R agencies

There is no single downloadable national file. Build it state by state.

- **Start:** `https://www.childcareaware.org/resources/ccrr-search/` — the national search, address/ZIP based. Useful for validating coverage, poor for bulk extraction.
- **The real source is the state network.** Each state runs a CCR&R network or lead agency that publishes its member list:

| State | Source |
|---|---|
| Illinois | INCCRRA — `inccrra.org`; 16 state-funded SDAs |
| Louisiana | Louisiana Department of Education publishes the CCR&R and community-network lists with phone numbers |
| Pennsylvania | Early Learning Resource Centers (ELRCs) — 26 regions, listed on the PA DHS/OCDEL site |
| Michigan | Great Start to Quality resource centers |
| California | `rrnetwork.org` — California Child Care Resource & Referral Network |
| Texas | Texas Workforce Commission child care services boards |
| Ohio | Ohio Child Care Resource & Referral Association (OCCRRA) |
| New York | Child Care Resource and Referral Association of NY |
| All others | Search `"{state} child care resource and referral network"` and `"{state} CCR&R agencies list"` |

- **Volume:** ~400 nationally.
- **Fields you get:** agency name, service area (counties), address, phone, director name in many cases, website.

**Traps:** many CCR&Rs are programs *inside* a larger host organization (a community action agency, a university, a school system). The contract-holding entity is the buyer; the CCR&R is the department. Capture both `agency_name` and `host_org` — the ICP notes Jefferson Parish Schools is both a CCR&R lead agency and a parish school system, which is exactly the cross-sell shape.

### 2.4 Head Start grantees

- **URL:** `https://headstart.gov/center-locator` — the locator has a dataset export by city/state/ZIP/grant number.
- **Also:** the Head Start Program Information Report (PIR) public data files, published annually on the ECLKC/HeadStart.gov data pages — grantee-level records with enrollment and staffing.
- **Volume:** ~1,600 grantees, ~17,000 centers. **Target grantees, not centers.**
- **Fields:** grantee name, grant number, address, program type, funded enrollment.

**Traps:** `headstart.gov` returns 403 to naive fetchers — use a real user agent and respect rate limits. Many grantees are the same entities already captured as districts or CCR&Rs; dedupe on normalized name + address.

### 2.5 State education agencies and their published lists

Fifty agencies, and each one publishes something useful:

- Approved PD provider lists
- Regional service agency directories
- Early childhood lead agency / community network lists (the LDOE model)
- Approved vendor and state contract lists
- District contact directories (most state DOEs publish a searchable district directory with named administrators — often better than NCES for contacts)

**Method:** one-time manual pass per state to locate the URLs, stored in `data/state-source-urls.csv`, then scheduled re-scrapes. Prioritize the eight states in `03-google-ads-execution.md` §6.2.

### 2.6 Charter management organizations

School choice and lottery are core Enrollments features, and charters run lotteries by law.

- **Source:** National Alliance for Public Charter Schools directory; state charter authorizer lists; NCES `CHARTER_LEA = 1` from §2.1.
- **Filter:** CMOs operating 3+ schools. A single-site charter has neither the budget nor the lottery complexity.
- **Volume:** ~1,000 CMOs and networks.

### 2.7 RFP and procurement portals — the timing signal

The highest-value source in this list, because it identifies accounts with an *active budget and an open window*.

| Source | What to watch |
|---|---|
| BidNet Direct / DemandStar | Public-sector RFPs; keyword alerts |
| State procurement portals (one per state) | Same |
| `usaspending.gov` | Federal-flow contracts to education agencies |
| Individual district and ESA purchasing pages | Larger agencies post their own |

**Keyword alerts to set:** `professional development management system`, `PD registration software`, `online student registration`, `school choice lottery`, `enrollment management system`, `instructional coaching platform`, `child care referral system`, `learning management` (noisy but occasionally right).

**Handling:** an RFP hit does not go into the cold-email sequence. It goes to the AE the same day. An agency that has published an RFP has usually already written the requirements around an incumbent — the value is in knowing, and in the fact that they will re-bid in 3–5 years.

### 2.8 Conference exhibitor and attendee lists

Exhibitor lists are public PDFs; attendee lists sometimes are. Pull from AESA, NAEYC, AASA, Child Care Aware, and the state associations named in `04-meta-ads-execution.md` §4.3.

**Two uses:** (a) attendee lists are pre-qualified named accounts; (b) exhibitor lists are the live competitor set, which feeds `05-seo-aeo-execution.md` §4.2.

### 2.9 Existing customers — start here

Thirty-plus live PD accounts, 33+ states. This is the warmest, highest-converting, lowest-risk list available and it requires no data engineering at all.

**Two motions:**
1. **Cross-sell within the account:** the PD coordinator is a customer; the registrar, the enrollment director, and the curriculum director at the same agency are not. Same domain, same login, existing relationship.
2. **Peer referral outward:** these agencies know each other by name. Ask each customer for two peer agencies, then approach those with the customer's name in the first line. This is the single highest-converting message available and it is why §8's sequences are all reference-led.

Send this segment from the **main domain**, not the cold domains — there is an existing relationship and deliverability is not at risk.

### 2.10 Sources deliberately not used

| Not using | Why |
|---|---|
| Apollo / ZoomInfo as the primary source | Thin and stale on public education agencies; misses the exact titles that matter. Useful only as a *fallback* for a contact whose name is known but whose email is not |
| Purchased "K-12 administrator" lists | Recycled, high bounce, will burn the sending domains in week one |
| LinkedIn scraping at volume | Detection risk and ToS exposure for a client account. Sales Navigator manual lookup for named accounts only |

---

## 3. Contact discovery — from account to named person

Having 15,000 accounts is not having 15,000 contacts. This is the pipeline.

### 3.1 Staff directory extraction

Public agencies publish staff directories, and most of them list email addresses in plain text. This is the primary contact source and it is free.

**Per account:**
1. Resolve the agency website (from NCES `WEBSITE`, AESA, or search).
2. Locate the directory page. Try in order: `/staff`, `/directory`, `/staff-directory`, `/our-team`, `/departments`, `/administration`, `/contact`, `/about/staff`. Also try the sitemap and an on-site search for "directory".
3. Extract every row: name, title, email, phone, department.
4. Match titles against the dictionary in §3.2.
5. Where emails are obfuscated or behind a form, capture the name and title anyway and fall back to §3.3.

**Yield expectation:** a clean email for 55–70% of targeted titles at districts and regional agencies; lower at CCR&Rs, which are smaller and often list only a general inbox.

### 3.2 Title dictionary — match against these strings

Case-insensitive substring matching, ranked. Take the highest-ranked match per account per module.

**PD module**
```
rank 1: director of professional learning · director of professional development ·
        professional development coordinator · professional learning coordinator ·
        supervisor of professional development · coordinator of professional learning
rank 2: director of curriculum and instruction · director of curriculum ·
        assistant superintendent for curriculum · chief academic officer ·
        director of teaching and learning · director of staff development
rank 3: professional development specialist · staff development coordinator ·
        certification officer · LPDC chair · Act 48 coordinator
```

**Enrollments module**
```
rank 1: director of enrollment · enrollment coordinator · registrar ·
        director of student services · student services coordinator ·
        director of admissions and enrollment · school choice coordinator
rank 2: director of student information · student data coordinator ·
        director of pupil services · pupil personnel director
rank 3: director of technology · chief technology officer   [gatekeeper, second contact only]
```

**Coaching module**
```
rank 1: instructional coaching coordinator · director of instructional coaching ·
        coordinator of instructional coaches · early childhood coordinator ·
        quality improvement coordinator · director of early childhood
rank 2: director of curriculum and instruction · chief academic officer ·
        director of teaching and learning · director of school improvement
rank 3: lead instructional coach · technical assistance specialist · coaching specialist
```

**Referrals module**
```
rank 1: executive director  [at a CCR&R] · CCR&R director · director of child care resource and referral ·
        director of family services · referral services manager
rank 2: program director · director of early childhood services · child care program manager
rank 3: data and reporting manager · quality improvement manager
```

**Never first contact** (the executive gate — they evaluate what the champion brings them):
```
superintendent · assistant superintendent · chief executive · board member ·
executive director  [at a district or ESA, as opposed to a CCR&R]
```

### 3.3 Email pattern inference — fallback only

When a name and title are known but the email is not.

**Only two patterns are worth probing.** Across a 45-person test in prior work, the other eight common permutations returned zero valid addresses:
```
1. {first}.{last}@{domain}
2. {first}@{domain}
```

**Rules:**
- Max 2 probes per person. Never run the full permutation set — it wastes verification credits and creates bounce risk.
- **Abort immediately on a catch-all domain.** A catch-all accepts everything and tells you nothing; a guessed address on a catch-all is a coin flip that costs a domain reputation hit.
- Prefer a pattern already observed in that domain's staff directory. One confirmed address establishes the pattern for the whole agency — this is the single biggest yield lever, because directories usually expose at least one real address even when they hide the rest.
- District domains follow predictable shapes: `{name}.k12.{st}.us`, `{name}schools.org`, `{name}isd.org`, `{name}.edu` for AEAs and some ESAs.

### 3.4 Verification

Every address goes through Million Verifier before it enters a sequence.

**Accept `ok` only.** Do not send to `catch_all`, `unknown`, or `disposable`. Catch-all addresses on public-sector domains behind Barracuda or Proofpoint will accept and then silently discard, which produces a false-positive delivery rate and no replies.

- Bulk-verify via `million-verifier:bulk` (see `07-graphed-platform-execution.md` §4 for running this through Graphed Tools so credits and results land in the warehouse).
- **Hard gate: bounce rate must stay under 2%.** Above 3% on `.k12` and `.org` domains and the sending domain gets filtered across an entire state's mail infrastructure — these agencies share filtering vendors and reputation data.
- Re-verify anything older than 90 days. Public-sector staff turnover is high and summer is when it happens.

### 3.5 Enrichment (optional, GetLeads)

For accounts where the directory yielded nothing, use GetLeads `/api/v1/contacts/search` with `filters.domains[]`. Note that GetLeads' own "VALID" flag is unreliable — in prior testing it labelled 33/33 contacts VALID and Million Verifier found only 10 genuinely deliverable. **Always re-verify GetLeads output through Million Verifier.**

---

## 4. The data model

Two tables. Account-grain and contact-grain, joined on `account_id`.

### `accounts`
```
account_id            uuid, primary key
account_name          text
account_type          enum: district | esa | ccrr | head_start | sea | cmo | county_network
normalized_name       text        # lowercased, punctuation stripped — dedupe key with state
domain                text        # the dedupe key that matters
website               text
state                 char(2)
city                  text
county                text
nces_leaid            text        # null for non-district
enrollment            int         # districts only
member_districts      int         # ESAs only
service_area          text        # CCR&R counties served
host_org              text        # CCR&R only — the contract-holding entity
agency_term           text        # ISD | IU | ESC | BOCES | AEA | CESA | ESU | RESA | ROE | COE
modules_fit           text[]      # pd | enrollments | coaching | referrals
priority_tier         int         # 1-4, see §7
state_credit_system   text        # SCECH | Act 48 | LPDC | CTLE | CPE ...
source                text
source_url            text
suppressed            boolean
suppression_reason    text
first_seen            date
last_verified         date
```

### `contacts`
```
contact_id       uuid, primary key
account_id       uuid, fk
first_name       text
last_name        text
title            text
title_rank       int          # from §3.2
module_segment   enum: pd | enrollments | coaching | referrals
email            text
email_source     enum: directory | pattern | getleads | rfp | conference
mv_status        enum: ok | catch_all | invalid | unknown | disposable
mv_verified_at   date
phone            text
linkedin_url     text
sequence_id      text
sequence_status  enum: not_started | active | replied | bounced | opted_out | completed
first_sent_at    timestamp
replied_at       timestamp
suppressed       boolean
```

**Dedupe key:** `lower(domain)` for accounts, `lower(email)` for contacts. A person who appears at two agencies gets two contact rows and one is suppressed.

---

## 5. Sending infrastructure

### 5.1 Domains

**Never send cold volume from `solutionwhere.com`.** 33+ states of customers depend on that domain for registration confirmations, transcripts, and certificates. One reputation event breaks the product for every customer.

Buy two secondary domains, both redirecting 301 to the main site:
```
solutionwhere.io
getsolutionwhere.com
```
Avoid hyphens, numbers, and unusual TLDs — public-sector filters score them down.

### 5.2 Per-domain setup

| Item | Value |
|---|---|
| Mailboxes | 3 per domain, 6 total. Named humans, real titles |
| SPF | `v=spf1 include:{esp} -all` |
| DKIM | 2048-bit, per-domain key |
| DMARC | `v=DMARC1; p=none; rua=mailto:dmarc@solutionwhere.com` for 30 days, then `p=quarantine` |
| MX | Standard for the provider |
| Custom tracking domain | Set up, but see §5.4 — tracking is off for cold |
| Warmup | **3 weeks minimum** before any live send. No exceptions |
| Redirect | 301 to `solutionwhere.com` |
| A basic landing page | The domain should resolve to something real if a recipient checks it |

### 5.3 Volume math

```
25 sends/mailbox/day  ×  6 mailboxes  =  150/day
150/day  ×  5 sending days             =  750/week
750/week ×  4                          = 3,000/month
```

At 3,000 contacts/month and a 4-email sequence, that is **~750 new contacts entered per month.** Working 30,000+ contacts takes years — which is exactly why §7 sequences by state and season instead of by list order.

Do not raise per-mailbox volume above 30/day. The gain is marginal and the reputation risk is not.

### 5.4 Public-sector deliverability rules

`.k12.xx.us`, `.org`, and county `.gov` mail sits behind Barracuda, Proofpoint, and Microsoft Defender. These filters are more aggressive than commercial spam filtering and they share reputation data across the districts they serve — meaning one bad send pattern can lock you out of an entire state.

**Non-negotiable:**
- **Plain text only.** No HTML email, no formatting.
- **No images.** Not even a logo.
- **No tracking pixel.** Open tracking is the single strongest spam signal in public-sector filtering. Turn it off. You lose open rates; you were going to make bad decisions with them anyway.
- **No link in email 1.** None. Not even a signature URL.
- **No link tracking / redirect domains** in any email in the sequence. Use bare URLs from email 2 onward.
- **No unsubscribe footer that looks like bulk mail.** Use a plain line: *"Reply and I'll stop."*
- **From a named person** with a real title. `hello@`, `info@`, `team@` read as bulk to both filters and humans.
- **Signature:** name, title, Solutionwhere, phone. Nothing else.
- **Send Tuesday–Thursday, 7:30–9:00am recipient local time.** Program directors are in classrooms, buildings, and site visits by mid-morning. Never Monday (inbox triage) and never Friday.
- **Random 60–180s intervals** between sends within a mailbox.

### 5.5 Sequencer

Instantly or Smartlead. Both connect as Graphed warehouse sources (see `07-graphed-platform-execution.md`), which is why they are preferred over a custom sender.

**One campaign per module segment per state wave.** Never one giant campaign — you lose the ability to read which segment is working and one bad segment poisons the whole sending reputation.

Naming: `SW | {module} | {state or wave} | {YYYY-MM}`

---

## 6. Sequences

Four emails over eleven days. One sequence per module. The variable that moves reply rate most in this market is **whether the first line names a peer agency the reader recognizes** — rewrite the proof line for every state wave.

All copy is plain text. `{{}}` denotes merge fields.

### 6.1 PD — cold, district or ESA

**Email 1 — day 0**
```
Subject: PD registration at {{account_name}}

{{first_name}} — quick one.

{{peer_agency}} was running PD registration through a shared spreadsheet and a
Google Form, and the recertification report at the end of the year took two
people about a week to assemble.

They've been on Wisdomwhere since {{year}}. The report is now a button.

How is {{account_name}} handling PD registration and credit tracking right now?

{{sender_name}}
{{sender_title}}, Solutionwhere
231-935-3000
Reply "no" and I'll leave it here.
```

**Email 2 — day 4**
```
Subject: re: PD registration at {{account_name}}

One number, then I'll stop taking your time.

Agencies that move off spreadsheets typically cut registration administration
by about 80 percent. That's not the interesting part though — the interesting
part is that {{state_credit_system}} reporting stops being a project.

We've been doing this since 1996 and we're still the same company. No
acquisition, no forced migration.

Worth twenty minutes?
```

**Email 3 — day 8**
```
Subject: someone better to talk to than me

{{first_name}} — you'd probably rather hear this from a peer than from a vendor.

{{peer_contact_name}} at {{peer_agency}} has offered to take calls from other
agencies looking at this. No pitch, no us on the line.

Want me to make the introduction?
```

**Email 4 — day 11**
```
Subject: closing the loop

Understood — wrong time or wrong problem.

Two things in case they're useful later:

Budget requests for next year get written January through March in most
agencies. If PD registration is on the list then, we're at solutionwhere.com
and 231-935-3000.

And if you're on CourseWhere or an older Wisdomwhere version, the upgrade path
is documented and we migrate the data.

Good luck with the year.
```

### 6.2 Enrollments — cold, district

**Email 1 — day 0**
```
Subject: registration season at {{account_name}}

{{first_name}} — how long does registration season actually take your team?

Most districts we talk to describe the same six weeks: paper packets, residency
documents in a filing cabinet, duplicate records, and a choice lottery that
someone runs in a spreadsheet and then has to defend to a board.

{{peer_agency}} moved that whole thing online. Families register from a phone,
in their language. Every lottery draw has a recorded seed, so it can be rerun
in front of the board and produce the same result.

Is registration a problem worth solving at {{account_name}} this year?

{{sender_name}}
{{sender_title}}, Solutionwhere
231-935-3000
Reply "no" and I'll leave it here.
```

**Email 2 — day 4**
```
Subject: re: registration season at {{account_name}}

The part that surprises people: it isn't the online forms.

It's that document review, residency verification and duplicate detection stop
being manual, and that choice, waitlists and in-district transfers live on one
screen instead of four systems.

When a family asks why they were placed where they were, the answer is already
in the record.

Twenty minutes to see whether it fits?
```

**Email 3 — day 8** — same reference-offer structure as §6.1.

**Email 4 — day 11**
```
Subject: closing the loop

No problem — timing is usually the reason.

For what it's worth, districts that change registration systems almost always
decide by March, because implementation has to happen over the summer to be
ready for the next season.

If that's the window, we're at solutionwhere.com and 231-935-3000.
```

### 6.3 Coaching — cold, ESA or CCR&R

**Email 1 — day 0**
```
Subject: coaching documentation at {{account_name}}

{{first_name}} — your coaches are doing the work. Can you prove it happened?

{{peer_agency}} was running coaching cycles out of a shared drive: visit notes
in one place, fidelity instruments in another, and a monthly report to the state
that took a week to assemble.

Their coaches now log visits from the classroom on a tablet, offline. The report
compiles itself.

How is {{account_name}} documenting coaching right now?

{{sender_name}}
{{sender_title}}, Solutionwhere
231-935-3000
Reply "no" and I'll leave it here.
```

**Email 2 — day 4**
```
Subject: re: coaching documentation at {{account_name}}

Two things that usually matter to people in your seat:

It's configured around your observation framework — not a template you have to
work around. And it's non-evaluative by design: educator data only, no student
PII, which shortens the conversation with your IT and compliance people.

Planned vs. delivered visits, by site, by cohort. Worth twenty minutes?
```

**Email 3 — day 8** — reference offer.

**Email 4 — day 11** — closing loop, budget window.

### 6.4 Referrals — cold, CCR&R

**Email 1 — day 0**
```
Subject: referral tracking at {{account_name}}

{{first_name}} — how many systems does a single referral touch at
{{account_name}}?

Most CCR&Rs we talk to are running four: intake somewhere, the provider list
somewhere else, referral history in a spreadsheet, and the state report
assembled by hand at the end of the quarter.

We built one system that does all four — family intake, live provider search
filtered by age, hours, availability, quality rating and distance, referral
history, and funder reporting generated from the operational data.

What does your current setup look like?

{{sender_name}}
{{sender_title}}, Solutionwhere
231-935-3000
Reply "no" and I'll leave it here.
```

**Email 2 — day 4**
```
Subject: re: referral tracking at {{account_name}}

The piece agencies tell us matters most: follow-up and placement outcomes get
recorded as part of the workflow, not as a separate data-entry task.

Which means the outcome data your funder asks for actually exists.

We've been building for education agencies since 1996. Twenty minutes?
```

**Email 3 — day 8** — reference offer.

**Email 4 — day 11** — closing loop.

### 6.5 Cross-sell — existing customer, different department

**Highest-yield sequence in this document. Run it in week one, from the main domain, before any cold infrastructure exists.**

**Email 1 — day 0**
```
Subject: the {{other_module}} side of {{account_name}}

{{first_name}} — {{account_name}} has run PD registration on Wisdomwhere since
{{year}}, so you already know how we build and who answers the phone.

The team that handles {{other_module_problem}} at {{account_name}} is probably
still doing it the hard way. Same kind of problem, one department over — and
it's the same login, the same support team, and the same contract vehicle you
already have.

Who owns that over there? Happy to be introduced rather than cold-call them.

{{sender_name}}
{{sender_title}}, Solutionwhere
231-935-3000
```

**Email 2 — day 5:** name the specific outcome for that module and offer a 20-minute walkthrough with both people on the call.
**Email 3 — day 10:** offer to send the one-pager to forward internally, so the customer does not have to explain it.

### 6.6 Copy rules

| Rule | Why |
|---|---|
| Under 120 words for email 1 | Read on a phone at 7:45am |
| One question, at the end | Multiple asks get zero answers |
| Name a peer agency in the first three lines | The single strongest variable in this market |
| No feature lists | Every competitor lists rosters, waitlists, and attendance |
| No "hope this finds you well", no "I wanted to reach out" | Instant delete signals |
| No merge field in the subject line | `Subject: PD registration at Wayne RESA` is fine; `{{first_name}}, quick question` is a template tell |
| Never claim a shared connection that doesn't exist | These agencies talk to each other |
| Rewrite `{{peer_agency}}` per state | A Michigan ISD does not care about a Louisiana parish |

---

## 7. Wave sequencing

Do not send to the whole list. Sequence by reference density and by the budget calendar.

### 7.1 Priority tiers

| Tier | Who | Why first |
|---|---|---|
| **1** | Existing customers — cross-sell | No deliverability risk, warmest relationship, fastest close |
| **2** | Peer agencies of existing customers, same state | Named reference in line one |
| **3** | Michigan, Pennsylvania, Ohio, New York regional agencies | Installed base density + the ISD/IU/ESC/BOCES archetype |
| **4** | Louisiana + Illinois early childhood — CCR&Rs and parish/county networks | Live reference (On Track by 5 / LPSS); Illinois mirrors Louisiana's structure with 16 SDAs |
| **5** | Texas, California, Georgia, Illinois regional agencies | Large agency counts, no reference yet |
| **6** | National district list by enrollment descending | The long tail |

### 7.2 The calendar — sending starts now

Public agencies set budgets annually against a July 1 fiscal year, and the January–March window converts best. **That is a reason to be in inboxes before it opens, not a reason to wait.** Sending starts the week this document is read, from whatever infrastructure can send safely today.

| Period | Send volume | What runs |
|---|---|---|
| **Now (Sept 2026)** | Everything that can send safely | **Day 1:** cross-sell sequence (§6.5) to all 30+ existing customers from the main domain — no warmup needed. **Day 1:** Tier-2 peer-referral outreach from any already-warmed mailbox Solutionwhere owns (the AE's mailbox at 20/day is fine). **Day 1:** buy the two cold domains and start warmup. Meanwhile the list pipeline (§2–§3) runs |
| **Late Sept → Dec** | Ramp to 100% as warmup completes (~3 weeks after purchase) | Louisiana and Illinois early-childhood waves; Michigan/Pennsylvania/Ohio/New York regional agencies. Discovery season — program directors are scoping what to ask for. Conference season |
| **Jan–Mar** | 100% | Budget season. Requests written for the July 1 fiscal year. Every account in tiers 1–4 should have been sequenced at least once before this opens |
| **Apr–Jun** | 40% | Board approvals and POs. Push open conversations; new outreach converts less, not zero |
| **Jun–Jul** | 20% | Implementation and the summer PD crunch. Ask for references and reviews (`05` §6.5) |

**Practical consequence:** the cold domains are the bottleneck, not the calendar. Purchase and warmup start **today**; first cold sends from them ~21 days later. The cross-sell and peer-referral motions do not wait for that.

---

## 8. Reply handling

At this volume every reply is read by a human. There is no autoresponder.

| Reply type | Action | SLA |
|---|---|---|
| Interested / question | Forward to the AE, cc the sender, AE responds from their own address | 2 business hours |
| "Send me information" | Do **not** send a deck. Send the `/platform` link and one specific question about their situation | 2 hours |
| "Not me, talk to X" | Thank them, add X to the account, start a new sequence naming the referrer | Same day |
| "Not now / no budget" | Ask one question: when does the budget cycle open? Set a task for that month. Mark `completed`, not `opted_out` | Same day |
| "Remove me" | Suppress the contact **and** ask whether to suppress the domain. Never re-add | Immediate |
| Out of office | Pause the sequence until the return date, then resume | Automatic |
| Bounce | Mark `bounced`, remove from all sequences, flag the account for re-discovery | Immediate |
| Hostile | Suppress the entire domain. These agencies talk to each other | Immediate |

**Every reply gets logged to the CRM against the account**, with `gclid`-equivalent source tagging so first-touch attribution in `gtm-strategy.md` §9 stays accurate.

---

## 9. Compliance

- **CAN-SPAM applies.** These are business addresses and cold B2B email is legal, but: accurate From/Reply-To, a real physical address available on request, and honoring opt-outs within 10 business days (do it same-day).
- **The "reply and I'll stop" line is the opt-out mechanism.** It satisfies the requirement and reads as human rather than as bulk mail.
- **Public-records exposure.** Emails to public agency staff may be subject to state public-records requests and could be published. Write every email as though it will be. This is a good discipline anyway.
- **Do not email students, parents, or anyone at a `.edu` student domain.** Filter these explicitly.
- **State-specific:** a few states restrict commercial solicitation to public employees. Where an agency's own site states a no-solicitation policy, suppress the domain.

---

## 10. Build checklist

```
[ ] Suppression list built from CRM (§1) — before anything else          ← today
[ ] Cross-sell sequence live to 30+ existing customers from the main domain (§6.5) ← today
[ ] Peer-referral outreach from an existing warmed mailbox, 20/day (§2.9)   ← today
[ ] Two domains purchased, DNS configured (§5.2)          ← today
[ ] 6 mailboxes created, warmup started                    ← today
[ ] NCES CCD downloaded and filtered → ~4,000 districts (§2.1)
[ ] AESA directory scraped → 482 agencies (§2.2)
[ ] State CCR&R networks scraped, priority states first (§2.3)
[ ] accounts + contacts tables created per §4
[ ] Staff-directory extraction running (§3.1)
[ ] Title dictionary applied, contacts ranked (§3.2)
[ ] Million Verifier bulk verification, ok-only filter (§3.4)
[ ] Sequencer configured, one campaign per module per wave (§5.5)
[ ] 4 sequences written with state-specific peer references (§6)
[ ] No WCAG or SOC 2 claim, and no named customer, in the sequence copy. Leave {{peer_agency}} blank until Benjamin clears the name
[ ] Reply-handling SLA agreed with the AE (§8)
[ ] RFP keyword alerts set (§2.7)
[ ] Warmup complete, first cold-domain wave sends          ← ~21 days after purchase
```
