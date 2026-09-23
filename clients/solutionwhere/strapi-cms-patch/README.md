# Strapi `articles` content type — patch for `george4software/solutionwhere-cms`

Copy `src/api/article/` into the CMS repo, commit, and deploy via Strapi Cloud Git integration.

Fields match `packages/core/src/seo/cms/strapi.ts` and `clients/seo/client.config.json`.

## API token placement

| Where | Variable | Value |
|---|---|---|
| **Graphed** (SEO agent publish) | `STRAPI_API_URL`, `STRAPI_API_TOKEN` | Already in Graphed secrets |
| **Vercel** (`home.solutionwhere.com`) | `STRAPI_API_URL`, `STRAPI_API_TOKEN` | Same values — George adds in Vercel project env |
| **Strapi Cloud** | — | No token needed in Strapi itself; create tokens in Admin → Settings → API Tokens |

Do **not** commit tokens. George copies the full-access token from Strapi admin into Vercel only.

## Deploy steps (Graphed item 1)

1. Copy `src/api/article/` into `george4software/solutionwhere-cms`.
2. Replace `src/index.ts` with the patch copy (grants public `find` / `findOne` on boot).
3. Commit + push → Strapi Cloud rebuilds from Git.
4. Confirm `GET /api/articles` returns `{"data":[]}` (not 404).

## After deploy

Public `find` and `findOne` are granted in `src/index.ts` on boot. Confirm with `GET /api/articles` (no token) → `{"data":[],"meta":...}`.

Settings → Webhooks → Vercel deploy hook on Article `entry.publish` / `entry.unpublish` (see `website-strapi-patch/README.md`). That step waits on the website repo.
