---
name: google-ads-search-manager
description: >
  Manage Google Search ad campaigns using the Testing → Winners promotion loop.
  Use whenever the task involves running, optimizing, or automating a Google Ads
  Search campaign: seeding broad-match keywords, finding converting search terms,
  promoting winners into exact-match ad groups, negative-matching wasted spend,
  or pruning close-variant search terms. Triggers on "Google Ads", "search ads",
  "search campaign", "negative keywords", "keyword testing", "winners campaign",
  GAQL, or any request to read/mutate a Google Ads account programmatically.
  NOT for Performance Max, Display, or Meta/Facebook ads.
---

# Google Ads Search Campaign Manager

## What this skill does

It encodes one specific, repeatable strategy for running profitable Search
campaigns and automating it against the Google Ads API. The strategy mirrors the
creative-testing loop used on Meta, but the unit being tested is the **keyword**,
not the creative:

> On Meta we wrestle the algorithm with **creative**. On Google we wrestle it with
> **keywords** — specifically, with negative keywords.

The whole system is two campaigns and a daily loop. Read this entire file before
writing any code, then load the reference files for the exact API field names and
query strings.

## Core mental model

- **One conversion action** is chosen with the client and is what every campaign
  optimizes toward. Always push as far **down the funnel** as the available data
  allows (e.g. *phone number submitted* beats *address entered* beats *page view*).
  The deeper the conversion, the less keyword-wrestling matters; the higher up
  (cheap, shallow conversions), the more aggressively you must negative-match.
- **Google will spend the whole budget whether or not it produces outcomes.** It
  is optimizing for spend, not for the client's result. The negative-keyword loop
  is how you stop it wasting money.
- **Exact match is no longer truly exact.** Google still serves "close variants"
  for an EXACT keyword. The only way to force near-exact behavior is to
  **continuously negative-match every served search term that isn't the target
  phrase**, at the ad group level. This is a daily process, not a one-time setup.

## Campaign structure

Exactly two Search campaigns per client, both optimizing the same conversion action.

**1. TESTING campaign** — keyword prospecting.
- Seeded with **broad match** keywords.
- Broad match self-expands: Google will show the ads for hundreds/thousands of
  related search terms you never typed in. That expansion is the point — it
  surfaces winning phrases.
- Job: discover which search terms actually convert.

**2. WINNERS campaign** — harvest + scale.
- **One ad group per winning keyword.** Each ad group bids on a single keyword set
  to EXACT match.
- The ad groups compete against each other for the campaign's shared budget,
  exactly like winning creatives compete on Meta.
- The ad creative in each ad group must contain the target keyword in its
  headlines (raises CTR and Quality Score on that exact term).

## The algorithm (daily loop)

```
SEED (mostly one-time, redo on new product/pain point)
  └─ generate broad keywords → add as BROAD match to TESTING

LOOP (daily)
  1. FIND WINNERS   query TESTING search_term_view → terms with conversions
  2. PROMOTE        for each winner:
       a. add winner as EXACT campaign-level NEGATIVE on TESTING
       b. create a new ad group in WINNERS (named after the keyword)
       c. add the keyword as EXACT match (positive) in that ad group
       d. create the RSA in that ad group with the keyword in the headlines
  3. FIND WASTE     query TESTING search_term_view → cost > threshold AND conversions = 0
       └─ add each as EXACT campaign-level NEGATIVE on TESTING
  4. PRUNE WINNERS  for each WINNERS ad group, query its search_term_view:
       └─ any served term ≠ the ad group's exact target phrase
          → add as EXACT ad-group-level NEGATIVE (never negate the target itself)
```

### Why the negative-keyword levels differ (do not get this wrong)

- **TESTING negatives go at the CAMPAIGN level.** A campaign-level negative applies
  to every ad group in the campaign. That is what you want here: once a term is a
  proven winner (promoted) or a proven loser (wasted spend), TESTING should never
  spend on it again.
- **WINNERS negatives go at the AD GROUP level.** Each WINNERS ad group owns exactly
  one phrase. To force near-exact serving you negate *everything else that ad group
  got shown for*. These must be ad-group-scoped — a campaign-level negative would
  block that phrase for the other winning ad groups too.
- **Guard:** before adding any negative, confirm it does not equal or block the ad
  group's own target keyword. Negating your own winner silently kills the ad group.

## Seeding keywords (step 0)

- Ask an LLM for "the 20 generic ways someone would search for `<product>`, given
  this URL" to get an initial broad-match seed list. This is good for the *first*
  batch only — LLMs repeat themselves and won't surface long-tail volume.
- For real expansion use a keyword data API (**DataForSEO** or **Keywords
  Everywhere**) seeded with the brand/URL. Pull search-volume-backed terms and add
  them all as broad match.
