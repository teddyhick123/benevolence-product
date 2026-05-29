# Product Improvement Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current backlog into a disciplined product improvement program: clean source-of-truth docs, close schema/product misalignments first, then sequence user-facing modules by foundation value.

**Architecture:** This is a prerelease product. Prefer improving the active schema and product model over compatibility shims. If code references a table, view, RPC, bucket, enum, or column, the active migrations and contract tests must support it.

**Tech Stack:** PostgreSQL 15, Supabase RLS and Storage, Next.js App Router, TypeScript, React, Vitest.

---

## What Has Shipped Since This Roadmap Was Written

Before reading further, note these items from the original sprint plan are **complete** as of 2026-05-28:

- **Grant Lifecycle Management** — 14-stage lifecycle, org-scoped CRUD, Pipeline/Table/Calendar/Attention views, AI tools, task automation, decisions, transitions, export. This was Phase 2.3 and the "Sprint D" item in MASTER-SUMMARY.
- **Task / Workflow / Approvals** — org task inbox, automation producer framework, notification event queue, fanout/send/digest jobs, member notification preferences.
- **Tax Center hardening** — canonical schema, signed URLs for all document storage, admin-client storage operations, CPA sharing schema (Phase A), AI tool alignment, export repair.
- **Test suite** — 261 tests across 11 route files covering auth, contract, business logic, signed-URL security, and lifecycle invariants. Relevant to Task 0.2.
- **Task 0.1 (backlog hygiene)** — shipped pledge/task foundation items removed from open count. Backlog currently stands at 16 P1 / 46 P2 / 7 P3 = 69 open.

MASTER-SUMMARY (`docs/module-reviews/MASTER-SUMMARY.md`) predates all of the above and still lists Grant Lifecycle and Task/Workflow as missing P0 modules. Treat that document as historical context, not current state.

---

## Strategy

The product is now broad enough that the main risk is not a single missing feature; it is drift between schema, routes, module registry, AI tools, docs, and backlog. The best path is to make the platform internally coherent before adding more surfaces.

Execution order:

1. ~~Make the backlog truthful and enforceable.~~ **Done (Task 0.1 complete).**
2. Close no-migration quick wins and security issues immediately (Phase 0.5).
3. Add guardrails that catch new schema-reference drift.
4. Resolve P1 schema/product gaps by domain.
5. Build the core operating system: compliance, reports, imports.
6. Layer in relationship, document, board, and integration workflows.
7. Add advanced analytics and polish once the product foundation is reliable.

---

## Current Backlog Snapshot

After removing shipped pledge/task foundation items from the open count, the active backlog should stand at:

| Priority | Count |
|----------|-------|
| P1 correctness | 16 |
| P2 UX / quality | 46 |
| P3 future parity | 7 |
| Total open | 69 |

The P1 list is the execution spine. P2 and P3 work should not be started when it depends on unresolved P1 schema or access-control decisions.

---

## Product Principles

1. **Schema truth first.** Product routes, AI tools, module registry metadata, tests, and docs must all point at the same active migrations.
2. **No hidden broken surfaces.** If a feature panel or API is visible, the migration/schema/storage support must exist.
3. **Org and portfolio boundaries are product requirements.** RLS, route guards, and service-role routes all need explicit access checks.
4. **Task automation is the operating layer.** Compliance, pledges, imports, reports, and grants should create one meaningful task per real obligation.
5. **AI must be brand-agnostic and schema-safe.** Tool schemas may be user-friendly externally, but executors must normalize to canonical internal fields.
6. **Backlog entries need owners.** Every known schema mismatch should either be fixed, deliberately hidden, or documented as an allowed exception with a plan.

---

## Phase 0.5: Quick Wins And Security Issues (No Migrations Required)

**Goal:** Close correctness and security gaps that require no schema changes — single-file or two-file fixes that should ship before any Phase 1 work begins.

### Task 0.5.1: Fix QuickBooks Account Field Name Mismatch

**Backlog:** `QB-B1`

**Files:**
- `components/integrations/QuickBooksSettings.tsx`
- `app/api/integrations/quickbooks/accounts/route.ts`

- [ ] Remap UI field references `qb_account_id`, `name`, `type` to match API response fields `qb_id`, `qb_name`, `qb_type` (or normalize in the API response — pick one direction and be consistent).

Acceptance: QB account selector renders actual account names, not `undefined`.

---

### Task 0.5.2: Remove AGI Console Log Leak From Tax Routes

**Files:**
- `app/api/portfolio/[id]/tax/optimize/route.ts`
- `app/api/portfolio/[id]/tax/scenarios/route.ts`

