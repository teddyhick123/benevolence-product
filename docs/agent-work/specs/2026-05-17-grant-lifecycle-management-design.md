# Grant Lifecycle Management Design

Build grant lifecycle management into a first-class operating system for grantmakers. The current grant module has useful pieces: grant records, milestones, reports, payments, communications, documents, budgets, health views, workflow templates, task automation, and compliance tie-ins. The next step is to make those pieces feel like one coherent grant lifecycle product.

This spec assumes the platform is still prerelease enough that schema quality should win over backward compatibility. If a table name, lifecycle model, or API shape is confusing, fix it now rather than preserving accidental complexity.

## Product Goal

Grant teams should be able to run the full grant lifecycle in one place:

1. Capture a grant opportunity or request.
2. Run due diligence and internal review.
3. Approve, decline, or defer the grant with an auditable decision record.
4. Generate agreement requirements, milestones, reports, payment schedules, and tasks.
5. Monitor progress, risk, compliance, payments, communications, and documents.
6. Decide renewal or closeout with a full history of what happened.

The product should feel less like "grant data stored in several tabs" and more like an operating cockpit for each grant.

## Current-State Audit

Implemented today:

- `grant_details` stores lifecycle metadata linked one-to-one to a `holding`.
- `grant_milestones`, `grant_reports`, `grant_payments`, `grant_budget_items`, `grant_communications`, `grant_documents`, and `grant_contacts` exist.
- `workflow_templates`, `workflow_instances`, and `workflow_tasks` support due diligence, monitoring, closeout, renewal, and site visit workflows.
- `tasks` and task automation can generate grant-related work.
- `v_grants`, `v_portfolio_grant_summary`, `v_grant_health`, and `get_upcoming_deadlines` provide dashboard data.
- `/dashboard/grants` includes overview, workflows, payments, and communications.
- `/dashboard/grants/[grantId]` includes overview, milestones, communications, documents, and budget.
- Grant exports and QuickBooks grant exports exist.
- Compliance payout forecasting and expenditure responsibility records can reference grant payments/details.

Important gaps:

- The table name `grant_details` is too vague for the central lifecycle record. It also keeps inviting old `grants` vs `grant_details` confusion.
- There is no polished first-class grant creation flow. Many flows infer or auto-create `grant_details` after a holding already exists.
- Lifecycle state is fragmented across holding status, grant period status, workflow status, milestone status, report status, and payment status.
- Approval/decision records are not first-class.
- Agreements and grant requirements are implicit across reports, milestones, payments, documents, and notes.
- Contacts exist in DB but are underexposed.
- Milestone/report management is less complete than payments/documents/budget.
- AI grant tools are defined but currently return `feature_not_available`, despite the schema now existing.
- Risk/health scoring is useful but static. It should explain drivers and recommend next actions.

## Product Principles

1. **One grant record, one lifecycle.** Users should not have to understand holdings vs details vs workflows to manage a grant.
2. **The holding is the financial/portfolio position; the grant is the lifecycle object.** Keep the linkage, but present and model grant operations around the grant.
3. **Every obligation should become trackable work.** Reports, payments, milestones, agreements, follow-ups, renewals, and closeout should all create or resolve canonical tasks.
4. **Approvals and decisions are audit records, not notes.** Grant approvals, declines, deferrals, payment approvals, and renewal decisions need structured history.
5. **Monitoring should be proactive.** The system should show what is due, what is blocked, what is risky, and what changed.
6. **AI should operate through the same product contracts.** AI tools should create/update grants, workflows, tasks, payments, communications, and summaries using the same APIs and schema.
7. **Compliance is embedded, not a side panel.** Payout, ER, restricted funds, grant agreements, and reporting obligations should be visible in context.
8. **Schema should be obvious to future agents.** Prefer direct table names and explicit status models over clever indirection.

## Canonical Data Model

### Recommended Schema Decision

Rename `grant_details` to `grants`.

Rationale:

- `grant_details` is the central lifecycle entity, not a detail extension.
- Product and code already speak in terms of grants.
- The current naming continues to generate confusion in API routes, AI tools, and agent docs.
- The project is prerelease, so this is the right time to make the database match the product language.

Recommended shape:

