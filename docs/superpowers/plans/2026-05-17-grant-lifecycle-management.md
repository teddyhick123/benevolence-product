# Grant Lifecycle Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing grant module into a coherent grant lifecycle product: first-class grant creation, explicit lifecycle stages, decisions, requirements, automation, AI tools, and a polished grant workspace.

**Design Spec:** `/docs/superpowers/specs/2026-05-17-grant-lifecycle-management-design.md`

**Architecture:** Treat the project as prerelease. Optimize the schema and code contracts for quality first. The central lifecycle record should be `grants`, not `grant_details`. Keep grants linked to holdings for portfolio/asset reporting, but make grant operations org-scoped and grant-first.

**Tech Stack:** PostgreSQL 15, Supabase RLS, Next.js App Router, TypeScript, React, Vitest.

---

## Strategic Decisions

| Decision | Recommendation | Reason |
|----------|----------------|--------|
| Central table name | Rename `grant_details` to `grants` | Matches product language and stops recurring schema confusion |
| Holding relationship | Keep `grants.holding_id UNIQUE` | Holdings remain portfolio/financial positions; grants become lifecycle records |
| Route ownership | Prefer org-scoped grant APIs | Lifecycle work belongs to the organization; portfolio is context |
| Lifecycle state | Add `grants.lifecycle_stage` | Avoid fragmented status logic across holdings/workflows/dates |
| Decisions | Add `grant_decisions` | Approvals, declines, renewals, and closeout need audit-grade records |
| AI tools | Unstub after schema cleanup | Current AI tools are defined but return `feature_not_available` |
| Requirements | Phase decision | Either add `grant_requirements` or strengthen reports/milestones with task automation first |

---

## File Map

| Area | Files |
|------|-------|
| DB schema | `db/migrations/0041_task_workflow_foundation.sql` |
| Grant schemas/types | `lib/schemas/grant.ts` |
| Grant dashboard | `app/dashboard/grants/page.tsx`, `components/grants/*` |
| Grant detail | `app/dashboard/grants/[grantId]/page.tsx` |
| Grant APIs | `app/api/portfolio/[id]/grants/**`, `app/api/org/[orgId]/workflows/**` |
| Task producers | `lib/tasks/automation/producers/grants.ts` |
| AI tools | `lib/ai/assistant/tool-definitions.ts`, `lib/ai/assistant/executor.ts` |
| Module registry | `lib/modules/registry.ts`, `lib/modules/client-info.ts` |
| Contract tests | `app/api/__tests__/schema-contract.test.ts`, `lib/__tests__/*contract*.test.ts` |
| Agent docs | `AGENTS.md`, `CLAUDE.md` |

---

## Task 1: Add Contract Tests For Grant Schema Canon

**Files:**
- Modify: `app/api/__tests__/schema-contract.test.ts`
- Modify or add: `lib/__tests__/grant-lifecycle-contract.test.ts`

- [ ] Add tests asserting the canonical table is `grants`.
- [ ] Add tests preventing stale `.from('grant_details')` references after the rename.
- [ ] Add tests requiring `grants` to include `org_id`, `portfolio_id`, `holding_id`, `lifecycle_stage`, `requested_amount`, `approved_amount`, and `internal_owner_id`.
- [ ] Add tests requiring `grant_status_history` and `grant_decisions`.
- [ ] Add tests that grant AI tools do not return `feature_not_available`.
- [ ] Run the targeted tests and confirm they fail before schema/code changes.

Acceptance:

- The contract suite clearly describes the target grant schema and fails on the current implementation.

---

## Task 2: Rename `grant_details` To `grants`

**Files:**
- Modify: `db/migrations/0041_task_workflow_foundation.sql`
- Modify: all TS/TSX references to `grant_details`

- [ ] Rename `public.grant_details` to `public.grants`.
- [ ] Add direct `org_id` and `portfolio_id` columns to `grants`.
- [ ] Keep `holding_id uuid NOT NULL UNIQUE REFERENCES holdings(id)`.
- [ ] Add `lifecycle_stage` with the canonical enum/check constraint from the design spec.
- [ ] Add `requested_amount`, `approved_amount`, `currency`, `purpose`, `internal_owner_id`, `risk_level`, and `deleted_at`.
- [ ] Update all child table FKs from `grant_details(id)` to `grants(id)`.
- [ ] Update views: `v_grants`, `v_portfolio_grant_summary`, `v_grant_health`.
- [ ] Update RPC: `get_upcoming_deadlines`.
- [ ] Update RLS policies to use direct `org_id`/`portfolio_id` where possible.
- [ ] Sweep application code for `.from('grant_details')`, nested `grant_details(...)`, and comments/docs.
- [ ] Decide whether to add a temporary `grant_details` compatibility view. Prefer no compatibility view if every reference is swept.

