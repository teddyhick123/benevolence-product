# Grant Lifecycle Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the existing grant module into a coherent grant lifecycle product: first-class grant creation, explicit lifecycle stages, decisions, requirements, automation, AI tools, and a polished grant workspace.

**Design Spec:** `/docs/agent-work/specs/2026-05-17-grant-lifecycle-management-design.md`

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
| Requirements | Deferred to Phase 3 | `grant_requirements` is intentionally out of scope for Tasks 1–4. Tasks 7–9 use `grant_reports`, `grant_milestones`, and `grant_payments` directly. Add `grant_requirements` only if a unified obligations model proves necessary after automation is in place. |

---

## File Map

| Area | Files |
|------|-------|
| DB schema | `db/migrations/0041_task_workflow_foundation.sql` (in-place rewrite of grant section), `db/migrations/0009_grants.sql` (comment update only) |
| Grant lifecycle module | `lib/grants/lifecycle.ts` (new) |
| Grant schemas/types | `lib/schemas/grant.ts` |
| Grant dashboard | `app/dashboard/grants/page.tsx`, `components/grants/*` |
| Grant detail | `app/dashboard/grants/[grantId]/page.tsx` |
| Grant org-scoped APIs (new) | `app/api/org/[orgId]/grants/route.ts`, `app/api/org/[orgId]/grants/[grantId]/route.ts`, `app/api/org/[orgId]/grants/[grantId]/transition/route.ts`, `app/api/org/[orgId]/grants/[grantId]/decisions/route.ts` |
| Grant portfolio-scoped APIs (existing, sweep only) | `app/api/portfolio/[id]/grants/**`, `app/api/org/[orgId]/workflows/**`, `app/api/portfolio/[id]/compliance/payout-forecast/route.ts` |
| Stale grant-details route (delete) | `app/api/portfolio/[id]/holdings/[holdingId]/grant-details/route.ts` |
| Milestone routes (sweep) | `app/api/portfolio/[id]/holdings/[holdingId]/milestones/route.ts`, `app/api/portfolio/[id]/holdings/[holdingId]/milestones/[milestoneId]/route.ts` |
| Task producers | `lib/tasks/automation/producers/grants.ts` |
| AI tools | `lib/ai/assistant/tool-definitions.ts`, `lib/ai/assistant/executor.ts`, `lib/ai/assistant/executors/grants.ts` (new) |
| Module registry | `lib/modules/registry.ts`, `lib/modules/client-info.ts` |
| Components (sweep) | `components/grants/CommunicationLog.tsx`, `components/grants/PaymentSchedule.tsx`, `components/grants/WorkflowManager.tsx` |
| Pages (sweep) | `app/dashboard/holdings/[holdingId]/page.tsx`, `app/dashboard/grants/[grantId]/page.tsx` |
| Integrations (sweep) | `app/api/integrations/quickbooks/export/grants/route.ts`, `app/api/org/[orgId]/dashboard/route.ts` |
| Contract tests | `app/api/__tests__/schema-contract.test.ts`, `lib/__tests__/grant-lifecycle-contract.test.ts` (new), `lib/__tests__/task-automation-contract.test.ts`, `lib/__tests__/task-workflow-schema-contract.test.ts` |
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
- Modify in-place: `db/migrations/0041_task_workflow_foundation.sql` (rewrite the grant table definition and child table FKs — this is prerelease, not an ALTER TABLE migration)
- Comment update: `db/migrations/0009_grants.sql`
- Delete: `app/api/portfolio/[id]/holdings/[holdingId]/grant-details/route.ts`
- Sweep (update `.from('grant_details')` references):
  - `components/grants/CommunicationLog.tsx`
  - `components/grants/PaymentSchedule.tsx`
  - `components/grants/WorkflowManager.tsx`
  - `app/dashboard/holdings/[holdingId]/page.tsx`
  - `app/dashboard/grants/[grantId]/page.tsx`
  - `lib/modules/registry.ts`
  - `app/api/portfolio/[id]/holdings/[holdingId]/milestones/route.ts`
  - `app/api/portfolio/[id]/holdings/[holdingId]/milestones/[milestoneId]/route.ts`
  - `lib/tasks/automation/__tests__/producers.grants.test.ts`
  - `app/api/portfolio/[id]/compliance/payout-forecast/route.ts`
  - `lib/tasks/automation/producers/grants.ts`
  - `lib/ai/assistant/tool-definitions.ts`
  - `lib/ai/assistant/executor.ts`
  - `lib/__tests__/task-automation-contract.test.ts`
  - `lib/__tests__/task-workflow-schema-contract.test.ts`
  - `app/api/org/[orgId]/workflows/route.ts`
  - `app/api/org/[orgId]/dashboard/route.ts`
  - `app/api/integrations/quickbooks/export/grants/route.ts`
