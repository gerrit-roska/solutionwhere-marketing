# Runbook — daily loop

Order of operations, with dry-run defaults. Set the env vars from
`reference/credentials.md` first (service-account key via `GOOGLE_ADS_SA_KEY_JSON`
or `GOOGLE_APPLICATION_CREDENTIALS`, plus the developer token and the two customer
IDs), then `npm install`.

## Per-client config

Create one JSON config per client in `clients/<client>.json`. Start from
`clients/example.json` and fill in the non-secret account settings: customer IDs,
campaign IDs/names, thresholds, landing page, and RSA copy. The active config for
this folder is `clients/conduit.json`; campaign IDs in it are placeholders until
`npm run bootstrap` creates the campaigns and prints the real IDs.

Secrets do not belong in client config. Keep the developer token and service-account
or OAuth credentials in the environment. When a script runs with `--client`, the
config supplies `GOOGLE_ADS_CUSTOMER_ID` and `GOOGLE_ADS_LOGIN_CUSTOMER_ID` for the
shared transport.

```bash
# --- one-time per client (fresh account) ---
# 0a. Create the TESTING + WINNERS campaigns, budgets, and seed ad group.
#     Campaigns are created PAUSED on Maximize Clicks (no conversion data needed
#     to create). --apply writes the new IDs back into clients/conduit.json itself.
#     Switch to Maximize Conversions in the UI once the conversion action records.
npm run bootstrap -- --client conduit --daily-budget 50            # dry-run
npm run bootstrap -- --client conduit --daily-budget 50 --apply    # write (PAUSED)

# 0b. Seed TESTING. seeds/conduit.json is a structured set:
#       broad     -> BROAD positives in the seed ad group
#       phrase    -> PHRASE positives (competitor/conquesting terms)
#       negatives -> BROAD campaign-level negatives on TESTING (brand safety:
#                    electrical conduit, boat dock, jobs, free, docker, etc.)
npm run seed -- --client conduit --seeds seeds/conduit.json            # dry-run
npm run seed -- --client conduit --seeds seeds/conduit.json --apply    # write

# --- daily ---
# 1. Find converting terms in TESTING (target CPA, lookback days optional)
npm run winners -- --client conduit > winners.json

# 2. Promote approved winners (creates WINNERS ad group + exact kw + RSA,
#    and negates the term on TESTING). Validate first, then apply.
#    Config supplies campaign IDs, landing page URL, headline, and descriptions.
npm run promote -- --client conduit --keyword "dock scheduling software"
npm run promote -- --client conduit --keyword "dock scheduling software" --apply

# 3. Find wasted spend in TESTING, then negate it at the TESTING campaign level
npm run waste -- --client conduit > waste.json
#    map waste.json -> array of .searchTerm into terms.json, then:
npm run negate -- --client conduit --terms terms.json          # dry-run
npm run negate -- --client conduit --terms terms.json --apply  # write

# 4. Prune close-variant leakage in every WINNERS ad group
npm run prune -- --client conduit                               # dry-run
npm run prune -- --client conduit --apply                       # write
```

## Daily Hermes/Cron command

For a scheduled agent task, prefer the single daily command. By default it runs the
read-only discovery steps, writes timestamped JSON logs, and exits non-zero on auth
or API errors:

```bash
npm run daily -- --client conduit
```

For fully unattended operation, pass `--auto-apply`. This uses the client config as
the policy: promote every winner under `thresholds.target_cpa`, negate every waste
term over `thresholds.waste_min_spend`, and apply WINNERS pruning.

```bash
npm run daily -- --client conduit --auto-apply
```

Autonomous promotion skips terms that already have an `EXACT | <keyword>` ad group
in the WINNERS campaign or are already campaign-level negatives in TESTING. Waste
negation and pruning also dedupe before writing.

Default output goes to `runs/<client>/<timestamp>/`:

- `winners.json` — converting TESTING search terms under the client target CPA.
- `waste.json` — TESTING search terms over the waste threshold with zero conversions.
- `prune.json` — WINNERS ad groups with close-variant leakage to negate.
- `summary.json` — counts and whether any approved writes were applied.

Writes require explicit policy approval inputs:

```bash
npm run daily -- --client conduit \
  --approved-winners approvals/winners.json \
  --approved-waste-terms approvals/waste-terms.json \
  --apply-promotions \
  --apply-waste \
  --apply-prune
```

Approval files must be JSON arrays. Items may be strings or objects containing
`searchTerm`, `winnerKeyword`, `keyword`, or `term`:

```json
[
  "design my backyard",
  { "searchTerm": "custom patio designer" }
]
```

If an approval file is provided without its matching `--apply-*` flag, the daily
command validates/dry-runs that action and logs the result without writing.

## Approval gate

`find_winners` / `find_waste` / `prune (dry-run)` are read-only and safe to run
unattended. The three that mutate — `promote`, `negate --apply`, `prune --apply` —
should surface their diff for human or policy approval before applying at scale.
Every mutate script supports a dry-run (validate-only / no `--apply`) so you can
inspect the exact changes first.

## Where this fits the bigger system

- A shared **keyword-research agent** (DataForSEO / Keywords Everywhere, seeded with
  the brand URL) generates `seeds.json` and decides per keyword: pay for it as an ad
  (this skill) or pursue it organically (an SEO agent). Keywords are the shared
  primitive between the two.
- Google's official **Google Ads MCP** is read-only — wire it in for the analysis/
  reporting half if you want an LLM-friendly read path, but all writes stay in these
  scripts.
