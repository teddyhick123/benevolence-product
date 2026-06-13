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

## Phase 0.5: Quick Wins And Security Issues (No Migrations Required) ✅ COMPLETE (2026-06-12)

**Goal:** Close correctness and security gaps that require no schema changes — single-file or two-file fixes that should ship before any Phase 1 work begins.

### Task 0.5.1: Fix QuickBooks Account Field Name Mismatch ✅ PRE-EXISTING FIX

**Backlog:** `QB-B1`

**Files:**
- `components/integrations/QuickBooksSettings.tsx`
- `app/api/integrations/quickbooks/accounts/route.ts`

- [x] Remap UI field references `qb_account_id`, `name`, `type` to match API response fields `qb_id`, `qb_name`, `qb_type` (or normalize in the API response — pick one direction and be consistent).

Acceptance: QB account selector renders actual account names, not `undefined`.
**Status:** Already fixed before this session. Component uses `qb_id`/`qb_name`/`qb_type` matching API response.

---

### Task 0.5.2: Remove AGI Console Log Leak From Tax Routes ✅ FIXED (commit 7316f1eb)

**Files:**
- `app/api/portfolio/[id]/tax/optimize/route.ts`
- `app/api/portfolio/[id]/tax/scenarios/route.ts`

- [x] Remove `console.error` / `console.log` calls that emit raw `adjusted_gross_income` values. AGI is sensitive financial data that must not appear in server logs.

Acceptance: Production logs contain no raw AGI values from these routes.

---

### Task 0.5.3: Fix Donor Acknowledgment Insert Column ✅ PRE-EXISTING FIX

**Files:**
- `app/api/org/[orgId]/acknowledgments/route.ts`

- [x] Change `contribution_id: args.contribution_id` to `contribution_ids: [args.contribution_id]` (or accept an array upstream). The `acknowledgments` table schema defines `contribution_ids` as a UUID array; the singular insert violates the DB constraint on every write.

Acceptance: Creating an acknowledgment from the UI inserts a row successfully.
**Status:** Already fixed before this session. Route uses `contribution_ids: contribution_id ? [contribution_id] : []`.

---

### Task 0.5.4: Replace Donor PDF Public URL With Signed URL ✅ PRE-EXISTING FIX

**Files:**
- `app/api/org/[orgId]/acknowledgments/[id]/generate-pdf/route.ts`

- [x] Replace `getPublicUrl()` with `createSignedUrl(path, 3600)` for acknowledgment PDFs. Donor names, addresses, and giving amounts must not be accessible via an unauthenticated permanent URL. Pattern already established in Tax Center document routes.

Acceptance: Acknowledgment PDF links are signed, expire in 1 hour, and are not guessable permanent URLs.
**Status:** Already fixed before this session. Route uses `createSignedUrl(storagePath, 3600)`.

---

### Task 0.5.5: Fix Timeline Cross-Portfolio Data Leak ✅ FIXED (commit a0a5324f)

**Backlog:** `Vis-B3` (P0 security)

**Files:**
- `app/api/portfolio/[id]/timeline/route.ts`

- [x] Add org_id scope to the `events` table query. The `events` table has no `portfolio_id` column; the fix derives `org_id` from the portfolio's holdings and filters `.or('org_id.is.null,org_id.eq.{orgId}')` to return only public events + current-org events, preventing cross-org event leakage via shared investees.

Acceptance: Timeline API returns only events belonging to the requested portfolio's org (plus public `org_id = NULL` news events).

---

### Task 0.5.6: Elevate QuickBooks Token Encryption To P1 ✅ PRE-EXISTING FIX

**Files:**
- `app/api/integrations/quickbooks/callback/route.ts`

- [x] Encrypt access tokens before storing in the `TEXT` column, or use Supabase Vault. Plaintext OAuth tokens in Postgres are a compliance risk for any fiduciary-grade product.

Acceptance: `quickbooks_connections` rows never contain plaintext access tokens.
**Status:** Already fixed before this session. Callback route imports and uses `encryptToken` from `lib/integrations/quickbooks/token-crypto`.

---

### Task 0.5.7: Note CPA Collaboration Portal Status ✅ FIXED (commit 829dd936)

**Files:**
- `components/tax/CPACollaborationPortal.tsx`
- `lib/tax/cpa-collaboration.ts`

- [x] Document `cpaCollaborationEnabled = false` flag with Phase B trigger condition (rate limiting + transactional email delivery).
- [x] Remove hardcoded `app.benevolence.com` fallback from `generateCPAShareURL` — now throws if `NEXT_PUBLIC_APP_URL` is unset.

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

## Phase 1: P1 Schema And Product Alignment ✅ SCHEMA AUDIT COMPLETE (2026-06-12)

**Goal:** Eliminate correctness gaps that make visible features fail on a clean database.