- Immediately update agent docs (do not wait for Task 11):
  - `CLAUDE.md` — update grant table canon note to `grants` (not `grant_details`)
  - `AGENTS.md` — same

- [ ] In `0041_task_workflow_foundation.sql`, rename `public.grant_details` to `public.grants` in the table definition.
- [ ] Add `org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE` to `grants`.
- [ ] Add `portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE` to `grants`.
- [ ] Keep `holding_id uuid NOT NULL UNIQUE REFERENCES holdings(id)`.
- [ ] Add `lifecycle_stage text NOT NULL DEFAULT 'draft' CHECK (lifecycle_stage IN ('draft','prospect','invited','application_received','due_diligence','recommended','approved','agreement','active','renewal_review','closeout','closed','declined','cancelled'))`.
- [ ] Add `requested_amount numeric(20,4)`, `approved_amount numeric(20,4)`, `currency text NOT NULL DEFAULT 'USD'`, `purpose text`, `internal_owner_id uuid REFERENCES auth.users(id)`, `risk_level text CHECK (risk_level IN ('low','medium','high'))`, `deleted_at timestamptz`.
- [ ] Update all child table FKs in `0041` from `REFERENCES public.grant_details(id)` to `REFERENCES public.grants(id)`.
- [ ] Update views `v_grants`, `v_portfolio_grant_summary`, `v_grant_health` to reference `public.grants`.
- [ ] Update RPC `get_upcoming_deadlines` to reference `public.grants`.
- [ ] Simplify RLS policies on child tables to use `grants.org_id` directly instead of the `grant_details → holdings` subquery join.
- [ ] Update `0009_grants.sql` comment to say the canonical table is now `public.grants` in migration 0041 (not `grant_details`).
- [ ] Delete `app/api/portfolio/[id]/holdings/[holdingId]/grant-details/route.ts` — superseded by the org-scoped grant detail route in Task 4.
- [ ] Sweep all 18 files listed above: replace `.from('grant_details')` with `.from('grants')`, update nested select strings `grant_details(...)` → `grants(...)`, update any string literals or comments.
- [ ] Immediately update `CLAUDE.md` grant table canon note (do not defer to Task 11): change "canonical grant lifecycle parent is `grant_details.id`" and "There is no `grants` table" to reflect the rename.
- [ ] Run `rg "grant_details" app components lib db AGENTS.md CLAUDE.md` — fix any remaining matches before proceeding.
- [ ] Run `npx tsc --noEmit` — zero errors.
- [ ] Run `npm run test:run -- lib/__tests__/grant-lifecycle-contract.test.ts` — contract tests for `grants` naming now pass.

Acceptance:

- `rg "grant_details" app components lib db AGENTS.md CLAUDE.md` returns no active stale references. The only permitted match is a comment in `0009_grants.sql` explaining the old naming and a comment in any contract test that explicitly guards against reintroduction.
- `CLAUDE.md` correctly documents `grants` as the canonical table immediately after this task.
- Clean TypeScript and schema contract tests pass.

