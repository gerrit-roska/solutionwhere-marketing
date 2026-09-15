# Conversion Tracking Implementation Spec — Solutionwhere

**For:** Benjamin Waxman
**From:** Graphed
**Target site:** `home.solutionwhere.com` (Next.js on Vercel)
**Date:** August 24, 2026

---

## How to use this document

Paste this entire file into Claude Code or Codex in the repo for the marketing site and tell it to implement it. It is written to be executed by a coding agent without further interpretation. Nothing here requires a call with us.

When it's done, tell us and we'll verify from our side before any ads run.

---

## Why this is first

We audited `home.solutionwhere.com` on August 24. It currently has **no analytics or tracking of any kind** — no GA4, no Google Tag Manager, no Meta pixel, no LinkedIn insight tag.

Your GTM container `GTM-KVFXB4S` exists, but it is installed only on the legacy `solutionwhere.com/corp` site, which is not where traffic goes.

Until this is fixed, no ad platform can optimize and no spend can be attributed. This blocks everything else.

---

## What we need you to create first

Two accounts, both free, both about ten minutes. We need these before the code below can be finished, because the code needs their IDs.

| Account | Where | What we need back |
|---|---|---|
| Google Analytics 4 property for `home.solutionwhere.com` | analytics.google.com | Measurement ID, format `G-XXXXXXXXXX` |
| Meta Business Manager + pixel | business.facebook.com | Pixel ID, ~15 digits |

You may reuse the existing GTM container `GTM-KVFXB4S` rather than creating a new one — we'd actually prefer it, since it keeps both sites in one place. We just need to be added to it.

Access instructions for all of these are in the companion document `02-ad-account-access.md`.

---

## Part 1 — Install Google Tag Manager

Everything else loads through GTM so that we can add and change tags later without touching your codebase again. This is deliberate: after this one implementation, you should never need to ship code for a marketing tag.

### App Router (`app/layout.tsx`)

```tsx
import Script from 'next/script'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script id="gtm" strategy="afterInteractive">{`
          (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
          new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
          j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
          'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
          })(window,document,'script','dataLayer','GTM-KVFXB4S');
        `}</Script>
      </head>
      <body>
        <noscript>
          <iframe
            src="https://www.googletagmanager.com/ns.html?id=GTM-KVFXB4S"
            height="0" width="0" style={{ display: 'none', visibility: 'hidden' }}
          />
        </noscript>
        {children}
      </body>
    </html>
  )
}
```

If the site uses the Pages Router instead, put the inline script in `pages/_document.tsx` inside `<Head>` and the `<noscript>` iframe immediately after `<body>`.

### Initialize the dataLayer before GTM loads

Add this as the **first** script in `<head>`, above the GTM snippet, so no early events are lost:

```tsx
<Script id="datalayer-init" strategy="beforeInteractive">{`
  window.dataLayer = window.dataLayer || [];
`}</Script>
```

---

## Part 2 — Push the conversion events

Four events. Push each to `window.dataLayer` at the moment described. We configure the ad-platform tags on our side from these — you do not need to add GA4, Meta, or LinkedIn code yourself.

Create `lib/analytics.ts`:

```ts
type DataLayerEvent = Record<string, unknown> & { event: string }

export function track(payload: DataLayerEvent) {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  window.dataLayer.push(payload)
}

declare global {
  interface Window {
    dataLayer: Record<string, unknown>[]
  }
}
```

### Event 1 — `demo_request` (primary conversion)

Fire **only on a confirmed successful submission** of the `/demo` form — after the API responds OK, not on button click. A click-fired conversion counts failed and duplicate submits and will corrupt optimization on every channel.

```ts
import { track } from '@/lib/analytics'

// inside the submit handler, after the API call succeeds:
track({
  event: 'demo_request',
  module_interest: formData.module || 'not_specified', // the "What are you looking at?" select
  role: formData.role || 'not_specified',
  organization: formData.organization,
  has_phone: Boolean(formData.phone),
})
```

`module_interest` is important — it is how we learn which of the four modules actually drives pipeline, which decides budget allocation in Q1. Pass the raw select value; don't normalize it.

