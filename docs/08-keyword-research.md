# Solutionwhere — Keyword Research (Measured)

**Source:** Keywords Everywhere API, Google Keyword Planner data source (`gkp`), US, USD. Clickstream (`cli`) used as a second pass on zero-volume terms. Pulled September 7, 2026.
**Files:** `data/keyword-volumes.csv` (331 terms from `03`/`05`), `data/keyword-volumes-clickstream.csv` (267 zero-GKP terms re-checked), `data/keyword-related.csv` (812 related/PASF terms off 19 seeds), `data/keyword-volumes-states-and-adjacent.csv` (496 terms: 50 states × 5 phrasings, state credit systems, adjacent product terms).
**Total measured:** ~1,900 unique terms.

This document supersedes every volume assumption in `03-google-ads-execution.md` and `05-seo-aeo-execution.md`. Both have been patched to point here.

---

## 1. The headline: the category barely exists as a search term

**267 of the 331 terms the specs were written around have zero Google Keyword Planner volume.** The clickstream pass recovered three. The category vocabulary — "professional development management software," "instructional coaching software," "child care referral software," "coaching cycle tracking software" — is how vendors describe these products, not how buyers search.

What a public-agency buyer actually types, in descending volume:

1. **The name of the state credit system they have to comply with** (`act 48`, `scech`, `ctle`, `lpdc`, `moecs`)
2. **The name of the incumbent vendor**, usually to log in (`frontline education login` 33,100; `schoolmint` 22,200; `mylearningplan` 14,800)
3. **The state + "teacher license renewal"** (`texas teacher license renewal` 1,600; `ohio teacher license renewal` 720)
4. A handful of generic product terms with real but tiny volume (`school registration software` 300; `mentoring tracking system` 390)

The strategy in `gtm-strategy.md` — named-account, cold email + SEO first, paid small — is confirmed harder than assumed. Paid search cannot spend $28K/year in this category. See §5.

---

## 2. Category and product terms — everything with volume

Genuine commercial-intent terms across all four modules. This is the complete list with ≥10/mo; everything else in the original keyword lists is zero.

| Term | Vol/mo | CPC | Module | Note |
|---|---|---|---|---|
| coaching tracker | 2,900 | $0.47 | Coaching? | **Verify intent** — likely life/sports coaching. Do not bid until the SERP is checked |
| mentoring tracking system | 390 | $6.88 | Coaching | Real. Teacher induction/mentoring is a Coaching use case. Add to `05` category pages and `03` CCH campaign |
| school registration software | 300 (cli) | $11.52 | Enrollments | Highest-volume enrollment term. Was in `03` as phrase match — promote to its own ad group |
| student enrollment management system | 170 | $4.66 | Enrollments | Add |
| walkthrough app | 90 | $14.94 | Coaching | Add to CCH walkthroughs ad group |
| school choice lottery | 90 | $3.71 | Enrollments | Add (bare, no "software") |
| school enrollment software | 50 | $16.13 | Enrollments | Kept |
| online school registration software | 50 | $18.57 | Enrollments | Kept |
| enrollment management system | 50 | $20.79 | Enrollments | Add. Highest CPC in the set |
| online student registration | 50 | $5.18 | Enrollments | Add |
| professional development tracker | 50 | $6.39 | PD | Add |
| teacher evaluation software | 40 | $3.02 | Coaching | Adjacent; careful — Coaching is explicitly non-evaluative. Negative or comparison content only |
| kindergarten registration online | 40 | $4.06 | Enrollments | Parent intent — negative |
| student enrollment software | 40 | — | Enrollments | Add |
| professional development log | 30 | — | PD | Add (content) |
| student registration system | 30 | — | Enrollments | Add |
| magnet lottery | 30 | — | Enrollments | Add (content) |
| professional learning management system | 20 | $6.23 | PD | Kept |
| online student registration software | 20 | — | Enrollments | Kept |
| k 12 online registration | 20 | $8.30 | Enrollments | Add |
| instructional coaching log | 20 | — | Coaching | Add (content) |
| coaching log template | 110 | — | Coaching | Content magnet — a downloadable template page |
| school lottery software | 10 | $3.48 | Enrollments | Kept |
| classroom walkthrough software | 10 | — | Coaching | Kept |
| professional development management software | 10 | — | PD | The category's own name: 10/mo |
| teacher professional development software | 10 | — | PD | Kept |
| professional development tracking software | 10 | — | PD | Kept |
| charter school lottery software | 10 | — | Enrollments | Add |
| ccr r | 170 | $3.99 | Referrals | The agency type, not software. Content only |
| childcare referral service | 40 | — | Referrals | Consumer intent — negative |
| child care referral software / ccr&r software / child care resource and referral software | 0 | — | Referrals | **Zero.** Nobody searches for Referrals software by name |

