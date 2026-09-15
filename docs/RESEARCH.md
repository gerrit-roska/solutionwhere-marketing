# RESEARCH.md — Solutionwhere agent build decisions

Research pass for the four-agent build. Everything below traces to a spec in
this folder or a measured reference system in the fleet. Decisions are
recorded so the build is auditable.

## Source specs (this folder)

| Doc | Governs |
|---|---|
| `03-google-ads-execution.md` | Google Ads agent: 8 campaigns, 5 shared negative lists, RSA copy, geo bid modifiers, $13K/yr pacing |
| `04-meta-ads-execution.md` | Meta agent: Andromeda creative-volume loop, 6 personas × 8 angles, CAPI |
| `05-seo-aeo-execution.md` | SEO/AEO agent: 50-state program, vs/compare/alternatives pages, playbooks |
| `06-cold-email-execution.md` | Cold email: list build, title dictionary, verification, 4 module sequences, wave tiers |
| `07-graphed-platform-execution.md` | Platform: jobs, warehouse, storage, alerts |
| `08-keyword-research.md` | Measured volumes — the only keyword source of truth |

## Reference systems studied

| System | What was taken |
|---|---|
| `~/Dev/graphed/agents/loman/src/fb/` | HeyGen-via-Graphed-tools wrapper shape (`heygen:videos.avatar_iv`, script + avatarId look id, caption as `{file_format:"srt"}`), creative-daily job shape, vision QA loop, destination-URL normalization |
| `~/Dev/graphed/agents/get_built/fb-ads/generators.py` | Statics = img2img remix of a reference image set (`generate_current_ad_remixes`): rotate references, style-variant prompt, QA rounds, logo compositing |
| `~/Dev/graphed/agents/conduit/jobs/google-ads/src/` | Google Ads REST v24 direct (no Opteo lib), service-account auth, `--apply`-gated writes, validate-only default, PAUSED-first creation, adopt-before-create bootstrap |

## Graphed Tools verified available (2026-09-15)

| Tool | Cost | Use |
|---|---|---|
| `serper:search` | 0.115 cr/search | Website resolution for the cold-email list (FDE-530 fix) |
| `heygen:videos.avatar_iv` | 7.67 cr/sec | Talking-head videos (Meta agent) |
| `heygen:videos.avatar_iii` | 1.92 cr/sec | Cheaper engine if IV quality not needed |
| `heygen:avatars.looks` | free | Avatar discovery |
| `kie:nano-banana-2` | 4.6 cr/img | Statics img2img remix (Gemini 3.1 Flash Image) |
| `kie:gpt-image-2-image-to-image` | 3.45 cr/img | Alternate img2img |
| `dataforseo:serp.google.organic.live.advanced` | per call | Keyword refresh (already wired in keyword-refresh job) |

## HeyGen cast decision

The Graphed HeyGen account contains exactly one cast: **Dante** — 20 looks
(Office ×11, Living Room ×6, Kitchen ×3), all male, all `photo_avatar`,
all supporting avatar_iii/iv/v.

**Pick: `Dante Office 1`** — id `938fe631f5b04423b89d015f82f4b5af`,
default voice `2972064a039c4402a568b3d2c798fe5a`, landscape 1920×1080.
Office setting matches the district-administrator buyer; the kitchen/living-room
looks are wrong for B2B education.

Future upgrade (needs client): a digital twin of a real Solutionwhere
persona (e.g. a founder or AE) recorded in HeyGen — more credible than a
stock face for a 30-year company whose positioning is "real humans answer
the phone". Logged as a client-optional item, not a blocker.

## Meta reference images

`clients/fb/assets/reference_image/product_images/` — five real screenshots
captured 2026-09-15 from the live marketing site (home, professional-development,
enrollments, coaching, referrals). These are the base images the statics
pipeline remixes (get_built pattern). When Benjamin's team supplies real
product UI screenshots of Wisdomwhere, they drop into the same folder and
take over via rotation.

## Google Ads access state

Customer ID `202-304-8623` (real, from `02-ad-account-access.md`), MCC login
customer ID present in the access doc. Developer token / service account:
**not yet provisioned** (Linear FDE-526). Engine is built validate-only and
the cron stays commented out of `graphed.yaml` until the token lands —
consistent with the manifest rule "blocked capabilities stay OUT, no
far-future-cron parking".

## What was deliberately NOT built

- No factory engines (Gerrit's call, FDE-533): both ad agents are hand-rolled
  in `packages/core/src/` following the reference systems above.
- No Instantly send job: sequencer-sync stays out until the paid plan +
  domains + 3-week warmup land (06 §5).
- No Meta publish path: creatives are generated for human review only;
  `fb-upload-drafts`/`fb-manage-daily` wait for the Business Manager assets
  (02 §Meta).

## First creative batch (2026-09-15)

The `--review` flag was swallowed by the nested npm workspace proxy
(`npm run … -- --review` appended the flag to the *inner* `npm run`, which
dropped it), so the first run executed uncapped and was killed after
17 assets: **8 HeyGen videos + 9 Kie statics** (P1-A4…P2-A1 pairs), all
`status=generated` in `fb_creatives`, files under
`creatives/2026-09-15/` in project storage. That overshoots the planned
3+2 review batch — plenty for the client show-and-tell, at roughly
8×~230 cr video + 9×4.6 cr static spend.

Fixes applied:
- Root `package.json` job proxies now end with ` --` so user flags land
  after the inner `--` and reach the job script.
- The killed run never reached the `creatives.csv` append (it runs after
  the loop), so the CSV manifest is missing these 17 rows. `fb_creatives`
  is the ledger of record; the future upload job should read from the DB,
  not the CSV.