- [ ] Remove `console.error` / `console.log` calls that emit raw `adjusted_gross_income` values. AGI is sensitive financial data that must not appear in server logs.

Acceptance: Production logs contain no raw AGI values from these routes.

---

### Task 0.5.3: Fix Donor Acknowledgment Insert Column

**Files:**
- `app/api/org/[orgId]/acknowledgments/route.ts`

- [ ] Change `contribution_id: args.contribution_id` to `contribution_ids: [args.contribution_id]` (or accept an array upstream). The `acknowledgments` table schema defines `contribution_ids` as a UUID array; the singular insert violates the DB constraint on every write.

Acceptance: Creating an acknowledgment from the UI inserts a row successfully.

---

### Task 0.5.4: Replace Donor PDF Public URL With Signed URL

**Files:**
- `app/api/org/[orgId]/acknowledgments/[id]/generate-pdf/route.ts` (or wherever the PDF URL is returned)

- [ ] Replace `getPublicUrl()` with `createSignedUrl(path, 3600)` for acknowledgment PDFs. Donor names, addresses, and giving amounts must not be accessible via an unauthenticated permanent URL. Pattern already established in Tax Center document routes.

Acceptance: Acknowledgment PDF links are signed, expire in 1 hour, and are not guessable permanent URLs.

---

### Task 0.5.5: Fix Timeline Cross-Portfolio Data Leak

**Backlog:** Add as `Vis-B3` (P0 security)

**Files:**
- `app/api/portfolio/[id]/timeline/route.ts`

- [ ] Add `.eq('portfolio_id', portfolio_id)` filter to the `events` table query at line 46. Without it, the endpoint returns events across all organizations to any authenticated user.

Acceptance: Timeline API returns only events belonging to the requested portfolio.

---

### Task 0.5.6: Elevate QuickBooks Token Encryption To P1

**Files:**
- `app/api/integrations/quickbooks/callback/route.ts` (or wherever tokens are stored)
- Relevant migration for `quickbooks_connections`

- [ ] Encrypt access tokens before storing in the `TEXT` column, or use Supabase Vault. Plaintext OAuth tokens in Postgres are a compliance risk for any fiduciary-grade product. This does not require a new table — it requires an encryption layer on the existing write path.

Acceptance: `quickbooks_connections` rows never contain plaintext access tokens.

---

### Task 0.5.7: Note CPA Collaboration Portal Status

**Files:**
- `components/tax/CPACollaborationPortal.tsx`
- `lib/tax/cpa-collaboration.ts`

- [ ] The portal is fully built (schema 0043, Phase A token hashing complete, tested). It is blocked behind `const cpaCollaborationEnabled = false`. Make an explicit decision: set to `true` when Phase B (rate limiting, email delivery) is scoped, OR document the flag as a deliberate hold with a clear trigger condition.
- [ ] Fix the hardcoded `app.benevolence.com` URL in `lib/tax/cpa-collaboration.ts:64` — replace with an environment variable.

Acceptance: The flag is documented with a trigger condition and the URL is configurable.

---

## Phase 0: Backlog Hygiene And Guardrails

**Goal:** Make the backlog a reliable execution source and add tests that stop new schema drift.

### Task 0.1: Remove Shipped Items From Open Backlog Counts ✅ COMPLETE

**Files:**
- `docs/module-reviews/FULL-BACKLOG.md`

Done 2026-05-28. Pledge tracking, task foundation, and grant lifecycle items moved to shipped history. Backlog currently at 16 P1 / 46 P2 / 7 P3 = 69 open.

### Task 0.2: Add Schema Reference Guardrails

**Files:**
- `app/api/__tests__/schema-contract.test.ts`
- `docs/module-reviews/FULL-BACKLOG.md`

- [ ] Add a backlog-aware contract test that extracts `.from(...)` table/view references and `.rpc(...)` function references from application code.
- [ ] Compare references against active migrations.
- [ ] Permit only missing references that are explicitly listed in `FULL-BACKLOG.md`.
- [ ] Fail tests for any new missing table, view, RPC, storage bucket, or enum reference that is not tracked.
- [ ] Add a module registry table test so `MODULE_REGISTRY.tables` cannot advertise nonexistent tables without a backlog entry.

Acceptance:

- New schema drift cannot be introduced silently.
- Existing known gaps stay visible without blocking the suite until they are repaired.

### Task 0.3: Tighten Agent Docs

**Files:**
- `AGENTS.md`
- `CLAUDE.md`
- relevant specs under `docs/superpowers/specs/`