**Wrong-product terms that surfaced with volume and must be negatives:** `school management software` 720 (SIS/ERP), `school erp software` 30, `employee training software` 390, `online learning platforms for business` 480, `event registration software for nonprofits` 140, `admissions software` 70, `school information management system` 110, `homebase login`, `humanity login`, `sketchup`.

**Implication for Referrals:** there is no paid or organic search demand for CCR&R referral software. The `REF | Category` campaign in `03` §3.6 should not launch. Referrals is sold entirely through cold email and the CCR&R relationship (`06` §2.3), and organic presence comes from the `/for/ccr-r-agencies` page ranking for `ccr r` / `child care resource and referral` (170 + related), not from software terms.

---

## 3. Competitor brand terms — where the paid volume is

| Competitor | Bare brand | Login variant | Admin/eval intent | Module |
|---|---|---|---|---|
| Vector Solutions | 40,500 | `vector solutions login` 9,900; `red vector login` 1,600 | `vector solutions pricing` 20 @ $10.89; `competitors` 10 @ $10.34; `vector solutions education` 10 | PD — **but Vector is a multi-vertical safety-training company; most of this is not education** |
| Frontline | `frontline professional growth` 1,000 | `frontline education login` 33,100; `frontline central login` 1,900; `app frontline` 1,300 | `frontline education professional growth` 90 @ $2.08; `frontline professional growth login` 110 | PD |
| MyLearningPlan | 14,800 | `my learning plan login` 720 | — | PD (legacy name, still searched) |
| SchoolMint | 22,200 | `login` variants ~200; `schoolmint app` 210 | `schoolmint admin` 210; `schoolmint application` 210; `schoolmint pricing` 10; `schoolmint reviews` 10 | Enrollments |
| SchoolStatus | 12,100 | — | `schoolstatus boost` 20 | Coaching |
| KickUp | 14,800 | `kickup login` 1,300; `kickup app` 50 | — | Coaching/PD — **bare term is ambiguous ("kick up")** |
| escWorks | 4,400 | `escworks login` 480 | — | PD (Texas ESCs) |
| Kalpa | 3,600 | — | `kalpa professional development` 40; `kalpa pd` 10 | PD — **bare term ambiguous** |
| Avela | 3,600 | — | `avela reviews` 10 | Enrollments — **ambiguous** |
| iCarol | 2,900 | `icarol login` 2,400 | `icarol software` 10 @ $7.32; `icarol pricing` 10 | Referrals |
| Sibme | 2,400 | `sibme login` 720 | `sibme app` 50; `sibme reviews` 20; `sibme pricing` 10 | Coaching |
| Wonderschool | 2,400 | — | — | Referrals — consumer marketplace, skip |
| PowerSchool Enrollment | 1,900 | `powerschool enrollment login` 720 | — | Enrollments |
| TeachBoost | 1,900 | `teachboost login` 480 | — | Coaching |
| Edthena | 1,300 | — | `edthena pricing` 10 | Coaching |
| BridgeCare | 1,000 | — | — | Referrals |
| KinderSystems | 480 | — | — | Referrals |
| IRIS Connect | 480 | — | `iris connect reviews` 10 | Coaching |
| Infinite Campus Online Registration | 260 | — | — | Enrollments |
| Whetstone Education | 170 | — | — | Coaching |
| Finalsite Enrollment | 210 | `finalsite enrollment login` 30 | — | Enrollments — add to comparison set |
| Registration Gateway | 90 | — | — | Enrollments |
| Bullseye | 30 | — | — | Coaching |