Acceptance:

- `rg "grant_details" app components lib db AGENTS.md CLAUDE.md` returns no active stale references unless explicitly documented as a compatibility test.
- Clean schema contract tests pass for grant table naming.

---

## Task 3: Add Lifecycle History And Decisions

**Files:**
- Modify: `db/migrations/0041_task_workflow_foundation.sql`
- Add: `lib/grants/lifecycle.ts`
- Add/modify: grant API routes

- [ ] Add `grant_status_history`.
- [ ] Add `grant_decisions`.
- [ ] Create `lib/grants/lifecycle.ts` with allowed stages and allowed transitions.
- [ ] Create transition helper that validates transitions and appends status history.
- [ ] Add `POST /api/org/[orgId]/grants/[grantId]/transition`.
- [ ] Add `POST /api/org/[orgId]/grants/[grantId]/decisions`.
- [ ] Require decision records for approval, decline, defer, renewal, and closeout transitions.
- [ ] Add contract tests that direct lifecycle changes are not scattered across routes without the helper.

Acceptance:

- Lifecycle transitions are centralized.
- Every stage change appends history.
- Approval/decline/renewal/closeout are auditable decision records.

---

## Task 4: Build Org-Scoped Grant APIs

**Files:**
- Add: `app/api/org/[orgId]/grants/route.ts`
- Add: `app/api/org/[orgId]/grants/[grantId]/route.ts`
- Add: child routes as needed

- [ ] Add list endpoint with filters: stage, owner, risk, due date, search, portfolio, program/sector.
- [ ] Add create endpoint that atomically creates holding + grant.
- [ ] Add detail endpoint with grant, holding, health, tasks, requirements, payments, contacts, documents, communications, and timeline summary.
- [ ] Add update endpoint for grant fields.
- [ ] Keep existing portfolio routes temporarily if needed, but make org-scoped APIs the product surface.
- [ ] Add auth tests for org membership and portfolio access.

Acceptance:

- A grant can be created from scratch through one API call.
- A grant can be listed and loaded through org-scoped APIs.
- The API never requires users to manually create a holding first.

---

## Task 5: Build First-Class Grant Create/Edit UI

**Files:**
- Add: `components/grants/CreateGrantWizard.tsx`
- Modify: `app/dashboard/grants/page.tsx`
- Modify: `components/grants/*`

- [ ] Add "New Grant" action on the Grant Center.
- [ ] Build wizard steps: grantee, request, decision path, requirements, payment schedule, review.
- [ ] Support existing grantee/holding lookup and new grantee creation.
- [ ] Create default due diligence workflow from selected template.
- [ ] Create initial milestones/reports/payments/tasks when configured.
- [ ] Add edit affordance on grant detail for core fields.
- [ ] Replace alert/reload patterns in grant components with local state updates or router refresh patterns.

Acceptance:

- A non-technical user can create a full grant lifecycle record without understanding holdings.
- The created grant appears immediately in the Grant Center and detail page.

---

## Task 6: Improve Grant Detail Into A Workspace

**Files:**
- Modify: `app/dashboard/grants/[grantId]/page.tsx`
- Add/modify: `components/grants/*`

- [ ] Add lifecycle header with current stage, owner, approved amount, next obligation, and health explanation.
- [ ] Add Activity/Timeline section.
- [ ] Add Tasks section linked through `task_entity_links`.
- [ ] Add Decisions section.
- [ ] Add Contacts section backed by `grant_contacts`.
- [ ] Improve Reports/Milestones management, including create/edit/complete flows.
- [ ] Show payment conditions and approval state clearly.
- [ ] Show compliance summary: ER status, payout treatment, qualifying distribution links.

Acceptance:

- Grant detail answers: "What is this grant, what is blocking it, what is due next, who owns it, what happened, and what should we do?"

---

## Task 7: Expand Grant Automation

**Files:**
- Modify: `lib/tasks/automation/producers/grants.ts`
- Modify: task automation tests

- [ ] Generate tasks for grant reports due soon, overdue, received review, and approved/closed.
- [ ] Generate tasks for milestones due soon and overdue.
- [ ] Generate tasks for payment approvals and blocked payment conditions.
- [ ] Generate tasks for renewal review.
- [ ] Generate tasks for closeout after grant period end.
- [ ] Generate tasks for unsigned agreements after approval.
- [ ] Add reverse sync for safe completions only.
- [ ] Add contract tests for source keys, entity links, and schema alignment.

