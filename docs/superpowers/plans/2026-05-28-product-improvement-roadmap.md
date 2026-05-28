# Product Improvement Roadmap

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the current backlog into a disciplined product improvement program: clean source-of-truth docs, close schema/product misalignments first, then sequence user-facing modules by foundation value.

**Architecture:** This is a prerelease product. Prefer improving the active schema and product model over compatibility shims. If code references a table, view, RPC, bucket, enum, or column, the active migrations and contract tests must support it.

**Tech Stack:** PostgreSQL 15, Supabase RLS and Storage, Next.js App Router, TypeScript, React, Vitest.

---

## Strategy

The product is now broad enough that the main risk is not a single missing feature; it is drift between schema, routes, module registry, AI tools, docs, and backlog. The best path is to make the platform internally coherent before adding more surfaces.

Execution order:

1. Make the backlog truthful and enforceable.
2. Add guardrails that catch new schema-reference drift.
3. Resolve P1 schema/product gaps by domain.
4. Build the core operating system: tasks, compliance, reports, grants, imports.
5. Layer in relationship, document, board, and integration workflows.
6. Add advanced analytics and polish once the product foundation is reliable.

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

## Phase 0: Backlog Hygiene And Guardrails

**Goal:** Make the backlog a reliable execution source and add tests that stop new schema drift.

### Task 0.1: Remove Shipped Items From Open Backlog Counts

**Files:**
- `docs/module-reviews/FULL-BACKLOG.md`

- [ ] Move pledge tracking UI items out of active Donor CRM gaps now that pledge dashboard, create modal, detail panel, donor profile integration, and org settings toggle exist.
- [ ] Move task inbox, automation producer, and notification event queue items out of active Task / Workflow gaps now that the foundation exists.
- [ ] Update issue counts to the active open count.
- [ ] Keep shipped history visible so future reviewers understand why the count changed.

Acceptance:

- The backlog no longer presents shipped pledge/task foundation work as open.
- The count summary matches the active open tables.

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

- [ ] Add `v_contribution_with_donor` or rewrite donor components to canonical contribution queries.
- [ ] Add `donor_communications` if communications are part of the CRM surface.
- [ ] Add contract tests for donor dashboard/detail queries.

Acceptance:

- Donor dashboard/detail work on a clean DB.

### Task 1.8: External Charity And QuickBooks Integrity

**Backlog:** `Ch-B1`, `QB-B1`

- [ ] Add external cache tables/RPCs or disable caching paths until schema exists.
- [ ] Align QuickBooks account API/UI field names.
- [ ] Add tests covering cache paths and QuickBooks account payload shape.

Acceptance:

- External enrichment/geocoding and QuickBooks account selectors do not fail or render undefined values.

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

1. Task 0.1: Backlog shipped-item cleanup.
2. Task 0.2: Backlog-aware schema reference guardrail tests.
3. Task 1.1: Module registry/table canon.
4. Task 1.2: Reporting schema and export repair.
5. Task 1.3: Widgets and locations schema decision.