```sql
CREATE TABLE public.grants (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  portfolio_id uuid NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  holding_id uuid NOT NULL UNIQUE REFERENCES public.holdings(id) ON DELETE CASCADE,

  lifecycle_stage text NOT NULL DEFAULT 'draft'
    CHECK (lifecycle_stage IN (
      'draft',
      'prospect',
      'invited',
      'application_received',
      'due_diligence',
      'recommended',
      'approved',
      'agreement',
      'active',
      'renewal_review',
      'closeout',
      'closed',
      'declined',
      'cancelled'
    )),

  grant_type text,
  requested_amount numeric(20,4),
  approved_amount numeric(20,4),
  currency text NOT NULL DEFAULT 'USD',
  grant_period_start date,
  grant_period_end date,
  renewal_eligible boolean NOT NULL DEFAULT false,
  renewal_date date,
  reporting_frequency text,
  next_report_due date,
  deliverables text,
  purpose text,
  internal_owner_id uuid REFERENCES auth.users(id),
  risk_level text CHECK (risk_level IN ('low', 'medium', 'high')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
```

Notes:

- Keep `holding_id` because grants still participate in portfolio/asset reporting.
- Add explicit `org_id` and `portfolio_id` to avoid repeated joins for authorization and org-scoped automation.
- Keep a temporary compatibility view named `grant_details` only if needed during the refactor. If no active deployments exist, prefer a direct code sweep and no compatibility view.

### `grant_status_history`

Append-only lifecycle history.

Fields:

- `id`
- `grant_id`
- `org_id`
- `from_stage`
- `to_stage`
- `reason`
- `actor_id`
- `metadata`
- `created_at`

Use this for lifecycle timelines, audit, and AI summaries.

### `grant_decisions`

Structured approval, decline, defer, renewal, and closeout decisions.

Fields:

- `id`
- `grant_id`
- `org_id`
- `decision_type`: `approval`, `decline`, `defer`, `renewal`, `closeout`, `payment_release`
- `decision`: `approved`, `declined`, `deferred`, `conditional`, `not_applicable`
- `decision_date`
- `decided_by`
- `amount`
- `conditions`
- `rationale`
- `board_meeting_date`
- `metadata`
- `created_at`

### `grant_requirements`

Unify obligations that are not purely a payment or a freeform milestone.

Fields:

- `id`
- `grant_id`
- `org_id`
- `requirement_type`: `report`, `document`, `milestone`, `site_visit`, `financial_review`, `custom`
- `title`
- `description`
- `due_date`
- `status`: `not_started`, `in_progress`, `received`, `approved`, `overdue`, `waived`, `cancelled`
- `received_at`
- `approved_at`
- `approved_by`
- `source`: `agreement`, `workflow`, `manual`, `ai`, `import`
- `metadata`
- `created_at`, `updated_at`

Recommended consolidation:

- Keep `grant_reports` if report-specific fields remain valuable.
- Keep `grant_milestones` if milestone-specific UI remains valuable.
- Add `grant_requirements` only if we want one obligations model across reports, milestones, documents, and site visits.
- If we do add it, link specialized records back to `grant_requirements.requirement_id`.

### Existing Child Tables

Keep and improve:

- `grant_payments`
- `grant_budget_items`
- `grant_communications`
- `grant_documents`
- `grant_contacts`
- `workflow_instances`
- `workflow_tasks`
- `tasks`
- `task_entity_links`

Add `org_id` to child tables where it materially simplifies RLS, producers, and AI tool execution. Even if inherited through `grant_id`, direct org scope reduces query complexity and future agent mistakes.

## Lifecycle State Machine

Canonical stages:

| Stage | Meaning | Typical Entry |
|-------|---------|---------------|
| `draft` | Internal record started, not yet a real opportunity | Manual create |
| `prospect` | Potential grantee/opportunity being explored | Intake |
| `invited` | Organization invited to submit request | Staff action |
| `application_received` | Request/proposal received | Intake/import/manual |
| `due_diligence` | Staff is reviewing eligibility, finances, risk, and fit | Start workflow |
| `recommended` | Ready for decision | Workflow completion |
| `approved` | Grant approved, not yet fully agreement-ready | Decision record |
| `agreement` | Agreement/conditions being finalized | Approval |
| `active` | Grant is live; monitoring, payments, reports active | Agreement executed |
| `renewal_review` | Renewal decision is underway | Renewal date/task |
| `closeout` | Final report/reconciliation underway | Period end/closeout workflow |
| `closed` | Grant fully closed | Closeout decision |
| `declined` | Request not approved | Decision record |
| `cancelled` | Grant stopped/voided | Staff action |