---

## Task 3: Add Lifecycle History And Decisions

**Files:**
- Modify: `db/migrations/0041_task_workflow_foundation.sql`
- Add: `lib/grants/lifecycle.ts`
- Add/modify: grant API routes

- [ ] Add `grant_status_history` table to `0041`:

```sql
CREATE TABLE IF NOT EXISTS public.grant_status_history (
  id          uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  grant_id    uuid NOT NULL REFERENCES public.grants(id) ON DELETE CASCADE,
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  from_stage  text,
  to_stage    text NOT NULL,
  reason      text,
  actor_id    uuid REFERENCES auth.users(id),
  metadata    jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grant_status_history_grant ON public.grant_status_history(grant_id);
```

- [ ] Add `grant_decisions` table to `0041`:

```sql
CREATE TABLE IF NOT EXISTS public.grant_decisions (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  grant_id          uuid NOT NULL REFERENCES public.grants(id) ON DELETE CASCADE,
  org_id            uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  decision_type     text NOT NULL CHECK (decision_type IN ('approval','decline','defer','renewal','closeout','payment_release')),
  decision          text NOT NULL CHECK (decision IN ('approved','declined','deferred','conditional','not_applicable')),
  decision_date     date NOT NULL,
  decided_by        uuid REFERENCES auth.users(id),
  amount            numeric(20,4),
  conditions        text,
  rationale         text,
  board_meeting_date date,
  metadata          jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_grant_decisions_grant ON public.grant_decisions(grant_id);
```

- [ ] Add RLS policies for both tables (read: `can_view_org(org_id)`, write: `is_org_admin(org_id)`, service: unrestricted).

- [ ] Create `lib/grants/lifecycle.ts` with the canonical allowed transition map:

```typescript
export const LIFECYCLE_STAGES = [
  'draft', 'prospect', 'invited', 'application_received',
  'due_diligence', 'recommended', 'approved', 'agreement',
  'active', 'renewal_review', 'closeout', 'closed',
  'declined', 'cancelled',
] as const;

export type LifecycleStage = typeof LIFECYCLE_STAGES[number];

export const ALLOWED_TRANSITIONS: Record<LifecycleStage, LifecycleStage[]> = {
  draft:                ['prospect', 'cancelled'],
  prospect:             ['invited', 'application_received', 'declined', 'cancelled'],
  invited:              ['application_received', 'declined', 'cancelled'],
  application_received: ['due_diligence', 'declined', 'cancelled'],
  due_diligence:        ['recommended', 'declined', 'cancelled'],
  recommended:          ['approved', 'declined', 'cancelled'],
  approved:             ['agreement', 'declined', 'cancelled'],
  agreement:            ['active', 'cancelled'],
  active:               ['renewal_review', 'closeout', 'cancelled'],
  renewal_review:       ['active', 'closeout', 'declined', 'cancelled'],
  closeout:             ['closed', 'cancelled'],
  closed:               [],
  declined:             [],
  cancelled:            [],
};

// Stages that require a grant_decisions record before the transition is committed.
export const DECISION_REQUIRED_TRANSITIONS = new Set<`${LifecycleStage}->${LifecycleStage}`>([
  'recommended->approved',
  'recommended->declined',
  'active->renewal_review',
  'renewal_review->active',
  'closeout->closed',
  'approved->declined',
]);

export function canTransition(from: LifecycleStage, to: LifecycleStage): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function requiresDecision(from: LifecycleStage, to: LifecycleStage): boolean {
  return DECISION_REQUIRED_TRANSITIONS.has(`${from}->${to}`);
}
```

