# Mutation Operations

All writes go through the Google Ads **REST** `googleAds:mutate` endpoint (the
official Google Ads MCP is **read-only** and can't do any of this). The scripts send
a batch of operations that apply **atomically** (all-or-nothing):

```
POST https://googleads.googleapis.com/v24/customers/{CID}/googleAds:mutate
{ "mutateOperations": [ ...ops... ], "validateOnly": false }
```

REST field names are **camelCase** (`adGroup`, `matchType`, `costMicros`,
`finalUrls`). Resource names are `customers/{cid}/<resource>/{id}`. Pass
`"validateOnly": true` to dry-run and surface errors (including negative-keyword
conflicts) without writing. The `client.ts` `mutate(ops, validateOnly)` helper wraps
all of this.

Match-type values: `"BROAD" | "PHRASE" | "EXACT"`.

---

## A. Add BROAD seeds to TESTING (seeding)

```json
{ "adGroupCriterionOperation": { "create": {
  "adGroup": "customers/{CID}/adGroups/{TESTING_AG_ID}",
  "status": "ENABLED",
  "keyword": { "text": "landscape design", "matchType": "BROAD" }
}}}
```

## B. EXACT campaign-level negative on TESTING

Applies to all ad groups in TESTING. Used when promoting a winner and when killing
wasted spend.

```json
{ "campaignCriterionOperation": { "create": {
  "campaign": "customers/{CID}/campaigns/{TESTING_CAMPAIGN_ID}",
  "negative": true,
  "keyword": { "text": "design my backyard", "matchType": "EXACT" }
}}}
```

## C–E. Promote a winner atomically (one request)

Create the WINNERS ad group, its EXACT positive keyword, and its RSA in a single
mutate, using a **temp resource name** (`adGroups/-1`) so C/D reference the ad group
made in B. (The TESTING negative from B can ride along in the same array — that's
what `promote_winner.ts` does, making the whole promotion transactional.)

```json
[
  { "adGroupOperation": { "create": {
    "resourceName": "customers/{CID}/adGroups/-1",
    "name": "EXACT | design my backyard",
    "campaign": "customers/{CID}/campaigns/{WINNERS_CAMPAIGN_ID}",
    "status": "ENABLED",
    "type": "SEARCH_STANDARD"
  }}},
  { "adGroupCriterionOperation": { "create": {
    "adGroup": "customers/{CID}/adGroups/-1",
    "status": "ENABLED",
    "keyword": { "text": "design my backyard", "matchType": "EXACT" }
  }}},
  { "adGroupAdOperation": { "create": {
    "adGroup": "customers/{CID}/adGroups/-1",
    "status": "ENABLED",
    "ad": {
      "finalUrls": ["https://example.com/lp"],
      "responsiveSearchAd": {
        "headlines": [
          { "text": "Design My Backyard", "pinnedField": "HEADLINE_1" },
          { "text": "Design My Backyard — Free Quote" },
          { "text": "Eden Studio Landscaping" }
        ],
        "descriptions": [
          { "text": "Free landscape design consultation." },
          { "text": "Trusted local designers. Book in minutes." }
        ]
      }
    }
  }}}
]
```

RSAs need 3–15 headlines and 2–4 descriptions. Pinning the keyword headline to
`HEADLINE_1` keeps the exact target phrase always visible (CTR / Quality Score lift).

## F. EXACT ad-group-level negative on a WINNERS ad group (daily prune)

Ad-group-scoped so it only constrains this one winner. This is the exact-match
enforcement: negate every served term that isn't the target phrase.

```json
{ "adGroupCriterionOperation": { "create": {
  "adGroup": "customers/{CID}/adGroups/{WINNERS_AG_ID}",
  "negative": true,
  "keyword": { "text": "yard design", "matchType": "EXACT" }
}}}
```

**GUARD:** never negate the ad group's own target phrase (`prune_winners.ts` filters
this out).

## G. Pause / remove instead of negating

```json
{ "adGroupCriterionOperation": {
  "update": { "resourceName": "customers/{CID}/adGroupCriteria/{AG_ID}~{CRIT_ID}", "status": "PAUSED" },
  "updateMask": "status"
}}
```

Use `"remove": "customers/.../adGroupCriteria/{AG_ID}~{CRIT_ID}"` to delete entirely.

---

## Safety defaults for an autonomous agent

- **Read → diff → approve → write.** Produce candidate winner/waste/prune lists,
  surface the exact ops, and gate large batches behind human or policy approval.
- **Dedupe first.** Query existing negatives (gaql.md §6) and keywords (§5) before
  creating, or you accumulate duplicate criteria. The mutate scripts already dedupe.
- **`validateOnly: true`** dry-runs a mutation and returns the same errors as a real
  write, without applying — the default for `promote_winner.ts`.
- **Rate limits.** Standard access ≈ 15,000 requests/day; batch operations rather
  than one request per keyword (these scripts batch per ad group / per list).