State transition rules should live in a shared module, not be reimplemented in UI, API, AI, and automation.

## Product Surfaces

### Grant Center

Replace the current tabbed page with a denser operational view:

- Pipeline board by lifecycle stage.
- Table view with saved filters.
- Risk and attention queue.
- Upcoming obligations calendar.
- Payment pipeline.
- Staff ownership filters.
- Search by grantee, EIN, grant purpose, sector, status, amount, date, and owner.

Primary views:

- Pipeline
- Grants
- Tasks
- Payments
- Reports and requirements
- Calendar
- Analytics

### Create Grant Flow

Build a first-class create wizard:

1. **Grantee**
   - Existing investee/holding/donor lookup.
   - New grantee creation.
   - EIN and charity verification hooks where available.
2. **Request**
   - Purpose, requested amount, grant type, program area, period.
3. **Decision Path**
   - Owner, due diligence template, approval route, board meeting date.
4. **Agreement Plan**
   - Reports, milestones, required documents, payment conditions.
5. **Payment Schedule**
   - Single payment or installments with conditions.
6. **Review**
   - Summary and create.

Create should atomically create:

- `holdings`
- `grants`
- optional workflow instance
- report/milestone/payment requirements
- initial tasks

### Grant Detail Workspace

Sections:

- Overview: lifecycle, owner, amount, health, current blockers.
- Activity: status changes, decisions, communications, documents, task events.
- Tasks: all open and completed work linked to the grant.
- Due diligence: workflow instance and task outcomes.
- Requirements: reports, milestones, documents, site visits.
- Payments: schedule, conditions, approvals, disbursement history.
- Budget: approved budget vs actuals.
- Communications: full grantee interaction history.
- Documents: agreement, proposal, reports, financials, correspondence.
- Contacts: primary contacts and roles.
- Compliance: ER status, payout treatment, restrictions, qualifying distribution links.
- AI brief: generated summary, risks, next actions, and draft language.

### Grant Timeline

Every grant should have a single timeline combining:

- Status changes.
- Decisions.
- Workflow task completions.
- Report submissions.
- Payment events.
- Communications.
- Document uploads.
- Task comments.
- AI-generated summaries/actions.

This can be implemented with a query layer over existing event tables plus `grant_status_history` and `grant_decisions`.

## Automation

### Task Producers

Add or expand producers for:

- Grant report due soon, overdue, received, approved.
- Milestone due soon, overdue, completed, cancelled.
- Payment approval needed.
- Payment condition blocked.
- Payment scheduled soon.
- Renewal review due.
- Closeout due.
- Site visit follow-up due.
- Agreement still unsigned after approval.

Every producer must:

- Use one source-record-scoped `source_key`.
- Update existing tasks rather than creating duplicates.
- Cancel/complete tasks when the source record resolves.
- Link tasks to `grant`, `holding`, and the specific obligation record.

### Reverse Sync

Safe reverse sync rules:

- Completing a `grant_milestone` task can mark the milestone completed only if `completed_date` is supplied or defaults to today.
- Completing a report review task can mark a report received/approved only through an explicit action.
- Completing a payment approval task should not mark payment completed; it can move `scheduled` to `approved`.
- Completing a closeout workflow can move `closeout` to `closed` only after required tasks are complete.

## AI Capabilities

Unstub and implement grant AI tools against the active schema:

- `create_grant`
- `update_grant_stage`
- `start_due_diligence`
- `get_workflow_status`
- `complete_workflow_task`
- `track_milestone`
- `schedule_reminder`
- `get_upcoming_deadlines`
- `log_grant_communication`
- `get_grant_health`
- `record_grant_payment`
- `draft_grant_summary`
- `draft_board_memo`
- `identify_grant_risks`
- `prepare_closeout_summary`

Guardrails:

- Tool schemas may accept `organization_id` externally for provider compatibility, but executors map to `org_id`.
- All writes go through shared service functions where possible.
- AI cannot approve grants or payments silently. It can draft, recommend, or create approval tasks.
- AI actions must be logged and undoable where practical.
- No brand-specific language in tool names, descriptions, prompts, or outputs.