**Every "X alternative" term is zero.** Buyers do not search for alternatives by that phrase; they search the competitor's name. The conquest campaign in `03` §3.2/§3.7 was built on "alternative" keywords and would have served nothing.

**Reading the login volume correctly.** `frontline education login` at 33,100 is teachers and substitutes, not buyers. But the PD director logs in too, and *that person's* search is indistinguishable from a teacher's. The workable conquest approach:

- Bid on the **bare brand** and the **"[brand] professional growth" / "[brand] admin"** variants, exact match, at a low CPC ($1.50–$3.00).
- Add **login-intent negatives at the campaign level**: `login`, `log in`, `sign in`, `signin`, `password`, `app`, `download`, `support`, `help`, `phone number`, `customer service`, plus each brand's known login-URL fragments.
- Ad copy that **self-selects the buyer**: "For district administrators comparing PD platforms." Teachers will not click it; the ad's CTR will be low; that is correct.
- Expect single-digit clicks per day per competitor after negatives. That is the real size of this market's paid demand.

---

## 4. State compliance — the organic play, and it is much bigger than the category

### 4.1 State credit systems

| Term | Vol/mo | CPC | State | Notes |
|---|---|---|---|---|
| ctle | 368,000 | $0.06 | NY | **Verify** — plausible for NY's ~200K educators but may be inflated by GKP grouping. Treat as ≥10K. `ctle hours` 320, `ctle requirements` 20 confirm real intent |
| moecs | 18,100 | $3.31 | MI | Michigan's certification portal. `moecs login` 6,600; `moecs professional development` 10 |
| scech / scechs | 1,900 each | $2.20 | MI | + `scech michigan` 260, `scechs michigan` 210, `michigan scech` 70, `free scechs` 20, `how many scechs do i need in michigan` 40, `michigan teacher professional development log` 10 |
| lvis indiana | 1,900 | — | IN | Indiana's licensing portal. `lvis indiana login` 390; `indiana pgp points` 30 |
| act 48 | 1,600 | $2.00 | PA | + `act 48 hours` 1,300, `perms act 48` 1,000, `act 48 hours check` 590, `act 48 pennsylvania` 590, `act 48 credits` 390, `act 48 login` 140, `free act 48 credits` 70, `pde approved act 48 providers` 10 |
| elis isbe | 1,000 | — | IL | + `elis isbe login` 1,300; `isbe professional development hours` 90 |
| adeconnect | 720 | — | AZ | Arizona's portal. + `adeconnect login` 260 |
| lpdc | 590 | — | OH | + `ipdp ohio` 70 |
| ksde license renewal | 390 | — | KS | |
| kentucky epsb | 140 | — | KY | |
| plu georgia | 90 | — | GA | + `georgia plu credits` 10 |
| cpe hours texas | 30 | $1.50 | TX | + `tea cpe` 20 |
| pdps massachusetts | 20 | $2.23 | MA | |
| virginia teacher recertification points | 20 | — | VA | |
| wisconsin pdp | 10 | — | WI | |
| tspc pdu | 10 | — | OR | |

**These are portal/login and teacher-compliance searches** — the same pattern as competitor logins. The searcher is usually a teacher. Two reasons they still matter:

1. Topical authority. A site that is the best non-government answer for `act 48 hours` and `scech` ranks for everything adjacent, including the district-admin queries that convert.
2. The district administrator responsible for *reporting* these hours searches the same terms. `pde approved act 48 providers`, `michigan teacher professional development log`, `isbe professional development hours` are administrator queries sitting inside the teacher cluster.

### 4.2 State renewal terms — all 50 states