**Do not** put the email address or phone number into the dataLayer. Those go to the ad platforms through server-side hashed matching, which we configure separately.

### Event 2 — `phone_click`

`231-935-3000` appears in the header, footer, and on `/demo`. In this buyer segment, phone calls are a real conversion path.

Make every phone number a proper `tel:` link and attach:

```tsx
<a
  href="tel:+12319353000"
  onClick={() => track({ event: 'phone_click', location: 'header' })}
>
  231-935-3000
</a>
```

Set `location` to `header`, `footer`, `demo_page`, or `module_page` per placement.

### Event 3 — `module_page_view`

On each of `/professional-development`, `/enrollments`, `/coaching`, `/referrals`:

```ts
useEffect(() => {
  track({ event: 'module_page_view', module: 'professional_development' })
}, [])
```

Use exactly: `professional_development`, `enrollments`, `coaching`, `referrals`.

These build the retargeting audiences. Someone who reads the whole enrollment page is worth showing an enrollment ad to; someone who bounced off the homepage is not.

### Event 4 — `login_click` (negative signal — do not skip this)

```tsx
<a href={LOGIN_URL} onClick={() => track({ event: 'login_click' })}>Login</a>
```

This one matters more than it looks. You have a large installed base and a Login link in the global nav, so a significant share of your site traffic is **existing customers, not prospects**. If we don't tag them, they end up in every retargeting audience and every lookalike, and paid performance will look better than it is while spending money advertising to people who already pay you.

We use this event to build an exclusion audience. Please don't drop it.

---

## Part 3 — Add instant booking to `/demo`

Not tracking, but it belongs in the same pass because it touches the same file.

Today `/demo` is form-only. There is a gap between someone deciding they want a demo and anyone actually calling them back. Adding a "pick a time now" option next to the form typically produces a meaningful lift in demos actually held, because it removes the callback lag.

Keep the form — some buyers prefer it, and the module picker is valuable. Add booking as a parallel path:

```tsx
track({
  event: 'demo_booked',
  module_interest: selectedModule || 'not_specified',
})
```

Fire on the calendar tool's booking-confirmed callback. If you don't have a scheduler yet, tell us and we'll recommend one that fits the AE's calendar.

---

## Part 4 — Verification

Before telling us it's done, confirm all of these:

- [ ] GTM container loads on every page (GTM Preview mode connects)
- [ ] `demo_request` fires once on a real successful submit, and **not** on a failed one
- [ ] `module_interest` carries the correct value from the select
- [ ] `phone_click` fires from header, footer, and `/demo`
- [ ] All four `module_page_view` events fire with correct module values
- [ ] `login_click` fires
- [ ] No email addresses or phone numbers appear anywhere in the dataLayer
- [ ] No console errors on any page
- [ ] Test with an ad blocker on — confirm the site still works (tags will be blocked; that's expected)

Submit one real test demo request. We'll confirm it lands in GA4 from our side.

---

## Part 5 — What we do once this is live

You don't need to action any of this; it's here so you know where the handoff sits.

1. Configure GA4 conversions from the dataLayer events
2. Install Google Ads conversion tracking and import `demo_request`
3. Install the Meta pixel with Conversions API for server-side matching
4. Install the LinkedIn insight tag
5. Build audiences: module viewers, form abandoners, and the `login_click` exclusion
6. Connect GA4 and both ad platforms into Graphed for reporting

Expect this to take us a day or two after your side is done.

---

## One thing to decide separately

The marketing site is on `home.solutionwhere.com` while thirty years of links point at `solutionwhere.com`. Google treats those as separate properties, so the new site inherits close to none of that authority.

We think this is fixable without touching legacy customer hosting: serve the Vercel site from the root domain via path-based rewrites, and leave `/ww/*` and other legacy application paths routed to Rackspace exactly as they are now. Nothing changes for existing customers.

It's the highest-leverage change available and it gets more expensive the longer the subdomain accumulates its own links. Worth a short conversation — it's a bigger lever than the first several months of ad spend.
