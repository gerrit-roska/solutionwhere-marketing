# Ad Account Setup & Access — Solutionwhere

**For:** Benjamin Waxman
**From:** Graphed
**Date:** August 24, 2026

---

## What this covers

Creating the four accounts we need, and granting Graphed access to each. Roughly 45 minutes total, all of it in web UIs.

**Create the accounts yourself, then grant us access.** You stay the owner of everything. We configure the API keys, pixels, conversion actions, and campaign infrastructure on our side, and hand you working accounts. There's no need for us to pair on any of it.

> **Note for Graphed:** the four access values below are filled. The LinkedIn Business Manager name is still needed (marked `⟨FILL⟩`) — LinkedIn is optional and not one of the first four channels.

| What we need | Value |
|---|---|
| Graphed Google Ads manager (MCC) ID | `553-823-3519` |
| Graphed Meta Business Manager ID | `1649892969436760` |
| Graphed access email | `admin@graphed.com` |
| Graphed LinkedIn Business Manager name | `⟨FILL⟩` |

---

## 1. Google Ads

### Create

1. Go to [ads.google.com](https://ads.google.com) and sign in with an account you control long-term — **not a personal Gmail, and not an employee's individual account**. A shared address like `marketing@solutionwhere.com` is ideal. Ad accounts are painful to migrate later.
2. When prompted to create your first campaign, look for **"Switch to Expert Mode"** and then **"Create an account without a campaign."** If you go through the guided flow, Google will start spending money on a badly-structured Smart campaign.
3. Set:
   - Billing country: **United States**
   - Currency: **USD** — *cannot be changed later*
   - Time zone: **Eastern Time** (matches your support hours and your buyers)
4. Add billing details. Nothing will spend until we launch campaigns, and we won't launch until tracking is verified.
5. Note the **Customer ID** in the top right, format `123-456-7890`.

### Grant access

1. **Tools & Settings** → **Setup** → **Access and security**
2. **Managers** tab → **+** button
3. Enter Graphed's manager account ID: **`553-823-3519`**
4. Send the request

We'll accept it, and you'll retain full ownership and the ability to revoke at any time.

### Currency and time zone are permanent

Worth repeating because it's the most common irreversible mistake at this step. If either is set wrong, the fix is a new account and a total loss of historical data.

---

## 2. Meta (Facebook) Business Manager

### Create

1. Go to [business.facebook.com](https://business.facebook.com) → **Create account**
2. Business name: **Solutionwhere, Inc.** Use a work email.
3. **Business Settings** → **Accounts** → **Pages** → add or claim the Solutionwhere Facebook Page. If there isn't one, create it — a pixel can run without a Page, but ads cannot.
4. **Business Settings** → **Accounts** → **Ad Accounts** → **Add** → **Create a new ad account**
   - Name: `Solutionwhere - Primary`
   - Time zone: **Eastern Time** — *cannot be changed later*
   - Currency: **USD** — *cannot be changed later*
5. **Business Settings** → **Data Sources** → **Datasets/Pixels** → **Add**
   - Name: `Solutionwhere Web`
   - Note the **Pixel ID** (~15 digits) — this goes into the tracking spec
6. Add a payment method under **Billing**.

### Grant access

1. **Business Settings** → **Users** → **Partners** → **Add** → **Give a partner access to your assets**
2. Enter Graphed's Business ID: **`1649892969436760`**
3. Assign these assets with these permission levels:

| Asset | Permission |
|---|---|
| Ad account `Solutionwhere - Primary` | **Manage ad account** (full control) |
| Pixel `Solutionwhere Web` | **Manage pixel** |
| Facebook Page | **Manage Page** — needed so ads can run under your brand |

**Partner access, not individual user access.** Partner access survives staff changes on both sides and is revoked in one click. Adding individuals by email creates a mess in a year.

---

## 3. Google Analytics 4

### Create

1. [analytics.google.com](https://analytics.google.com) → **Admin** → **Create** → **Property**
2. Property name: `Solutionwhere`, time zone **Eastern**, currency **USD**
3. Platform: **Web**. Stream URL: `https://home.solutionwhere.com`, stream name `Solutionwhere Marketing Site`

   *If you implement the root-domain change we recommended, tell us — the stream URL needs updating and we'd rather do it deliberately than discover it later.*
4. Copy the **Measurement ID** (`G-XXXXXXXXXX`) — this goes into the tracking spec

### Grant access

**Admin** → **Property access management** → **+** → add **`admin@graphed.com`** with the **Editor** role.

---

## 4. Google Tag Manager

You already have container **`GTM-KVFXB4S`**, currently installed on the legacy `/corp` site. We'd like to reuse it rather than create a second one — one container across both sites is easier to reason about and avoids double-firing if the two ever share a page.

**Admin** → **Container** → **User Management** → **+** → add **`admin@graphed.com`** with:
- Container permission: **Publish**
- Account permission: **User**

If you'd rather we work in a fresh container, that's fine — create one for `home.solutionwhere.com`, send us the new ID, and we'll update the tracking spec.

---

## 5. LinkedIn Campaign Manager — optional, worth doing

Not in the first four channels, but LinkedIn is the one place where "Director of Professional Learning at a school district" is a directly targetable job title. Given your buyer, it's worth having the tag collecting audience data now even if we don't advertise there for months. Retargeting audiences take time to accumulate and you can't backfill them.

1. [linkedin.com/campaignmanager](https://www.linkedin.com/campaignmanager) → create an ad account
   - Name: `Solutionwhere`, currency **USD**, associate with the Solutionwhere LinkedIn Page
2. **Account Settings** → **Manage access** → add **`⟨FILL⟩`** as **Account Manager**

---

## 6. What we need back from you

Reply with these four values. Nothing sensitive — no passwords, no API keys, and we will never ask you for a password.

```
Google Ads Customer ID:    ___-___-____
Meta Pixel ID:             _______________
Meta Ad Account ID:        act_____________
GA4 Measurement ID:        G-__________
```

Plus confirmation of:

- [ ] Google Ads manager access request accepted
- [ ] Meta partner access granted (ad account + pixel + Page)
- [ ] GA4 Editor access granted
- [ ] GTM Publish access granted
- [ ] LinkedIn account manager access granted *(optional)*

---

## Sequence

Do these in this order — the tracking work needs the IDs from steps 2 and 3:

1. Create GA4 property → get Measurement ID
2. Create Meta Business Manager + pixel → get Pixel ID
3. Hand `01-conversion-tracking-spec.md` plus those two IDs to your coding agent
4. Create Google Ads account
5. Grant all access
6. Send us the values above

Steps 1, 2, and 4 are account creation and can be done in any order or in parallel. Step 3 is the one with a real dependency, and it's the one on the critical path — if you only get to one thing before Spain, make it steps 1, 2, and 3.

---

## Notes on ownership and security

**You own everything.** Every account is created under your business, billed to your payment method, and revocable by you in one click. We're added as a partner or manager, never as the owner.

**We will never ask you for a password.** Every grant above is a permission on your side. If anyone asks you for account credentials for Solutionwhere — us included — treat it as a red flag and check with Cody or Max directly.

**Payment methods stay yours.** Ad spend bills directly to Solutionwhere. It never passes through Graphed, so there's no markup and no reconciliation.
