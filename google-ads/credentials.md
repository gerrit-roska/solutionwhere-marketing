# Credentials & Authentication

There is **no single "API key."** You assemble a few pieces across two consoles
(Google Ads + Google Cloud). The scripts here authenticate with a **service account**
by default (best for an unattended Railway agent), and fall back to an OAuth refresh
token if no service-account key is present.

> Why not the Opteo `google-ads-api` Node library? It only supports the OAuth
> refresh-token flow and has no native service-account path. So these scripts call
> the Google Ads **REST API** directly and mint the access token from the service
> account via `google-auth-library`.

## The pieces you need

| Piece | Where it lives | What it is |
|---|---|---|
| **Developer token** | Google Ads **manager (MCC)** account → API Center | 22-char string identifying your app. Starts at **Test** access; apply for **Basic** access before it works on real spending accounts. |
| **GCP project** | Google Cloud Console | Hosts the service account. **One project per client.** Enable the **Google Ads API** in it. |
| **Service account + JSON key** | GCP → IAM & Admin → Service Accounts | App-owned identity. No human consent step; ideal for cron/Railway. |
| **`login-customer-id`** | = your MCC's 10-digit ID | Header on every call when you reach a client account *through* the manager. |
| **`customer-id`** | = the client's 10-digit account ID | The account you actually read/write. |

OAuth scope used internally: `https://www.googleapis.com/auth/adwords`
**Format rule:** strip dashes from customer IDs (the scripts do this for you).
**`login-customer-id` = the MCC**, not the client — otherwise `USER_PERMISSION_DENIED`.

## Service account setup (primary path)

1. In the client's GCP project, **enable the Google Ads API**.
2. Create a **service account**; create a **JSON key** and download it. Note the
   service-account **email** (`...@<project>.iam.gserviceaccount.com`).
3. In the **client's** Google Ads account: Admin → **Access and security** → Users →
   **+** → enter the **service-account email** → set access level → **Add**.
   - Admin-level API work may require upgrading the SA's access to **Admin** (use the
     access-level dropdown next to the SA after adding it).
4. Make sure the client account is linked under your **MCC** so `login-customer-id`
   (the MCC) grants access.

That's it. Because the SA is granted **direct** access in step 3, the JWT needs **no
`sub`/subject** (no impersonation) — and therefore **no Google Workspace is
required**. Workspace/domain-wide delegation is only needed if you impersonate a
human user, which we don't.

### The known snag (verify per account)

There has been a standing bug where Google Ads **rejects adding a service-account
email as a user** on some accounts — the invite won't accept the SA address. It
isn't on a published fix roadmap and its status changes over time, so **test step 3
on the specific client account first.** If it's blocked, use the refresh-token
fallback below; everything else (the scripts, the loop) is identical.

## Providing the key to the scripts

Pick one (the client auto-detects, preferring the service account):

```bash
# Option A — inline JSON (Railway-friendly: paste the whole key file as one secret)
GOOGLE_ADS_SA_KEY_JSON='{"type":"service_account","project_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...","client_email":"...@...gserviceaccount.com", ...}'

# Option B — key file on disk
GOOGLE_APPLICATION_CREDENTIALS=/secrets/google-ads-sa.json
```

Always also set:

```bash
GOOGLE_ADS_DEVELOPER_TOKEN=...            # from MCC API Center (Basic access)
```

When you run with `--client <client>`, `GOOGLE_ADS_LOGIN_CUSTOMER_ID` and
`GOOGLE_ADS_CUSTOMER_ID` come from `clients/<client>.json`. You can still set them
directly for legacy/manual runs without a client config.

> On Railway, store `GOOGLE_ADS_SA_KEY_JSON` as a single multiline secret. Keep its
> `\n`-escaped `private_key` intact — `JSON.parse` restores the newlines.

## Refresh-token fallback (only if the SA-as-user step is blocked)

```bash
GOOGLE_ADS_CLIENT_ID=...        # GCP OAuth client
GOOGLE_ADS_CLIENT_SECRET=...
GOOGLE_ADS_REFRESH_TOKEN=...    # generated once, /adwords scope (Opteo token helper works)
# plus the three always-required vars above
```

Authorize the refresh token with a stable ops account that has MCC access, not a
personal login (refresh tokens break when the authorizing user loses access).

## Per-client onboarding checklist

1. New GCP project for the client; enable the Google Ads API.
2. Create the service account + JSON key in that project.
3. Link the client's Ads account under your MCC.
4. Add the SA email as a user on the client account (confirm the bug above doesn't
   block it; if it does, fall back to a refresh token).
5. Copy `clients/example.json` to `clients/<client>.json` and fill in non-secret
   values: customer IDs, campaign IDs/names, thresholds, landing page, and RSA copy.
6. Store secrets per client in the deployment environment, keyed by `customer_id`.
7. Smoke-test before any mutation (below).

## Smoke test

```bash
# With env set, run a trivial read. If this returns the campaign list, auth works.
npm run winners -- --client conduit    # harmless read using client defaults
```

Or hit REST directly with a service-account token from gcloud:

```bash
ACCESS_TOKEN=$(gcloud auth print-access-token \
  --impersonate-service-account=SA_EMAIL \
  --scopes=https://www.googleapis.com/auth/adwords)

curl -s -X POST \
  "https://googleads.googleapis.com/v24/customers/${GOOGLE_ADS_CUSTOMER_ID}/googleAds:searchStream" \
  -H "Authorization: Bearer ${ACCESS_TOKEN}" \
  -H "developer-token: ${GOOGLE_ADS_DEVELOPER_TOKEN}" \
  -H "login-customer-id: ${GOOGLE_ADS_LOGIN_CUSTOMER_ID}" \
  -H "Content-Type: application/json" \
  --data '{"query":"SELECT campaign.id, campaign.name FROM campaign ORDER BY campaign.id"}'
```
