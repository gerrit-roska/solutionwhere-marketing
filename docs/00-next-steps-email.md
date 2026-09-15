# Next Steps Email — Benjamin Waxman

**Status: DRAFT — not sent.** Fill the placeholders in `02-ad-account-access.md` first, then say the word and I'll create it as a Gmail draft.

**To:** benjy@solutionwhere.com
**Cc:** max@graphed.com
**Subject:** Solutionwhere — next steps + the three docs

---

Benjamin,

Good to meet you. Safe travels tomorrow — condolences to you and your wife.

We ran the audit right after the call. Three documents attached, and the short version is below so you can action it from an airport.

**One correction first:** our notes had the company as "Solutionware." It's Solutionwhere — we've fixed it everywhere. Flagging it because `solutionware.com` is an unrelated parked domain that's for sale, and we'd rather catch that now than build an ad account against the wrong name.

## The thing that changes the sequencing

`home.solutionwhere.com` has no tracking on it at all — no Google Analytics, no Meta pixel, nothing. Your GTM container `GTM-KVFXB4S` exists but it's only on the old `/corp` site.

So right now there's no way to attribute a conversion on any channel. This is the gate on all paid work. We flagged instrumentation on the call as a day or two of back-and-forth; that estimate holds, but it's more load-bearing than it sounded — nothing else can start until it's done.

The good news is the new site itself is well built. Clean canonicals, valid sitemap, indexable, 54 pages, and the copy is genuinely good. We're not asking you to redo any of it.

## What we need from you

Four things, in priority order. The first three are the ones worth squeezing in before you fly.

1. **Create a GA4 property and a Meta pixel** — ~20 min, step-by-step in `02-ad-account-access.md`. Send us the two IDs.
2. **Hand `01-conversion-tracking-spec.md` to your coding agent.** It's written to be pasted into Claude Code and executed without talking to us. It needs the two IDs from step 1.
3. **Create the Google Ads and Meta ad accounts** and grant us access — same doc. You own them, we're added as a partner, revocable in one click. We'll never ask you for a password.
4. **Send whatever you have** of: ICP doc, sales call transcripts, demo recordings, implementation audits. Untranscribed is fine — we'll handle it. This is what we mine for the actual language your buyers use, and it's the difference between cold email that sounds like you and cold email that sounds like every other SaaS vendor they delete.

On the two demos you had scheduled the day we spoke — if those got recorded, they're the freshest and most useful input we could get.

## What we're doing meanwhile

- Building the SEO plan against the four modules
- Building the named-account list for cold email — segmented by module, because a PD director and an enrollment director don't share a problem
- Setting up campaign infrastructure so it's ready to go the moment tracking lands

## One decision to make when you're back

Your marketing site is on `home.solutionwhere.com` while thirty years of links point at `solutionwhere.com`. Google treats those as separate properties, so the new site starts from close to zero authority.

We think it's fixable without touching legacy customer hosting — serve the marketing site from the root domain via path rewrites, and leave `/ww/*` and the other legacy paths pointed at Rackspace exactly as they are. Nothing changes for existing customers.

It's the highest-leverage change available to you and it gets more expensive the longer the subdomain accumulates its own links. Worth 15 minutes when you're back.

## Also attached

A full GTM strategy doc. The short version: your buyer universe is about 15,000 nameable accounts and it doesn't grow, so the plan is weighted toward SEO and targeted outbound rather than broad paid social — and paid spend is timed to ramp into the January–April district evaluation window rather than starting flat now. Your allowable CAC is somewhere between $5K and $25K per customer, which means the goal is reaching the right accounts, not cheap leads. We think that's the main thing the previous agency got wrong.

Read it when you have a quiet hour. Nothing in it blocks the four items above.

## NDA

Send it over whenever — we'll sign it. Everything we've discussed is siloed and we don't reference client specifics publicly without explicit written sign-off.

Cody
