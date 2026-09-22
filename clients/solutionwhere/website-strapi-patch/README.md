# Website Strapi integration — patch for `home.solutionwhere.com` repo

Copy into the Next.js site repo. Opens as a PR from `gerrit-roska` once repo access is granted.

## What this delivers (items 2–4)

| # | Deliverable | File |
|---|---|---|
| 2 | `/blog/[slug]` tries Strapi first | `app/blog/[slug]/page.tsx` |
| 3 | Falls back to legacy MDX/static posts | same file |
| 4 | Optional list merge on `/blog` | `app/blog/page.tsx` |
| — | Shared fetch helper | `lib/strapi.ts` |

Item 1 (`articles` content type) lives in `clients/solutionwhere/strapi-cms-patch/`.

## Env vars (item 5 — client adds in Vercel)

```
STRAPI_API_URL=https://natural-sharing-3a422ecc5d.strapiapp.com
STRAPI_API_TOKEN=<full-access API token from Strapi admin>
VERCEL_DEPLOY_HOOK_URL=<optional; used by Strapi webhook>
```

Server-side only — never expose `STRAPI_API_TOKEN` to the browser.

## Rebuild webhook (item 4b)

After the CMS deploys `articles`:

1. Vercel → Project → Settings → Git → **Deploy Hooks** → create hook named `strapi-publish` → copy URL.
2. Strapi admin → Settings → Webhooks → **Create new webhook**:
   - Name: `Vercel rebuild on publish`
   - URL: the Vercel deploy hook URL
   - Events: `entry.create`, `entry.update`, `entry.publish`, `entry.unpublish` on **Article**
3. Publish a test article → confirm Vercel deploy triggers.

## Public API permissions

Granted on CMS boot for Article `find` and `findOne` (`solutionwhere-cms` `src/index.ts`). The site should still send `STRAPI_API_TOKEN` server-side.