Acceptance:

- Grant obligations appear in the canonical task queue.
- Producers are idempotent and close/cancel tasks when source records resolve.

---

## Task 8: Unstub And Align AI Grant Tools

**Files:**
- Modify: `lib/ai/assistant/tool-definitions.ts`
- Modify: `lib/ai/assistant/executor.ts`
- Prefer add: `lib/ai/assistant/executors/grants.ts`
- Add tests

- [ ] Replace the `feature_not_available` branch for grant tools.
- [ ] Implement `get_grant_health`.
- [ ] Implement `get_upcoming_deadlines`.
- [ ] Implement `log_grant_communication`.
- [ ] Implement `record_grant_payment`.
- [ ] Implement `track_milestone`.
- [ ] Implement workflow tools: start due diligence, get status, complete task.
- [ ] Add `draft_grant_summary`, `draft_board_memo`, `identify_grant_risks`, and `prepare_closeout_summary` as non-mutating tools first.
- [ ] Ensure external `organization_id` tool params map internally to `org_id`.
- [ ] Add AI tool schema contract tests for tables and columns.

Acceptance:

- AI can safely help manage grants through active schema-backed tools.
- AI cannot silently approve grants or payments.
- No grant AI tool references nonexistent tables/columns.

---

## Task 9: Upgrade Grant Center

**Files:**
- Modify: `app/dashboard/grants/page.tsx`
- Add/modify: `components/grants/*`

- [ ] Add pipeline view by lifecycle stage.
- [ ] Add table view with filters and saved filter state.
- [ ] Add calendar view for reports, milestones, payments, renewals, closeout.
- [ ] Add payment pipeline view.
- [ ] Add attention queue sorted by risk/due date.
- [ ] Add owner filters.
- [ ] Add empty states that guide creation/import rather than showing dead panels.

Acceptance:

- The Grant Center is an operational command center, not only a dashboard.

---

## Task 10: Reporting, Exports, And Integrations

**Files:**
- Modify: `app/api/portfolio/[id]/grants/export/route.ts`
- Modify: QuickBooks grant export route
- Modify: compliance routes as needed

- [ ] Update exports to use `grants`.
- [ ] Include lifecycle stage, decisions, payment status, report status, and owner in exports.
- [ ] Ensure QuickBooks export reads canonical grant/payment fields.
- [ ] Ensure payout forecast uses grant payments and qualifying distribution links correctly.
- [ ] Add tests for export/query schema alignment.

Acceptance:

- Grant data exports and integrations reflect the lifecycle model.

---

## Task 11: Agent Docs And Backlog

**Files:**
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: backlog document if applicable

- [ ] Document `grants` as the canonical lifecycle table.
- [ ] Document that `grant_details` is not active canon.
- [ ] Document org-scoped API preference.
- [ ] Document lifecycle stage constants.
- [ ] Document AI tool rules: no silent approvals, map `organization_id` to `org_id`.
- [ ] Add remaining gaps to backlog after implementation.

Acceptance:

- Future coding agents do not recreate `grant_details` references or bypass lifecycle helpers.

---

## Verification Plan

Run after each major phase:

```bash
npx tsc --noEmit
npm run test:run -- app/api/__tests__/schema-contract.test.ts lib/__tests__/task-automation-contract.test.ts
npm run test:run -- lib/tasks/automation/__tests__/producers.grants.test.ts
npm run test:run -- lib/__tests__/claude-assistant-schema-contract.test.ts
npm run test:run
```

Manual QA:

- Create a grant from scratch.
- Start due diligence.
- Complete workflow tasks.
- Approve grant with a decision record.
- Generate payment schedule.
- Mark report due/received.
- Log communication.
- Upload document.
- Transition to active, renewal review, closeout, closed.
- Ask AI for grant health and upcoming deadlines.
- Export grants.
- Confirm task queue reflects obligations and resolves correctly.

---

## Definition Of Done

- Clean migrations build grant lifecycle schema without stale `grant_details` references.
- Product UI supports create, edit, monitor, approve/decline, pay, renew, and close out grants.
- Tasks and workflows are linked to grants and obligations.
- AI grant tools are schema-backed, tested, and brand-agnostic.
- Grant dashboards explain risk and next actions.
- Full TypeScript and Vitest suites pass.