> **Audit finding (2026-06-12):** All 8 Phase 1 schema areas were audited against active migrations. Every table, view, and RPC referenced in Phase 1 tasks already exists in the migration files — no new schema migrations are required. Phase 1 non-schema work (contract tests, registry alignment, route decisions) is absorbed into Phase 2 execution cycle. The schema foundation is solid.

### Task 1.1: Module Registry And Module Docs Canon ✅ SCHEMA PRESENT

**Backlog:** `X9`

- [x] All module-owned tables exist in migrations (confirmed by audit).
- [ ] Registry contract test — deferred to Phase 2 (Task 2.0 guardrails).

### Task 1.2: Reporting Foundation ✅ SCHEMA PRESENT

**Backlog:** `R-B1`, `R-B2`

- [x] `report_templates`, `generated_reports`, `report_schedules`, `report_share_links` all exist in migrations.
- [ ] Export route alignment and contract tests — deferred to Phase 2.

### Task 1.3: Visualization And Widget Canon ✅ SCHEMA PRESENT

**Backlog:** `Vis-B1`, `Vis-B2`

- [x] `widgets` table exists in migrations; `v_investment_performance` and `v_portfolio_investment_summary` are design artifacts not referenced in active code — no fix needed.
- [ ] Widget/location contract tests — deferred to Phase 2.

### Task 1.4: Import Operations Reliability ✅ SCHEMA PRESENT

**Backlog:** `Adm-B7`, `Adm-B8`, `Adm-B9`, `Adm-B10`

- [x] `staging_import_*` tables, `mark_stale_import_jobs` RPC, and import schema exist in migrations.
- [ ] Storage bucket verification and import contract tests — deferred to Phase 2.

### Task 1.5: Compliance Data Model ✅ SCHEMA PRESENT

**Backlog:** `Cm-B1`, `Cm-B2`

- [x] `filing_calendar_entries`, `disqualified_persons`, `expenditure_responsibility_grants`, compliance dashboard views all exist.
- [ ] Route guards and compliance contract tests — deferred to Phase 2.

### Task 1.6: Holdings Analytics And Financial Profile ✅ SCHEMA PRESENT

**Backlog:** `H-B1`, `H-B2`

- [x] Holdings schema and `generated_financial_analyses` exist in migrations.
- [ ] Performance route tests — deferred to Phase 2.

### Task 1.7: Donor CRM Communications And Views ✅ SCHEMA PRESENT

**Backlog:** `Dr-B1`

Note: `Dr-B2` (acknowledgment insert column fix) and `Dr-B3` (PDF signed URL) are handled in Phase 0.5 Tasks 0.5.3 and 0.5.4 above — they require no schema changes.

- [x] `v_contribution_with_donor` and `donor_communications` exist in migrations.
- [ ] Donor dashboard contract tests — deferred to Phase 2.

### Task 1.8: External Charity And QuickBooks Integrity ✅ SCHEMA PRESENT

**Backlog:** `Ch-B1`

Note: `QB-B1` (account field name mismatch) is a no-migration fix handled in Phase 0.5 Task 0.5.1. QuickBooks token encryption is Task 0.5.6.

- [x] `charity_rating_cache`, `geocode_cache`, `get_geocode_cache_stats`, `clean_expired_geocode_cache` all exist in migrations.
- [ ] Cache path contract tests — deferred to Phase 2.

---

## Phase 2: Operating System

**Goal:** Make core operational workflows coherent across modules.

### Task 2.1: Task Center Completion Polish ✅ COMPLETE (2026-06-12)

- [x] Add dashboard summary widget (overdue, due soon, blocked, assigned-to-me tiles) — `components/tasks/TaskSummaryWidget.tsx` + `GET /api/org/[orgId]/tasks/summary`
- [x] Add task entity link affordances — `lib/tasks/entity-links.ts` + chips in `TaskInbox`
- [x] Add Tasks nav entry in org layout
- [ ] Add producer coverage for donor follow-up and board/report approvals — deferred until Reporting (Phase 2.2) ships

### Task 2.2: Compliance Operations

- [ ] Add nightly overdue filing cron.
- [ ] Add IRS 990-PF worksheet view.
- [ ] Add filing document attachment support.
- [ ] Connect compliance tasks to reminders and notification preferences.

### Task 2.3: Grant Follow-Through

- [ ] Add grantee report submission workflow.
- [x] ~~Add bulk pipeline transitions.~~ **Done (GM-3, 2026-06-12) — multi-select, decision queue, 207 bulk API, result modal.**
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
2. ~~Phase 0.5 quick wins~~ **Done (2026-06-12).**
3. ~~Phase 1 schema audit~~ **Done (2026-06-12) — all tables/views/RPCs confirmed present in migrations.**
4. Task 0.2: Backlog-aware schema reference guardrail tests. (261-test baseline already in place from 2026-05-28 sprint.)
5. Task 2.1: Task Center Completion Polish.
6. Task 2.2: Compliance Operations.
7. Task 2.3: Grant Follow-Through (bulk transitions done; remaining: report submission, search, renewals, templates).
8. Task 2.4: Import Review Experience.