- [ ] Export `transitionGrant(grantId, toStage, actorId, reason?, decisionPayload?)` from `lib/grants/lifecycle.ts`:
  - Validates the transition is allowed via `canTransition`.
  - If `requiresDecision`, inserts a `grant_decisions` row.
  - Updates `grants.lifecycle_stage`.
  - Appends a `grant_status_history` row.
  - All three writes in a single Supabase transaction (use `rpc` with a Postgres function or sequential writes with rollback on error).
  - Throws if transition is invalid.

- [ ] Add `POST /api/org/[orgId]/grants/[grantId]/transition` — body: `{ to_stage, reason?, decision? }`. Calls `transitionGrant`. Requires org membership.
- [ ] Add `POST /api/org/[orgId]/grants/[grantId]/decisions` — body matches `grant_decisions` insert shape. Standalone decision record without a lifecycle change (e.g., payment release).
- [ ] Add contract test in `lib/__tests__/grant-lifecycle-contract.test.ts` that imports `ALLOWED_TRANSITIONS` and asserts terminal stages (`closed`, `declined`, `cancelled`) have no forward transitions.
- [ ] Add contract test that `DECISION_REQUIRED_TRANSITIONS` only references valid stage pairs that exist in `ALLOWED_TRANSITIONS`.

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

- [ ] Add `GET /api/org/[orgId]/grants` — query params: `stage`, `owner_id`, `risk_level`, `due_before` (ISO date), `q` (search), `portfolio_id`. Returns paginated grant rows joined with holding name and grantee name.

- [ ] Add `POST /api/org/[orgId]/grants` — create endpoint that atomically creates a `holdings` row and a `grants` row. Accept this request body:

```typescript
interface CreateGrantBody {
  portfolio_id: string;          // required — determines asset/portfolio context
  // Grantee — provide investee_id OR new_grantee, not both
  investee_id?: string;          // link to existing investee (holding auto-created if absent)
  new_grantee?: {
    display_name: string;
    ein?: string;
    sector?: string;
    country?: string;
    city?: string;
  };
  // Grant fields
  purpose: string;
  requested_amount: number;
  currency?: string;             // default 'USD'
  grant_type?: string;
  grant_period_start?: string;   // ISO date
  grant_period_end?: string;
  lifecycle_stage?: string;      // default 'draft'
  internal_owner_id?: string;
  risk_level?: 'low' | 'medium' | 'high';
  reporting_frequency?: string;
  renewal_eligible?: boolean;
  // Optional initial setup
  workflow_template_id?: string;
}
```

  Response `201`:

```typescript
interface CreateGrantResponse {
  grant: Grant;      // the new grants record
  holding: Holding;  // the auto-created holding
}
```

  Implementation notes:
  - If `investee_id` is provided, look up the investee and create a `holdings` row of `asset_type='foundation_grant'` linked to that investee.
  - If `new_grantee` is provided, insert into `investees` first, then create the holding.
  - Insert `grants` row with `holding_id`, `org_id`, `portfolio_id` (from the holding), and all grant fields.
  - If `workflow_template_id` is provided, create a `workflow_instances` row linked to the new grant holding.
  - Perform all writes atomically — if any step fails, return 500 with no partial records.

- [ ] Add `GET /api/org/[orgId]/grants/[grantId]` — return the full grant with holding, health (from `v_grant_health`), open tasks (`task_entity_links`), recent payments, recent communications, and lifecycle history.

- [ ] Add `PATCH /api/org/[orgId]/grants/[grantId]` — partial update of grant fields (`purpose`, `requested_amount`, `approved_amount`, `internal_owner_id`, `risk_level`, `reporting_frequency`, `renewal_eligible`, `grant_period_start`, `grant_period_end`). Lifecycle stage changes must go through the `/transition` endpoint.

- [ ] Keep existing portfolio routes unchanged for now — make org-scoped APIs the product surface without breaking existing calls.

- [ ] Add Vitest tests: 401 with no session, 403 with non-member session, 201 with valid body (check both `grant` and `holding` in response), 422 with neither `investee_id` nor `new_grantee`.

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