## API Architecture

Recommended API surface:

- `GET /api/org/[orgId]/grants`
- `POST /api/org/[orgId]/grants`
- `GET /api/org/[orgId]/grants/[grantId]`
- `PATCH /api/org/[orgId]/grants/[grantId]`
- `POST /api/org/[orgId]/grants/[grantId]/transition`
- `GET/POST/PATCH /api/org/[orgId]/grants/[grantId]/requirements`
- `GET/POST/PATCH /api/org/[orgId]/grants/[grantId]/payments`
- `GET/POST/PATCH /api/org/[orgId]/grants/[grantId]/communications`
- `GET/POST/DELETE /api/org/[orgId]/grants/[grantId]/documents`
- `GET/POST/PATCH /api/org/[orgId]/grants/[grantId]/contacts`
- `GET /api/org/[orgId]/grants/[grantId]/timeline`
- `GET /api/org/[orgId]/grants/analytics`

Keep portfolio-scoped routes only where portfolio context is primary, such as summary dashboards and exports. Grant lifecycle operations should be org-scoped first.

## Reporting And Analytics

Grant analytics should answer:

- How much is requested, approved, scheduled, and disbursed?
- Which grants are blocked by missing reports, conditions, or approvals?
- Which grants are at risk?
- What is due this week/month/quarter?
- What is the grant cycle time from application to approval?
- What percent of active grants are on track?
- What is the renewal pipeline?
- How much payment pipeline counts toward payout forecast?
- Which program areas, geographies, and grantee types dominate the portfolio?

## Permissions And Audit

Minimum permission model:

- Org members can view grant records they can view through portfolio/org membership.
- Portfolio editors can edit grant lifecycle records.
- Org admins can manage all grant records.
- Approval actions require org admin or explicit approver role.
- Payment completion/export actions require admin or finance-capable role.
- Service role can run automation.

Audit requirements:

- Status transitions append `grant_status_history`.
- Decisions append `grant_decisions`.
- Payment status changes are evented.
- AI writes create action records.
- Tasks generate task events.

## Implementation Priorities

### Phase 0: Schema and Naming Cleanup

- Rename `grant_details` to `grants`.
- Add direct `org_id`, `portfolio_id`, `lifecycle_stage`, owner, requested/approved amount, purpose, and deleted fields.
- Update all child tables, views, routes, components, producers, AI definitions, and docs.
- Add contract tests preventing new `grant_details` references unless intentionally kept as a compatibility view.

### Phase 1: First-Class Create/Edit

- Build `POST/PATCH /api/org/[orgId]/grants`.
- Build a grant create wizard.
- Create holding and grant atomically.
- Generate initial workflow, requirements, payment schedule, and tasks.

### Phase 2: Lifecycle And Decisions

- Implement transition endpoint and state machine.
- Add `grant_status_history`.
- Add `grant_decisions`.
- Build approval/decline/defer/renewal/closeout decision UI.

### Phase 3: Requirements And Monitoring

- Decide whether to add `grant_requirements` or strengthen reports/milestones separately.
- Build requirements dashboard in grant detail.
- Add producers for reports, milestones, payments, renewal, agreement, and closeout.

### Phase 4: AI Grant Tools

- Replace `feature_not_available` stubs with real executors.
- Add schema contract tests for every grant AI tool.
- Add action logging and undo where applicable.
- Add AI board memo, grant brief, risk summary, and closeout summary tools.

### Phase 5: Product Polish

- Replace current grant dashboard with pipeline/table/calendar/payment views.
- Add timeline.
- Add contact management.
- Improve health scoring explanations and next actions.
- Add saved filters and export improvements.

## Acceptance Criteria

The feature is ready when:

- A user can create a grant from scratch without first creating a holding manually.
- A grant has one clear lifecycle stage and transition history.
- Approval, decline, renewal, and closeout decisions are structured records.
- Reports, milestones, payments, and agreement obligations produce canonical tasks.
- Grant dashboard surfaces risk, deadlines, payment pipeline, and owner accountability.
- Grant detail shows a coherent timeline and next actions.
- AI grant tools are live, schema-aligned, and covered by contract tests.
- Full TypeScript and Vitest suites pass.
- Clean migrations create the entire grant lifecycle system without stale table or column references.

