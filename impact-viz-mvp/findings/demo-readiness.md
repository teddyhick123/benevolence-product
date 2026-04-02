# Demo Readiness — QA Findings

**Evaluated:** 2026-04-02
**Role:** QA engineer simulating an Executive Director of a mid-size family foundation seeing this app for the first time.

---

## Overall Demo Score: 5 / 10

_The app has a professional visual identity, a solid feature set, and real demo data on disk — but a prospect would land on an empty dashboard with no guidance, no seeded data, and no recovery path if anything goes wrong. The bones are good; the demo scaffolding is missing._

---

## 🔴 Blockers (would kill a demo on the spot)

### 1. Empty dashboard — no self-service demo data loading
The dashboard at `app/dashboard/page.tsx:58-59` renders a plain `<div className="p-6">No portfolio selected.</div>` when no portfolio is assigned. A brand-new account has zero portfolios, zero holdings, zero KPIs. Demo data exists in `db/demo_data.sql` but must be applied manually by an engineer running SQL against the database. There is no "Load demo data" button or admin UI shortcut. If a prospect creates their own account and logs in unassisted, they see a blank screen.

### 2. No password reset flow
There is no `/forgot-password` or `/reset-password` page anywhere in the app. If a demo attendee forgets their credentials or if a pre-created demo account password is lost, there is no self-service recovery path. Only a Supabase dashboard admin can reset passwords.

### 3. No custom error pages
- No `app/error.tsx` (global React error boundary)
- No `app/not-found.tsx` (custom 404)
- No `app/loading.tsx` (global suspense fallback)
- No dashboard-level equivalents either

Any runtime error or bad URL drops the user onto raw Next.js default error output — gray page, no branding, no "go back" CTA. In a live demo this is immediately trust-destroying.

### 4. No dedicated Grants or Recommendations pages
The nav has only four links: **Dashboard · Charities · Tax · Profile**. Grant data and recommendations exist at the API level (`api/recommendations/`, `components/GrantSummaryCard.tsx`, `components/PortfolioGrantSummary.tsx`), and some grant data surfaces inside the dashboard, but there are no standalone pages for grants or recommendations. A prospect expecting to explore "where our grants are going" has nowhere obvious to click.

---

## 🟡 Gaps (embarrassing but recoverable)

### 5. Onboarding is a dead-end for new users
After signup, users are redirected to `/welcome`. The welcome page (`app/welcome/page.tsx:67-70`) shows:

> _"No portfolios yet. An admin can add you to one."_

There is no setup wizard, no instructions, no link to contact an admin, and no invitation flow. A prospect who signs up independently is completely stuck.

### 6. Demo data SQL has a hardcoded portfolio UUID
`db/demo_data.sql` hardcodes `portfolio_id = 'ee0c5a4f-d5a3-4ae4-bac7-20f056e26dbd'` and includes a comment "Replace with your actual portfolio_id." This means the demo data script cannot be run as-is without editing the file each time. Easy to miss in a rushed demo setup.

### 7. Header nav does not pass `portfolio_id` to Tax page
`components/Header.tsx:54` sets `taxHref = '/dashboard/tax'` — no `portfolio_id` query param is appended. The tax page (`app/dashboard/tax/page.tsx`) reads `portfolio_id` from search params, so navigating via the header may land on a blank/broken tax view if the URL doesn't carry the portfolio context forward.

### 8. Auth flow has no error state for unconfirmed email on sign-in
Sign-up correctly shows a confirmation message (`app/login/page.tsx:114-117`). However, if a user tries to sign in with an unconfirmed email, the Supabase error message surfaces raw — there's no friendly in-UI explanation like "Please confirm your email first. Resend confirmation →".

### 9. Page metadata is generic
`app/layout.tsx` sets:
```ts
title: "Benevolence"
description: "Impact investing dashboard"
```
No Open Graph tags, no Twitter card metadata, no favicon beyond Next.js defaults. Browser tabs and link previews look unfinished.

---

## 🟢 What works well

- **Professional landing page** at `/` — clean brand mark ("B."), serif + sans-serif pairing, clear sign-in CTA. A prospect's first impression before auth is polished.
- **Comprehensive demo SQL data** (`db/demo_data.sql`) covers all asset types: equities, debt, PE funds, grants, donations, VC startups. Includes historical valuations, impact metrics timeseries, and KPI targets — enough to make every dashboard section meaningful once loaded.
- **Empty state components are thoughtful** — `KpiSection`, `PortfolioSummarySection`, and `HoldingsSection` all show meaningful messages and contextual CTAs when data is absent rather than broken layouts.
- **Charity seed script** (`scripts/seed-test-charities.ts`) seeds 5 real, well-known charities (Red Cross, Doctors Without Borders, Feeding America, The Nature Conservancy, Khan Academy) with real EINs and mission statements.
- **All nav links are backed by real pages** — no 404s, no "coming soon" stubs in the navigation.
- **Feature breadth is impressive** — QuickBooks OAuth integration, AI assistant/chat, PDF report generation, tax optimization, impact KPIs, charity discovery, and admin import pipeline are all implemented. For a foundation ED, this is genuinely compelling.
- **Auth flow handles email confirmation correctly** on sign-up.
- **Admin dashboard** is fully built out (portfolio creation, member management, import wizard) — a demo operator can manage the environment.

---

## Recommendations

Prioritized actions to make this demo-ready:

### P0 — Must-fix before any prospect demo

1. **Create a "Load Demo Data" admin button** in `/admin/console` that runs the demo SQL against the current environment and assigns the demo portfolio to the logged-in user. Eliminates the manual SQL step entirely.

2. **Add `app/not-found.tsx` and `app/error.tsx`** with branded, helpful UI (logo, friendly message, "Return to dashboard" link). 30 minutes of work, eliminates the most embarrassing demo failure mode.

3. **Fix Tax link in `Header.tsx`** to append `?portfolio_id=${currentPortfolioId}` — same pattern already used for the Dashboard link (`dashboardHref`).

4. **Pre-create a demo account** with a known password and pre-loaded portfolio, so prospects can be handed working credentials rather than asked to sign up.

### P1 — Should-fix for a polished demo

5. **Add password reset flow** — at minimum a "Forgot password?" link on the login page that calls `supabase.auth.resetPasswordForEmail()` and a `/reset-password` page to handle the redirect.

6. **Improve the welcome page empty state** — replace the dead-end "An admin can add you to one" message with a real CTA: a link to an explainer, a demo video, or a "Request access" email link.

7. **Add Open Graph / favicon metadata** to `app/layout.tsx` so shared links and browser tabs look professional.

8. **Surface grants and recommendations as first-class pages** — even a simple `/dashboard/grants` page listing grant holdings with filter/sort would make the navigation feel complete to a foundation ED who primarily thinks in terms of grantmaking.

### P2 — Nice-to-have

9. **Add `loading.tsx` Suspense fallbacks** at dashboard level so page transitions show branded skeleton UI instead of flashing blank content.

10. **Add an onboarding checklist** for first-time users (connect QuickBooks, import holdings, set KPI targets) — can be a dismissible banner on the dashboard rather than a full wizard.

11. **Templatize `db/demo_data.sql`** to accept portfolio UUID as a parameter, or generate the UUID dynamically at script run time, to make multi-environment seeding safe.