| State | Best term | Vol | Other |
|---|---|---|---|
| Texas | texas teacher license renewal | 1,600 | certification renewal 70 |
| Ohio | ohio teacher license renewal | 720 | how to renew 70; certification renewal 10 |
| Minnesota | minnesota teacher relicensure | 590 | license renewal 110 |
| California | california teacher certification renewal | 480 | clear credential 50 |
| North Carolina | north carolina teacher license renewal | 480 | |
| Florida | florida teacher certification renewal | 390 | license renewal 30 |
| Arkansas | arkansas teacher certification renewal | 320 | license renewal 320 |
| Indiana | indiana teacher license renewal | 260 | how to renew 20 |
| Iowa | iowa teacher license renewal | 260 | |
| Oklahoma | oklahoma teacher license renewal | 260 | certification renewal 20 |
| Colorado | colorado teacher license renewal | 210 | |
| Kansas | kansas teacher license renewal | 210 | ksde license renewal 390 |
| Michigan | michigan teacher certification renewal | 210 | license renewal 210 |
| Alabama | alabama teacher certification renewal | 170 | |
| Utah | utah teacher certification renewal | 170 | license renewal 170 |
| Idaho | idaho teacher certification renewal | 110 | |
| Illinois | illinois teacher certification renewal | 110 | license renewal 110 |
| North Dakota | north dakota teacher license renewal | 90 | |
| Louisiana | louisiana teacher certification renewal | 70 | |
| Nebraska | nebraska teacher certification renewal | 70 | |
| Tennessee | tennessee teacher certification renewal | 70 | license renewal 20 |
| Virginia | virginia teacher certification renewal | 70 | license renewal 70 |
| Wisconsin | wisconsin teacher license renewal | 70 | |
| Kentucky | kentucky teacher certification renewal | 50 | |
| Nevada | nevada teacher license renewal | 50 | |
| Oregon | oregon teacher license renewal | 50 | |
| South Dakota | south dakota teacher certification renewal | 50 | |
| Alaska | alaska teacher certification renewal | 40 | |
| Mississippi | mississippi teacher license renewal | 40 | |
| Georgia | georgia teacher certification renewal | 30 | |
| Maryland, Massachusetts, Montana, New Mexico, South Carolina, Vermont | — | 20 each | |
| Arizona, Connecticut, Hawaii, Maine, Missouri, New York, Pennsylvania | — | 10 each | NY and PA are low here because the credit-system name (`ctle`, `act 48`) absorbs the demand |
| Delaware, New Hampshire, New Jersey, Rhode Island, Washington, West Virginia, Wyoming | — | 0 | Still build — zero-volume state pages cost nothing and complete the cluster |

**Phrasing matters.** "license renewal" beats "certification renewal" in most states; "how to renew teaching license in X" is near zero everywhere except Ohio. Title tags should use the state's own vocabulary (Texas and Ohio say *license*; Florida and California say *certification*; Minnesota says *relicensure*).

### 4.3 What this means for the page program

The existing pattern `/blog/steps-to-{state}-teacher-certification` targets the wrong phrasing for most states and buries the highest-volume terms (the credit-system names) inside a generic page. Revised structure — see the patched `05` §3:

1. **Credit-system hub pages, standalone URLs, built first:** `/act-48`, `/scech`, `/ctle`, `/lpdc`, `/moecs`, `/elis`, `/lvis`, `/cpe-texas`, `/plu-georgia`, `/pdp-wisconsin`. These are the highest-volume terms in the entire research set and nobody outside state government owns them well.
2. **State renewal pages** re-titled to the state's vocabulary and ordered by the table above — Texas, Ohio, Minnesota, California, North Carolina, Florida, Arkansas first.
3. **Administrator-intent pages** hung off each hub: "How districts track Act 48 hours," "Approved Act 48 provider reporting," "Michigan PD log requirements for districts." These are the pages with the Wisdomwhere CTA.

---

## 5. Budget consequence

`03` §6.3 planned ~$28,000/year peaking at $4,000/month. Measured demand cannot absorb it:

