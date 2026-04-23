# Onboarding Wizard — Design Spec
**Date:** 2026-04-22  
**Status:** Approved

## Overview

Replace the "Request a demo" CTA and the bare-bones `SetupClient` form with a fully self-serve, conversational onboarding wizard. New users sign up via email/password or Google OAuth, are guided through a 5-step chat with B., and land on a pre-configured dashboard — no human in the loop.

---

## 1. Landing Page

**Change:** One edit to `app/page.tsx`.

- "Request a demo" button → "Get started →", `href="/login?signup=1"`
- "Sign in" link stays for returning users (unchanged)

---

## 2. Auth

**Methods:** Email/password + Google OAuth (both supported).

The existing `/login` page already handles both sign-in and sign-up via an internal `mode` toggle. One small change needed: read a `?signup=1` query param on mount and default to signup mode when present. This means "Get started" drops the user directly into the create-account form without any extra clicks.

Google OAuth is enabled via the Supabase dashboard — no code change required. After account creation, the existing `postAuthDestination()` logic redirects new users to `/welcome` automatically.

---

## 3. Setup Wizard

`app/welcome/SetupClient.tsx` is replaced entirely with a conversational wizard component. The wizard renders as a chat thread — B. speaks through bubble messages, the user responds via quick-reply chips or free-text input.

### Visual style

- Background: `--color-creme` (`#fffff9`)
- Fonts: Montserrat (UI), Playfair Display (B. avatar + Claude help text)
- B. messages: `--color-creme-warm` bubble, `border-radius: 0 12px 12px 12px`
- User messages: `--color-azure` bubble, `border-radius: 12px 0 12px 12px`
- Claude help bubbles: `#f0f7fb` background, `--color-azure-soft` border, Playfair italic — visually distinct from scripted messages
- Chips: pill-shaped (`border-radius: 20px`), `--color-azure-soft` border
- Buttons: pill-shaped, azure fill for primary, white + azure-soft border for secondary
- Nav: Benevolence wordmark (Playfair, azure-deep + coral period) + "Setting up your workspace" step label

### Conversation flow

| Step | B. says | User input | AI involved? |
|------|---------|-----------|-------------|
| 1 | "Welcome to Benevolence. I'll help you set up your workspace in about 2 minutes. What's the name of your organization?" | Free-text | No |
| 2 | "What type of organization is [name]?" | Chip selection: Family Foundation, Community Foundation, Donor-Advised Fund, Nonprofit, Individual. "✦ Help me decide" chip available. | Yes — on "Help me decide" |
| 3 | "Do you have an EIN? This unlocks charity verification and tax features — you can always add it later." | "Yes, I have it" (shows text input) or "Skip for now" | No |
| 4 | "Based on [org type], I've turned on the features most relevant to you. Tap any to learn more or toggle off." | Module chips (toggle on/off). Each chip tappable for Claude explanation. "Looks good →" or "Customize". | Yes — on module tap |
| 5 | "All set. Creating your [name] workspace now…" | None — auto-provisions | No |

**Step 4 module defaults by org type** (driven by `provision_organization()` RPC defaults):

| Module | Family Foundation | Community Foundation | DAF | Nonprofit | Individual |
|--------|:-:|:-:|:-:|:-:|:-:|
| Dashboard | ✓ | ✓ | ✓ | ✓ | ✓ |
| Charities | ✓ | ✓ | ✓ | ✓ | ✓ |
| Tax Center | ✓ | — | ✓ | — | ✓ |
| Donors | — | ✓ | — | ✓ | — |
| Compliance | — | ✓ | — | ✓ | — |
| QuickBooks | — | — | — | — | — |

---

## 4. AI Assist Endpoint

**Route:** `POST /api/onboarding/assist`

**Purpose:** Handles the two Claude-powered moments in the wizard:
1. "Help me decide" on org type — Claude explains the difference between org types in 2–3 plain-English sentences, then asks which sounds closest.
2. Module chip tap — Claude explains what that module does and who typically uses it.

**Request body:**
```json
{
  "question": "org_type_help" | "module_help",
  "context": {
    "org_name": "Thornwood Family Foundation",
    "org_type": "family_foundation",   // present on module_help
    "module": "compliance"             // present on module_help
  }
}
```

**Response:** `{ "answer": "..." }` — 2–3 sentence string, no streaming.

**Token usage:** Called at most 7× per signup (1 org type + 6 modules). Estimated cost: <$0.01 per user. Uses a tight system prompt with fixed output length constraint.

**Rate limiting:** Protected by existing `@upstash/ratelimit` middleware (same as other AI routes).

---

## 5. Provisioning

At step 5, the wizard POSTs to a new dedicated route `POST /api/onboarding/provision`:
```json
{
  "name": "Thornwood Family Foundation",
  "org_type": "family_foundation",
  "ein": "12-3456789",
  "modules": ["dashboard", "charities", "tax"]
}
```

This route calls the `provision_organization()` RPC (implemented in `db/migrations/0023`) which creates the org + owner membership atomically. It then creates a default portfolio linked to the new org. On success, returns `{ org_id, portfolio_id }` and the wizard redirects to `/dashboard?portfolio_id=<id>`.

The existing `POST /api/org` route is left unchanged — it remains the path for in-app org creation (e.g., admin flows) and does not need to support module configuration.

---

## 6. Files Changed

| File | Change |
|------|--------|
| `app/page.tsx` | CTA text "Request a demo" → "Get started →", href `/login` → `/login?signup=1` |
| `app/login/page.tsx` | Read `?signup=1` param on mount → default to signup mode |
| `app/welcome/SetupClient.tsx` | Full rewrite — conversational wizard component |
| `app/api/onboarding/assist/route.ts` | **New** — Claude assist endpoint |
| `app/api/onboarding/provision/route.ts` | **New** — calls `provision_organization()` RPC + creates portfolio |
| `app/welcome/page.tsx` | Unchanged — auth check + redirect logic stays |
| `app/api/org/route.ts` | Unchanged — existing in-app org creation path |

---

## 7. Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Onboarding model | Self-serve | No human in the loop; scales without the team |
| Auth methods | Email/password + Google OAuth | Google Workspace is standard for foundation staff |
| Wizard structure | Conversational (scripted + AI hybrid) | On-brand for an AI-first product; smooth UX |
| Wizard depth | Guided | Org type shapes the whole dashboard; must be set correctly |
| AI role | Inline help only | Token-efficient; AI adds value at the exact moments of ambiguity |
| Provisioning | Existing `provision_organization()` RPC | No new DB changes needed |

---

## 8. Out of Scope

- Data import during onboarding (CSV, QuickBooks) — user can do this after first login
- Team invitations during onboarding — owner can invite members from the dashboard
- EIN verification against IRS/ProPublica — field is collected but not validated at signup
- Admin notification on new signup — can be added later as a webhook