- You generally do **not** keep re-seeding. Broad match expands on its own. Only run
  seeding again when the client launches a new product or targets a new pain point
  (e.g. a separate "financial accounting for <vertical>" campaign discovered in
  SEMrush — that's a new seed set, possibly a new campaign).
- This step is a natural candidate for a shared **keyword-research agent** that
  feeds both the Google Ads agent and an organic/SEO agent (the decision per
  keyword: pay for it as an ad, or pursue it organically).

## Onboarding a fresh client (run order)

Once credentials are in `.env` and the real account IDs are in `clients/<client>.json`
(`customer_id` + `login_customer_id`; campaign IDs can stay as placeholders), the
whole setup is three commands:

```bash
npm run winners   -- --client <client>                                  # 1. smoke-test auth (read-only)
npm run bootstrap -- --client <client> --apply                          # 2. create campaigns (PAUSED), auto-write IDs to config
npm run seed      -- --client <client> --seeds seeds/<client>.json --apply  # 3. load broad/phrase seeds + negatives
```

Then in the Google Ads UI: set the primary conversion action and enable the two
campaigns. After that the daily loop (`npm run daily -- --client <client> --auto-apply`)
runs unattended. The scripts fail fast with actionable messages if a step is skipped
(e.g. unfilled `customer_id`, or running `daily` before `bootstrap`).

## How to execute

1. **Authenticate.** See `credentials.md`. The scripts authenticate with a
   **service account** by default (mint a token from the JSON key via
   `google-auth-library`, call the REST API directly), falling back to an OAuth
   refresh token only if no SA key is present. The fiddly parts: the developer
   token, the `login-customer-id` (MCC) vs `customer-id` (client) distinction, and
   adding the **service-account email as a user** on the client account (which has a
   known intermittent bug — verify it per account). No Google Workspace is needed:
   the SA gets direct access, so there's no JWT impersonation. Read it before
   touching the scripts.
2. **Read before write.** Run the read queries in `gaql.md` to pull the
   current state (campaigns, ad groups, search terms, spend, conversions) before
   mutating anything. Every cost field is in **micros** — divide by 1,000,000.
3. **Mutate.** Use the operations in `operations.md` (create ad group,
   add exact keyword, add negatives, create RSA). All writes go through the
   authenticated REST/gRPC API.
4. **Run the loop.** The root-level TypeScript files implement each step:
   - `client.ts` — auth bootstrap, shared by all scripts.
   - `config.ts` — per-client config loading and validation.
   - `bootstrap_campaigns.ts` — one-time: create the TESTING + WINNERS campaigns,
     budgets, the seed ad group, and a generic RSA in that ad group (an ad group
     with keywords but no ad never serves) on a fresh account; writes the new IDs
     back into `clients/<client>.json` so the rest of the loop runs with no manual
     edits. The seed RSA uses the client's `promotion` copy and exists only so
     TESTING can serve — winners still get their own keyword-tuned RSA on promote.
   - `daily.ts` — scheduled orchestration with JSON logs and policy-gated writes.
   - `seed_keywords.ts` — add broad/phrase seeds to TESTING and pre-load brand-safety negatives.
   - `find_winners.ts` — converting search terms in TESTING.
   - `find_waste.ts` — wasted-spend search terms in TESTING.
   - `promote_winner.ts` — the full promotion transaction (4a–4d).
   - `prune_winners.ts` — daily ad-group negatives in WINNERS.

   Run `find_*` to produce a candidate list, have a human (or a policy gate)
   approve, then run `promote_winner` / `prune_winners`. Mutations are not reversible
   cheaply, so default to surfacing the diff and asking before applying at scale.

## Important constraints & gotchas

- **API version:** target **v24** (current major as of mid-2026; v24.x minor
  releases ship monthly). Endpoints are versioned in the URL path
  (`/v24/customers/...`). Field names occasionally move between major versions —
  if a query/mutation errors on an unknown field, check the live field reference
  for the version you're on before assuming the script is wrong.
- **Google's official Google Ads MCP server is READ-ONLY.** It is great for the
  reporting/read half of this loop, but it **cannot** create ad groups, add
  keywords, or add negatives. All mutations must go through the authenticated REST
  API (the scripts here). The canonical pattern: MCP/reads for analysis, REST for
  writes, human or policy gate in between.
- **search_term_view is incomplete.** Google withholds roughly half of search terms
  for privacy, so term-level metrics won't sum to ad-group totals. Decisions are
  still sound, but never assume you're seeing 100% of traffic.
- **Customer IDs have no dashes** in API calls (`1234567890`, not `123-456-7890`),
  or you get `INVALID_CUSTOMER_ID`.
- **Per client = new GCP project + new credentials.** Keep one Google Cloud project
  (and its own **service account / key**) per client account; don't mix credentials
  from multiple projects in one config. Grant each client's SA email access on that
  client's Ads account.
- **Negative-keyword conflicts are silent.** The API will happily let you negate a
  term that blocks an active positive keyword. Always run the guard in step 4.
- The account will look messy mid-build (auto-created keywords, Google rewriting
  things). Part of this skill's job is to normalize structure: TESTING ad groups
  hold broad seeds; each WINNERS ad group holds exactly one EXACT keyword plus its
  growing negative list.