| Bucket | Real monthly searches (US) | Plausible clicks/mo at 4% CTR | At avg $8 CPC |
|---|---|---|---|
| Enrollment category terms (§2) | ~700 | ~28 | ~$225 |
| PD category terms (§2) | ~150 | ~6 | ~$50 |
| Coaching category terms (§2, excl. unverified `coaching tracker`) | ~250 | ~10 | ~$80 |
| Referrals category terms | 0 | 0 | $0 |
| Competitor conquest after login negatives (§3, est. 10% of bare-brand volume is non-login) | ~12,000 | ~120 at 1% CTR | ~$300 at $2.50 |
| Brand + legacy defense | ~450 | ~150 | ~$150 |
| State compliance (paid, teacher-heavy, low value) | ~30,000 | cap deliberately | ~$150 |
| **Total spendable** | | | **~$950–1,200/month** |

**Revised Google Ads budget: ~$1,000/month steady, ~$1,500 peak Jan–Apr, ~$13,000/year.** The ~$15,000 difference moves to the two channels the data validates — SEO content production for the credit-system and state clusters, and cold-email list building.

Meta's $10,500/year is unaffected — it was never search-demand-based.

---

## 6. Data caveats

- GKP rounds low volumes to 0/10/20/30/40/50/70/90/110/140/170/210/260/320/390/480/590/720/880/1,000/1,300/1,600/1,900/2,400/2,900/3,600/4,400/5,400/6,600/8,100/9,900/12,100/14,800/18,100/22,200/27,100/33,100/40,500/… — every number above is a bucket, not a count.
- GKP groups close variants; `ctle` at 368,000 almost certainly includes `ctle hours`, `ctle login`, etc. Keyword Planner in the Google Ads account (once it exists) will show the ungrouped figure.
- Ambiguous brand terms (`kickup`, `kalpa`, `avela`, `coaching tracker`) need a SERP check before any bid.
- `cli` (clickstream) data recovered only 3 of 267 zero terms; the zeros are real.
- Related-keyword pulls used `num=50` per seed; deeper pulls on `act 48`, `scech`, `ctle`, and `schoolmint` would surface more long-tail and are worth ~2,000 credits.

---

## 7. Re-running this — Keywords Everywhere or DataForSEO

Either provider returns Google Ads (Keyword Planner) volume buckets, so numbers are directly comparable to the tables above. Use whichever key the operator has. Re-run quarterly, and any time a new competitor, state, or term appears in sales calls or Search Console.

### 7.1 The term list to re-run

Keep one file, `data/keyword-terms.txt`, one term per line, as the master. Seed it from the union of the four CSVs' `keyword` columns:

```sh
cat data/keyword-volumes.csv data/keyword-volumes-states-and-adjacent.csv data/keyword-related.csv \
  | tail -n +2 | cut -d, -f1 | tr -d '"' | sort -u > data/keyword-terms.txt
```

### 7.2 Keywords Everywhere

Env: `KEYWORDS_EVERYWHERE_API_KEY`. Auth: `Authorization: Bearer <key>`. Form-encoded bodies. Credits: 1 per keyword for volume; ~1 per term returned for related/PASF; the `cli` (clickstream) source is the same price. Balance is returned as `credits` on every response.

**Volume — up to 100 keywords per request:**
```sh
curl -s https://api.keywordseverywhere.com/v1/get_keyword_data \
  -H "Authorization: Bearer $KEYWORDS_EVERYWHERE_API_KEY" -H "Accept: application/json" \
  --data-urlencode "country=us" --data-urlencode "currency=usd" --data-urlencode "dataSource=gkp" \
  --data-urlencode "kw[]=act 48" --data-urlencode "kw[]=school registration software"
```
Response: `{ data: [{ keyword, vol, cpc: { currency, value }, competition, trend: [{ month, year, value }] }], credits }`. `dataSource=cli` swaps in clickstream volume — use it as a second pass on GKP zeros.

