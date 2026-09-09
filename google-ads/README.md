# Solutionwhere — Google Ads agent

**Account:** `202-304-8623` — reached via manager `5538233519`

## What this is

A complete **google-ads-search-manager** agent in the standard fleet layout: the full
TypeScript engine + docs (`SKILL.md` strategy, `RUNBOOK.md`, `credentials.md`,
`gaql.md`, `operations.md`) + this client's config at `clients/solutionwhere.json` and
seeds at `seeds/solutionwhere.json`. Produced by the google-ads-agent factory (one intake,
zero engine edits). Read `SKILL.md` before touching anything.

## Knobs (and why)

| Knob | Value | Notes |
|---|---|---|
| `target_cpa` | $500 (provisional) | No conversion tracking at scaffold time, so no measured CPA exists — this is a promotion GATE (which converting terms qualify as Winners), not a bid. Recalibrate ~2 weeks after the conversion action records, then flip bidding to MAXIMIZE_CONVERSIONS. |
| `waste_min_spend` | $25 | A term that spends this with zero conversions gets negated. |
| `lookback_days` | 30 | GAQL window for winners/waste/prune. |
| `daily_budget` | $15/campaign | Set at bootstrap for BOTH campaigns. |
| `bidding` | MAXIMIZE_CLICKS | Safe pre-tracking default; switch to MAXIMIZE_CONVERSIONS once conversions record. |

## Keywords

`seeds/solutionwhere.json`: **2 broad / 25 phrase / 50 negatives**
(fleet range: ~90–130 broad). Broad match self-expands — the daily loop's winners/waste
mechanics do the real optimization; re-seed only for a new product angle.

## Connect + run (nothing talks to Google until .env is filled)

1. Rotate/collect the developer token; create this client's GCP project + service
   account (one per client), download the JSON key. See `credentials.md`.
2. Invite the SA email: Google Ads → Admin → Access and security → Users (Standard);
   optionally GSC → Settings → Users and permissions (Restricted) for keyword mining.
3. `cp .env.example .env` and fill NAMES (values never committed).
4. `npm install`, then the canonical 3-command onboarding (from SKILL.md):

```bash
npm run winners   -- --client solutionwhere                    # 1. auth smoke (read-only)
npm run bootstrap -- --client solutionwhere --daily-budget 15 --apply   # 2. campaigns created PAUSED, ids auto-written
npm run seed      -- --client solutionwhere --seeds seeds/solutionwhere.json --apply         # 3. load seeds + negatives
# Then a HUMAN sets the primary conversion action + enables the campaigns in the UI.
npm run daily -- --client solutionwhere                        # daily loop, validateOnly (no writes)
```

**Safety:** campaigns are created PAUSED (only a human enables them); every write is
`validateOnly` unless `--apply`; winner/waste changes only after review sign-off.
Pod/cron deploy comes LAST, after the loop works locally.

## Root dashboard service

```bash
cd ../..
npm run dashboard
```

The deployable dashboard lives at the client root and is copied from Eden.
This job can add Google Ads routes/modules there as the shared dashboard evolves.

## Job-local offline report (read-only, after bootstrap + .env)

```bash
npm run report -- --client solutionwhere   # GAQL snapshot -> dashboard/data.json + dashboard/report.html
# Open dashboard/report.html from disk, or use the legacy local report server if needed.
```

Reports spend, conversions, CPA vs the $500 target, campaign status, and the
winner/waste candidate lists over the 30-day window. Zero mutations.
Branding comes from the `dashboard` block in `clients/solutionwhere.json` (clean white/black
when unset); generated artifacts are gitignored and rebuilt by each report run (cron-able).

## Go-live checklist (fill owners at intake)

1. Billing healthy on the account (no payment banners)
2. Conversion action instrumented and RECORDING → then flip bidding to MAXIMIZE_CONVERSIONS
3. Credentials minted (dev token + SA) and `.env` filled
4. Bootstrap + seed run (PAUSED)
5. Review decisions signed off (existing campaigns' fate, landing page, budget ceiling)

## Questions for the account owner

- Existing campaigns: pause, run parallel, or absorb their budget?
- Which landing page converts for this intent?
- Budget ceiling across all campaigns?
- Due date?
