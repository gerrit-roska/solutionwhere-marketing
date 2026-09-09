# GAQL Read Queries

All reads go through `GoogleAdsService.searchStream` (or `search`). The query
language is GAQL — SQL-like, single resource per `FROM`, conditions are AND-joined
(no `OR`; use `IN`), no arithmetic (do math client-side), no aliases.

**Micros:** every `*_micros` field is in millionths of the currency unit. Divide by
1,000,000. `96810000` = `$96.81`.

**Enums in WHERE** use string names: `'ENABLED'`, `'EXACT'`, not numeric codes.

Use `searchStream` for anything that can return many rows — one streamed call
instead of paginating.

---

## 0. Confirm tracking is live

Before optimizing, make sure conversions are actually being recorded.

```sql
SELECT
  customer.id,
  customer.conversion_tracking_setting.conversion_tracking_status,
  customer.auto_tagging_enabled
FROM customer
```

List the conversion actions so you target the right one:

```sql
SELECT
  conversion_action.id,
  conversion_action.name,
  conversion_action.status,
  conversion_action.type,
  conversion_action.primary_for_goal
FROM conversion_action
WHERE conversion_action.status = 'ENABLED'
```

## 1. Map the account (campaigns → ad groups)

```sql
SELECT
  campaign.id, campaign.name, campaign.status,
  campaign.advertising_channel_type, campaign.bidding_strategy_type
FROM campaign
WHERE campaign.advertising_channel_type = 'SEARCH'
  AND campaign.status != 'REMOVED'
```

```sql
SELECT
  campaign.name, ad_group.id, ad_group.name, ad_group.status
FROM ad_group
WHERE campaign.status = 'ENABLED' AND ad_group.status != 'REMOVED'
```

## 2. FIND WINNERS — converting search terms in TESTING

This is step 1 of the loop. Filter to the TESTING campaign and surface terms that
converted. (Replace the campaign name; or filter by `campaign.id`.)

```sql
SELECT
  search_term_view.search_term,
  segments.keyword.info.text,
  segments.keyword.info.match_type,
  campaign.name, ad_group.name,
  metrics.clicks, metrics.impressions,
  metrics.cost_micros, metrics.conversions
FROM search_term_view
WHERE campaign.name = 'TESTING'
  AND segments.date DURING LAST_30_DAYS
  AND metrics.conversions > 0
ORDER BY metrics.conversions DESC
```

A "winner" is a term with conversions at an acceptable cost-per-conversion. Decide
the threshold from the client's economics (target CPA). Cost per conversion =
`cost_micros / 1e6 / conversions` (compute client-side).

## 3. FIND WASTE — spend with no conversions in TESTING

Step 3 of the loop. Terms that have burned budget without converting → negative them.

```sql
SELECT
  search_term_view.search_term,
  campaign.name, ad_group.name,
  metrics.clicks, metrics.cost_micros, metrics.conversions
FROM search_term_view
WHERE campaign.name = 'TESTING'
  AND segments.date DURING LAST_30_DAYS
  AND metrics.conversions = 0
  AND metrics.cost_micros > 10000000   -- > $10 spent, no conversions (tune this)
ORDER BY metrics.cost_micros DESC
```

The `cost_micros` floor is your patience threshold — how much you'll let a term
spend before declaring it dead. Tune per client and per how deep the conversion
action is (deep conversions need a higher floor because they're rarer).

## 4. PRUNE WINNERS — close-variant leakage in WINNERS ad groups

Step 4 of the loop, run per WINNERS ad group. "Exact match" still serves close
variants; this finds the variants so you can negate everything that isn't the
target phrase.

```sql
SELECT
  search_term_view.search_term,
  ad_group.id, ad_group.name,
  ad_group_criterion.keyword.text,        -- the matched (target) keyword
  metrics.clicks, metrics.cost_micros, metrics.conversions
FROM search_term_view
WHERE ad_group.id = AD_GROUP_ID
  AND segments.date DURING LAST_30_DAYS
ORDER BY metrics.cost_micros DESC
```

For each row where `search_term_view.search_term` ≠ the ad group's target phrase,
add an EXACT **ad-group-level** negative for that served term. Skip rows whose term
equals the target (never negate your own winner).

## 5. Existing keywords (audit / dedupe)

To see what's actually in an ad group (and whether items are positive or negative):

```sql
SELECT
  campaign.name, ad_group.name,
  ad_group_criterion.keyword.text,
  ad_group_criterion.keyword.match_type,
  ad_group_criterion.negative,            -- true = negative keyword
  ad_group_criterion.status,
  metrics.clicks, metrics.cost_micros, metrics.conversions
FROM keyword_view
WHERE ad_group.id = AD_GROUP_ID
  AND segments.date DURING LAST_30_DAYS
```

`ad_group_criterion.negative = true` → it's a negative keyword. A WINNERS ad group
should show exactly one positive EXACT keyword plus a growing list of negatives.

## 6. Existing negatives at the campaign level (TESTING)

```sql
SELECT
  campaign.name,
  campaign_criterion.keyword.text,
  campaign_criterion.keyword.match_type,
  campaign_criterion.negative
FROM campaign_criterion
WHERE campaign.name = 'TESTING'
  AND campaign_criterion.negative = true
  AND campaign_criterion.type = 'KEYWORD'
```

Query this before promoting/negating so you don't add duplicates.

---

### Notes

- `search_term_view` only exposes ~half of search terms (privacy thresholds), so its
  metrics won't sum to ad-group totals. Decisions are still valid; coverage isn't 100%.
- Adding a segment (e.g. `segments.date`, `segments.keyword.info.match_type`) splits
  rows by that segment. Drop segments when you want aggregated rows.
- Default queries exclude `REMOVED` entities. Add them explicitly with
  `... IN ('ENABLED','PAUSED','REMOVED')` if you need history.