**Related and "people also search for" — one seed per request, returns bare strings; fetch their volumes with the call above:**
```sh
curl -s https://api.keywordseverywhere.com/v1/get_related_keywords \
  -H "Authorization: Bearer $KEYWORDS_EVERYWHERE_API_KEY" \
  --data-urlencode "keyword=act 48" --data-urlencode "num=50" --data-urlencode "country=us" --data-urlencode "currency=usd"
# same shape: /v1/get_pasf_keywords
```

### 7.3 DataForSEO

Env: `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`. Auth: HTTP Basic. JSON bodies are **arrays of tasks**. Every response is `{ tasks: [{ status_code, status_message, cost, result }] }` — `status_code` must be `20000`. Approximate cost: search-volume live tasks are a few cents per call of up to 1,000 keywords; Labs related/suggestion calls are priced per item returned — check `cost` on each response.

**Volume — up to 1,000 keywords per task:**
```sh
curl -s https://api.dataforseo.com/v3/keywords_data/google_ads/search_volume/live \
  -u "$DATAFORSEO_LOGIN:$DATAFORSEO_PASSWORD" -H "Content-Type: application/json" \
  -d '[{"keywords":["act 48","school registration software"],"location_code":2840,"language_code":"en"}]'
```
`result[]` rows: `{ keyword, search_volume, cpc, competition, competition_index, monthly_searches: [{ year, month, search_volume }] }`. `location_code 2840` = United States.

**Related keywords (Labs) — returns volumes inline, no second call:**
```sh
curl -s https://api.dataforseo.com/v3/dataforseo_labs/google/related_keywords/live \
  -u "$DATAFORSEO_LOGIN:$DATAFORSEO_PASSWORD" -H "Content-Type: application/json" \
  -d '[{"keyword":"act 48","location_code":2840,"language_code":"en","depth":2,"limit":200}]'
```
`result[0].items[].keyword_data: { keyword, keyword_info: { search_volume, cpc, competition } }`. `/dataforseo_labs/google/keyword_suggestions/live` (same body minus `depth`) returns long-tail terms containing the seed, same item shape.

### 7.4 The script

`scripts/keyword-research.ts` (in this folder; also `src/keyword-research.ts` in the Graphed growth-agents repo) implements both providers behind one CLI and writes the CSV format used in `data/`. Drop it into the client project unchanged — its only dependencies are `dotenv` and `tsx`; add `"keyword-research": "tsx scripts/keyword-research.ts"` to `package.json`.

```sh
npm run keyword-research -- --provider keywordseverywhere --file data/keyword-terms.txt --out data/keyword-volumes.csv
npm run keyword-research -- --provider keywordseverywhere --source cli --file data/keyword-terms.txt --out data/keyword-volumes-clickstream.csv
npm run keyword-research -- --provider dataforseo --file data/keyword-terms.txt --out data/keyword-volumes.csv
npm run keyword-research -- --provider dataforseo --related "act 48" --related "scech" --related "schoolmint" --num 200 --out data/keyword-related.csv
```
`--provider` defaults to `keywordseverywhere`; `KEYWORD_PROVIDER=dataforseo` in the environment changes the default.

### 7.5 What to do with the refreshed numbers

1. Any term crossing **50/mo** for the first time → add as exact match to the matching ad group in `03`, and a page or section in `05`.
2. Any competitor whose bare brand crosses **1,000/mo** → comparison page in `05` §4 and a conquest ad group in `03` §3.7.
3. Any state credit-system term crossing **500/mo** → its own hub page per `05` §3.0.
4. Re-rank the state build order in `05` §3.1 by `{state} teacher license renewal` volume.
5. Update the `08` tables and note the pull date at the top.

In the Graphed project (`07` §4.9) this runs as the `keyword-refresh-quarterly` job and writes `keyword_volumes`, so steps 1–4 become dashboard flags rather than manual diffing.

### 7.6 Provenance of this pull

Run Sept 7, 2026 with Keywords Everywhere (`gkp` + `cli`), ~1,300 credits. The `.env` in the Graphed repo held a stale key (401) at the time and the working key was passed inline; the `.env` line needs replacing.
