# Running Client Demos

This guide covers demo scenarios for prospect meetings. Demo environments use `db/scripts/demo_data.sql`, which provides a realistic foundation portfolio with grants in various lifecycle stages, donor history, tax records, and active tasks.

## Demo Prep Checklist

Before any prospect meeting:

- [ ] Clone latest main and run `pnpm install`
- [ ] Create a dedicated Supabase project for the demo
- [ ] Run all migrations: `supabase db push`
- [ ] Configure environment variables per `GETTING_STARTED.md`
- [ ] Load demo data via the admin console "Load Demo Data" button or `db/scripts/demo_data.sql` in the Supabase SQL editor
- [ ] Create a demo user account and assign it to the demo org
- [ ] For Finance Director demo: connect a QuickBooks sandbox account via Settings → Integrations
- [ ] Verify the grant pipeline loads (`/dashboard/grants`) and shows grants across multiple lifecycle stages
- [ ] Verify the AI assistant can answer "What grants need a decision this month?" with real data

---

## Scenario 1: Foundation Executive Director (20 minutes)

**Persona:** Executive Director of a $25–50M family foundation. Currently uses Blackbaud, frustrated by cost and complexity.

**Goal:** Show a platform that handles the operational core — grants, compliance, and board reporting — without the Blackbaud overhead.

**Flow:**

1. **Dashboard** — portfolio value, KPI cards, holdings map. "This is the view your board sees. Every number here updates in real time."

2. **Grants pipeline** — open the pipeline view and walk through lifecycle stages. Show an active grant with milestones and a payment schedule. Move a grant from `due_diligence` to `recommended` and show the decision dialog. "Every transition is logged. You have a full audit trail of who approved what and when."

3. **Attention queue** — filter to grants requiring decisions. "This replaces your weekly grant status emails. Everything that needs your attention is surfaced here."

4. **Compliance** — show the filing calendar and payout requirement. "Your 990-PF deadline is tracked automatically, and the required distribution calculation is always current."

5. **AI assistant** — ask: "Which grants are in due diligence right now?" then "Summarize the Greenfield Foundation grant." Demonstrate a mutation: "Move the Greenfield grant to recommended with a decision note: 'Board voted 5-0 in the October meeting.'" Show the action is reflected immediately in the pipeline.

6. **Builder** — brief look at the Builder tab in settings. "When your team's needs evolve — say you want to track a new KPI or enable the donors module — your admin can configure it here without calling us."

**Talking Points:** "You own this software. No recurring SaaS fees, no vendor lock-in. When your team grows, you add a seat. When your workflows change, you change the software."

---

## Scenario 2: Finance Director / CFO (20 minutes)

**Persona:** Finance Director at a family office. Responsible for QuickBooks accuracy, tax compliance, and audit readiness.

**Goal:** Prove accounting integration, tax data integrity, and CPA collaboration.

**Flow:**

1. **QuickBooks** — walk through the OAuth connection and chart of accounts sync (use sandbox). Show contribution export as journal entries. "Your accountants get clean, categorized entries. No manual re-entry."

2. **Tax center** — open the contributions view. Show AGI-based deduction limit buckets. Show a stock donation with FMV and cost basis. Show the carryforward schedule with expiration tracking.

3. **CPA sharing** — generate a share link with view-only permissions. "Your CPA gets a time-limited, read-only portal into exactly the data they need for the return. No shared login, no export-and-email."

4. **Document storage** — open a contribution and show the attached appraisal document. Download via signed URL. "Every substantiation document is linked to the contribution it covers and is available on demand during an audit."

5. **Export** — show TurboTax TXF, Excel, and PDF export options.

6. **Grant payments** — open a grant with a payment schedule. Show actual vs. planned disbursement. "Payment timing is tracked at the grant level, which is what your auditors want to see."

**Talking Points:** "Your tax preparer gets exactly what they need without you compiling spreadsheets. Your audit trail lives in the system, not in email threads."

---

## Scenario 3: IT Director / Security and Deployment Evaluation (30 minutes)

**Persona:** IT Director or CTO evaluating long-term maintainability, security model, and deployment ownership.

**Goal:** Demonstrate code ownership, data sovereignty, and secure architecture.

**Flow:**

1. **Deployment** — show the Vercel deployment connected to the Supabase project. "This is your Supabase project. Your data never touches our infrastructure."

2. **Code ownership** — walk the repository structure briefly. Show `db/migrations/` as the schema source of truth. "Every schema change is a numbered migration file in your repo. You can review, modify, or revert it."

3. **RLS** — open any migration and show the RLS policies. "Row Level Security is enforced at the database level. Even if there's an application bug, the database rejects cross-org queries."

4. **Module gating** — disable a module in settings and show the nav item disappear and the API return 403. "Module access is enforced at the UI, API, and database RLS levels simultaneously."

5. **Import** — demonstrate the AI-assisted import with a sample Blackbaud CSV. Show field mapping suggestions, validation warnings, and the reconciliation report after commit. "Migrations are validated before they touch your production data."

6. **Builder** — show the Builder chat in settings. Demonstrate asking it to enable a module and show the proposal preview before applying. "Configuration changes go through a review step before they're applied. There are no surprise schema changes."

**Talking Points:** "You own the source code. You own your data. You control the hosting. If your needs evolve — and they will — you have the source code to build on."