- [ ] Update stale module-system notes to document `organizations.modules` / `module_definitions` as canonical.
- [ ] Remove references to obsolete monolithic assistant files where split modules now exist.
- [ ] Add a prerelease schema-quality rule: do not preserve bad schema names for compatibility; optimize the active schema.
- [ ] Make docs point to the backlog guardrail test before adding new schema references.

Acceptance:

- Future agents are steered toward the current canon, not older route/table patterns.

---

## Phase 1: P1 Schema And Product Alignment

**Goal:** Eliminate correctness gaps that make visible features fail on a clean database.

### Task 1.1: Module Registry And Module Docs Canon

**Backlog:** `X9`

- [ ] Sweep `MODULE_REGISTRY.tables` against migrations.
- [ ] Replace stale tables with canonical tables.
- [ ] Add missing canonical module-owned tables where appropriate.
- [ ] Add a registry contract test.

Acceptance:

- Module docs/tool gating cannot regenerate nonexistent schema assumptions.

### Task 1.2: Reporting Foundation

**Backlog:** `R-B1`, `R-B2`

- [ ] Decide canonical report objects: templates, generated documents, schedules, share links.
- [ ] Add or consolidate migrations for missing report schema/RPCs.
- [ ] Rewrite export routes away from legacy `contributions` / `transactions`.
- [ ] Add route and schema contract tests.

Acceptance:

- Report generation, template save/list, schedules, exports, documents, and share links work on a clean DB.

### Task 1.3: Visualization And Widget Canon

**Backlog:** `Vis-B1`, `Vis-B2`

- [ ] Decide whether `widgets` or `holding_widgets` is canonical.
- [ ] Align API routes, AI display paths, and migrations.
- [ ] Add `holding_locations` or hide map/location features until schema is present.
- [ ] Add contract tests for widget and location references.

Acceptance:

- Dashboard/widget/map paths do not call missing tables on a clean DB.

### Task 1.4: Import Operations Reliability

**Backlog:** `Adm-B7`, `Adm-B8`, `Adm-B9`, `Adm-B10`

- [ ] Add or remove `mark_stale_import_jobs`.
- [ ] Create the `imports` storage bucket and policies.
- [ ] Add `import_ai_suggestions` or hide the UI/API.
- [ ] Resolve the `investees` dependency in loader and grant creation.
- [ ] Add import storage/schema/worker tests.

Acceptance:

- Import upload, extraction, review, commit, rollback, stale-job cleanup, and AI suggestions either work end-to-end or are hidden.

### Task 1.5: Compliance Data Model

**Backlog:** `Cm-B1`, `Cm-B2`

- [ ] Decide whether to ship the rich compliance schema now or hide rich dashboard routes.
- [ ] Add missing dashboard views and tables if shipping.
- [ ] Add expenditure responsibility and payout forecast schema if shipping.
- [ ] Add route guards and tests for compliance views.

Acceptance:

- Compliance dashboard, filing deadlines, disqualified persons, payout forecast, and ER grant routes are all aligned to active schema.

### Task 1.6: Holdings Analytics And Financial Profile

**Backlog:** `H-B1`, `H-B2`

- [ ] Add `v_investment_performance` and `v_portfolio_investment_summary`, or rewrite callers to existing holdings/transactions data.
- [ ] Add `generated_financial_analyses` or hide financial profile generation.
- [ ] Add tests for performance and generated-analysis routes.

Acceptance:

- Holding performance and financial profile routes cannot fail due to missing views/tables.

### Task 1.7: Donor CRM Communications And Views

**Backlog:** `Dr-B1`

Note: `Dr-B2` (acknowledgment insert column fix) and `Dr-B3` (PDF signed URL) are handled in Phase 0.5 Tasks 0.5.3 and 0.5.4 above — they require no schema changes.

- [ ] Add `v_contribution_with_donor` or rewrite donor components to canonical contribution queries.
- [ ] Add `donor_communications` if communications are part of the CRM surface.
- [ ] Add contract tests for donor dashboard/detail queries.

Acceptance:

- Donor dashboard/detail work on a clean DB.

### Task 1.8: External Charity And QuickBooks Integrity

**Backlog:** `Ch-B1`

Note: `QB-B1` (account field name mismatch) is a no-migration fix handled in Phase 0.5 Task 0.5.1. QuickBooks token encryption is Task 0.5.6.

- [ ] Add external cache tables/RPCs (`charity_rating_cache`, `geocode_cache`, `get_geocode_cache_stats`, `clean_expired_geocode_cache`) or disable caching paths until schema exists.
- [ ] Add tests covering cache paths.

Acceptance:

- External enrichment/geocoding cache paths do not fail on a clean DB.

---

## Phase 2: Operating System

**Goal:** Make core operational workflows coherent across modules.

### Task 2.1: Task Center Completion Polish

- [ ] Add producer coverage checks for donor follow-up and board/report approvals after Reporting is repaired.
- [ ] Add task action affordances by entity type.
- [ ] Add dashboard widgets for overdue, due soon, blocked, and assigned-to-me tasks.

### Task 2.2: Compliance Operations

- [ ] Add nightly overdue filing cron.
- [ ] Add IRS 990-PF worksheet view.
- [ ] Add filing document attachment support.
- [ ] Connect compliance tasks to reminders and notification preferences.

### Task 2.3: Grant Follow-Through

- [ ] Add grantee report submission workflow.
- [ ] Add bulk pipeline transitions.
- [ ] Add all-portfolio grant search.
- [ ] Add automated renewal workflows.
- [ ] Add grant agreement template generation.

### Task 2.4: Import Review Experience

- [ ] Add import AI suggestions once schema exists.
- [ ] Add clearer bulk fix and approval workflows.
- [ ] Add reconciliation summaries and rollback visibility.

---

## Phase 3: Board, Documents, And Reporting

**Goal:** Make the product board-ready for foundations and operating nonprofits.

### Task 3.1: Board Portal And Reporting

- [ ] Build quarterly board packet workflow.
- [ ] Add board-facing report templates.
- [ ] Add secure share links and access logs.
- [ ] Add dashboard export entry points.

### Task 3.2: Document Hub / Data Room

- [ ] Define canonical document schema.
- [ ] Add foldering, tags, entity links, access logs, retention metadata.
- [ ] Connect documents to grants, compliance, tax, donor acknowledgments, and board reports.

### Task 3.3: Brand Output Layer

- [ ] Apply org-specific branding to PDFs, emails, exported accounting notes, and public share pages.
- [ ] Add contract tests for brand-neutral copy and configurable labels.

---

## Phase 4: Development And Relationship Workflows

**Goal:** Turn donor and stakeholder relationships into repeatable workflows.

- [ ] Add household and relationship grouping.
- [ ] Add LYBUNT/SYBUNT segmentation.
- [ ] Add year-end letter batch generation.
- [ ] Add soft credit attribution.
- [ ] Add stakeholder CRM for grantees, board members, advisors, and external collaborators.
- [ ] Add AI donor tools once canonical donor communication schema exists.

---

## Phase 5: Data And Integration Maturity

**Goal:** Reduce manual work and make integrations trustworthy.

- [ ] Add QuickBooks class/fund/net asset tagging.
- [ ] Add scheduled QuickBooks sync.
- [ ] Implement or remove unsupported import source types.
- [ ] Add Blackbaud coverage for campaigns, appeals, soft credits, pledges, events, relationships, tributes, and recurring gifts.
- [ ] Plan Salesforce, custodians, banking, and data warehouse connectors.

---

## Phase 6: Advanced Product Differentiators

**Goal:** Add depth after the foundation is clean.

- [ ] Add dashboard fiscal-year/date filtering.
- [ ] Add multi-portfolio dashboard switcher.
- [ ] Add advanced tax scenario comparison, AMT, state limits, and holding-period modeling.
- [ ] Add chart types: Sankey, stacked bar, choropleth, scatter, waterfall, print-optimized widgets.
- [ ] Add AI conversation persistence, contextual prompts, and usage rollups.

---

## Execution Protocol

Each task should end with:

- [ ] Code/schema/docs updated together.
- [ ] Backlog entry updated or removed from open count.
- [ ] Agent docs updated if canon changed.
- [ ] Contract tests added or expanded for the fixed drift.
- [ ] Targeted tests run.
- [ ] TypeScript checked for route/component changes.
- [ ] Commit created with a narrow message.

Do not start a P2 feature that depends on unresolved P1 schema. Fix or hide the P1 surface first.

---

## Immediate Execution Queue

1. ~~Task 0.1: Backlog shipped-item cleanup.~~ **Done.**
2. **Phase 0.5 quick wins (no migrations):** QB-B1 field names, AGI console log, acknowledgment insert, donor PDF signed URL, timeline portfolio_id filter, QB token encryption, CPA portal URL.
3. Task 0.2: Backlog-aware schema reference guardrail tests. (261-test baseline already in place from 2026-05-28 sprint.)
4. Task 1.1: Module registry/table canon.
5. Task 1.3: Widgets and locations schema decision (Vis-B1, Vis-B2 — affects dashboard).
6. Task 1.2: Reporting schema and export repair (R-B1, R-B2).

**Do not start Phase 2 items until all Phase 1 P1 schema gaps are fixed or explicitly hidden.**
