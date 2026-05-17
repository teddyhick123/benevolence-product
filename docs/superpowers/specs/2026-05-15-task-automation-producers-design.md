# Task Automation Producers Design

Build the automation layer that turns platform obligations into useful, explainable tasks. The task/workflow foundation is already in place; this spec defines how scheduled and event-driven producers should create, update, escalate, and close canonical `tasks` across grants, compliance, pledges, imports, and report approvals.

This is not a notification project yet. The output of this project is a high-quality task graph. Notification delivery should consume task events after producers are trustworthy.

## Product Goal

The platform should proactively tell each organization what needs attention before work slips. A user should not have to open compliance, grants, pledges, and imports one by one to discover obligations. The system should create one clear task per actionable obligation, assign it to the right person when possible, explain why it exists, and close it when the source record is resolved.

## Current Foundation

Already implemented:

- `tasks`, `task_entity_links`, `task_comments`, `task_events`, `notification_events`
- `workflow_templates`, `workflow_instances`, `workflow_tasks`
- `/api/org/[orgId]/tasks`
- `/api/org/[orgId]/workflow-templates`
- `/api/org/[orgId]/workflows`
- `/org/[orgId]/tasks`
- Grant workflow templates instantiate canonical tasks

Still missing:

- Scheduled producers that scan source tables and create tasks
- Event repair/reconciliation when source records change
- Source-specific idempotency and escalation rules
- Contract tests proving producers only target active schema objects
- Admin observability for producer runs and failures

## Product Principles

1. **One actionable task per obligation.** Do not create multiple open tasks for the same installment, report, filing, or import state.
2. **Every generated task must explain itself.** Title, description, `source_key`, `metadata.reason`, and entity links should tell users why the task exists.
3. **Automation is idempotent.** Running a producer repeatedly should update or close existing tasks, not create duplicates.
4. **Resolution flows both ways.** If a source record is resolved, linked generated tasks should close. If a task is completed, source records may be updated only when the mapping is safe and explicit.
5. **Assignments should be helpful, not magical.** Prefer an obvious owner from the source record; otherwise leave unassigned or assign to org admins based on producer policy.
6. **Escalation should update tasks, not fork them.** As dates move from due soon to overdue, update priority, due date, and description on the existing task where possible.
7. **Producers must be replayable.** A job can be run for all orgs, one org, one producer, or one source record for repair/backfill.

## Non-Goals

- Email digest delivery
- In-app notification center
- Full external workflow orchestration
- User-defined automation builder
- Team/group assignment model
- Recurring manual tasks unrelated to source records

## Architecture

### Producer Runtime

Add a small task automation service layer:

- `lib/tasks/automation/types.ts`
- `lib/tasks/automation/task-writer.ts`
- `lib/tasks/automation/producers/compliance.ts`
- `lib/tasks/automation/producers/pledges.ts`
- `lib/tasks/automation/producers/grants.ts`
- `lib/tasks/automation/producers/imports.ts`
- `lib/tasks/automation/producers/reports.ts`
- `lib/tasks/automation/run.ts`

Add a protected job route:

- `POST /api/jobs/tasks/generate`

Supported body/query:

- `producer`: optional producer id, such as `compliance_deadlines`
- `org_id`: optional targeted org
- `source_type`: optional source entity type
- `source_id`: optional source record id
- `dry_run`: optional boolean
- `now`: optional ISO timestamp for tests/manual repair

Authentication:

- Require `CRON_SECRET` or equivalent job secret header.
- Never rely on user cookies for job execution.
- Use service/admin Supabase client.

### Producer Output Contract

Every producer returns:

```typescript
type TaskProducerResult = {
  producer: string;
  orgId?: string;
  scanned: number;
  created: number;
  updated: number;
  completed: number;
  skipped: number;
  errors: Array<{
    sourceType: string;
    sourceId: string;
    message: string;
  }>;
};
```

### Generated Task Contract

All generated tasks use:

- `source = 'automation'`
- stable `source_key`
- `task_type` from `reminder`, `follow_up`, `review`, or `approval`
- `metadata.producer`
- `metadata.reason`
- `metadata.source_status`
- `metadata.generated_at`
- `metadata.escalation_state`
- at least one `task_entity_links` row

Recommended metadata shape:

```json
{
  "producer": "pledge_follow_up",
  "reason": "Installment is overdue by 17 days",
  "source_status": "pending",
  "escalation_state": "overdue_14",
  "generated_at": "2026-05-15T12:00:00.000Z",
  "source_due_date": "2026-04-28"
}
```

### Canonical Entity Types

All `entity_type` values used in `task_entity_links` must come from this list, defined as a const in `lib/tasks/automation/types.ts`:

```typescript
export const TASK_ENTITY_TYPES = [
  'filing',
  'state_registration',
  'pledge_installment',
  'pledge',
  'donor',
  'grant_milestone',
  'grant_report',
  'grant_payment',
  'grant',
  'holding',
  'portfolio',
  'import_job',
  'workflow_instance',
] as const;

export type TaskEntityType = typeof TASK_ENTITY_TYPES[number];
```

Do not introduce entity type strings inline in producer code — always import from this list. The contract test reads `TASK_ENTITY_TYPES` and verifies every `entity_type` string in producer source code is present.

## Task Writer

Create one shared writer so each producer does not duplicate idempotency logic.

### `upsertGeneratedTask`

Inputs:

- `orgId`
- `portfolioId`
- `sourceKey`
- `title`
- `description`
- `taskType`
- `priority`
- `dueAt`
- `assignedTo`
- `metadata`
- `links`

Behavior:

1. Look up non-deleted `tasks` by `(org_id, source_key)`.
2. If no task exists, insert task, links, and `task_events.created`.
3. If open task exists, patch mutable fields:
   - `title`
   - `description`
   - `priority`
   - `due_at`
   - `assigned_to`
   - `metadata`
4. Insert `task_events.status_changed`, `due_date_changed`, or `assigned` when those fields change.
5. Ensure all links exist.
6. If existing task is completed/cancelled, do not reopen unless producer policy says `reopenResolved: true`.

### `completeGeneratedTasks`

Inputs:

- `orgId`
- `sourceKey` — exact match, or a source-record-level prefix ending in `:` (e.g., `pledge_installment:{id}:`)
- `reason`
- `actorId = null`

Prefix matching scope: a prefix must be scoped to a single source record, never to a producer or source type. `pledge_installment:{id}:` is safe. `pledge_installment:` would close all pledge installment tasks across the org and is forbidden. Enforce this in the writer with an assertion: a prefix must contain at least two `:` separators.

Behavior:

1. Find non-deleted open tasks matching the key.
2. Set `status = 'completed'`, `completed_at = now()`.
3. Add `metadata.completed_by_automation = true`.
4. Insert `task_events.completed`.

### `cancelGeneratedTasks`

Used when a source record is cancelled, waived, no longer applicable, or deleted.

Inputs:

- `orgId`
- `sourceKey` or `sourceKeyPrefix` (same scoping rules as `completeGeneratedTasks`)
- `cancelReason`
- `actorId = null`

Behavior:

- Set `status = 'cancelled'`
- Do not set `completed_at`
- Store `metadata.cancel_reason`
- Insert `task_events.cancelled`

## Assignment Policy

Producer assignment order:

1. Source-specific owner field if present and active org member:
   - `pledges.relationship_manager`
   - `filing_calendar.completed_by` should not be used as owner
   - future grant owner fields if added
2. Portfolio owner/admin if the source is portfolio-scoped and there is a clear owner.
3. Leave unassigned for shared operational queues.

Do not assign to a user unless they are an active `organization_members` row for the org.

Future enhancement: org-level automation defaults, such as compliance owner, grants owner, donor operations owner.

## Producer 1: Compliance Deadlines

Producer id: `compliance_deadlines`

Source tables:

- `filing_calendar`
- `state_registrations`

### Filing Reminder Tasks

Scan:

- `filing_calendar.status IN ('upcoming', 'in_progress', 'extended')`
- Use `extension_due_date` when status is `extended` and the extension date exists; otherwise use `due_date`.
- Create/update a reminder task once the current date is within the earliest reminder window (the largest value in `filing_calendar.reminder_days`, e.g., 30 days) and the effective due date is not past.

Task:

- `task_type = 'reminder'`
- `priority = 'normal'` for 15+ days remaining
- `priority = 'high'` for 8–14 days remaining
- `priority = 'urgent'` for 7 days or fewer remaining
- `due_at = effective_due_date at 09:00 UTC`
- `source_key = filing:{filing_id}:reminder`
- `metadata.escalation_state`:
  - `reminder_30` for 15+ days remaining
  - `reminder_14` for 8–14 days remaining
  - `reminder_7` for 7 days or fewer remaining

There is exactly one reminder task per filing. Each producer run updates priority, description, and `escalation_state` on the existing task as the due date approaches — it never creates a second reminder task. This satisfies principle 1 (one task per obligation) and principle 6 (escalation updates tasks, not forks them).

Links:

- `filing` primary

Title examples:

- `Prepare Form 990-PF filing`
- `Prepare California annual report`

Resolution:

- When status becomes `filed`, complete open reminder/overdue tasks for the filing.
- When status becomes `waived` or `not_applicable`, cancel open reminder/overdue tasks for the filing.

### Filing Overdue Tasks

Scan:

- `filing_calendar.status IN ('upcoming', 'in_progress', 'extended', 'overdue')`
- Effective due date is before current date.

Task:

- `task_type = 'reminder'`
- `priority = 'urgent'`
- `source_key = filing:{filing_id}:overdue`
- `metadata.escalation_state`:
  - `overdue_1` for 1-6 days
  - `overdue_7` for 7-29 days
  - `overdue_30` for 30+ days

Side effect:

- Optionally update `filing_calendar.status = 'overdue'` when status is not already overdue and not filed/waived/not applicable.
- Complete or cancel the open `filing:{filing_id}:reminder` task when creating the overdue task so the filing never has two open generated tasks.

### State Registration Renewal Tasks

Scan:

- `state_registrations.status IN ('active', 'renewal_due')`
- `renewal_due_date IS NOT NULL`
- Windows: 60, 30, 14, 7, overdue

Task:

- `task_type = 'reminder'`
- `priority = 'normal'` for 31+ days remaining
- `priority = 'high'` for 8–30 days remaining
- `priority = 'urgent'` for 7 days or fewer / overdue
- `source_key = state_registration:{id}:renewal`
- `metadata.escalation_state`:
  - `renewal_60` for 31+ days remaining
  - `renewal_30` for 15–30 days remaining
  - `renewal_14` for 8–14 days remaining
  - `renewal_7` for 7 days or fewer remaining
  - `overdue` when past `renewal_due_date`

There is exactly one renewal task per state registration, updated in place as the window tightens.

Links:

- `state_registration` primary

Side effect:

- Set `state_registrations.status = 'renewal_due'` when inside 30 days and still `active`.
- Set `status = 'expired'` only when `expiration_date` is past, not merely renewal due date.

## Producer 2: Pledge Follow-Up

Producer id: `pledge_follow_up`

Source tables:

- `pledges`
- `pledge_installments`
- `donors`

Scan:

- `pledges.status = 'active'`
- `pledges.deleted_at IS NULL`
- `pledge_installments.status = 'pending'`

### Upcoming Installments

Window:

- Due in the next 14 days.

Task:

- `task_type = 'follow_up'`
- `priority = 'normal'`
- `due_at = pledge_installments.due_date at 09:00`
- `assigned_to = pledges.relationship_manager` when active org member
- `source_key = pledge_installment:{id}:due_soon`

Links:

- `pledge_installment` primary
- `pledge` context
- `donor` context

Description includes:

- installment amount
- due date
- pledge campaign/fund designation when present
- donor display name when available

### Overdue Installments

Window:

- Due date before current date.

Task:

- Prefer updating/creating one overdue task:
  - `source_key = pledge_installment:{id}:overdue`
- Complete any open due-soon task for the same installment.
- Priority:
  - 1-6 days: `high`
  - 7+ days: `urgent`
- `metadata.escalation_state`:
  - `overdue_1`
  - `overdue_7`
  - `overdue_30`

Resolution:

- If installment status becomes `paid`, complete linked due/overdue tasks.
- If status becomes `waived` or `written_off`, cancel linked due/overdue tasks.
- If parent pledge becomes `cancelled`, cancel all open generated tasks for pending installments.

## Producer 3: Grant Obligations

Producer id: `grant_obligations`

Source tables:

- `grants`
- `holdings`
- `grant_milestones`
- `grant_reports`
- `grant_payments`

Org scoping note: `grants` is the canonical grant lifecycle parent and carries `org_id`, `portfolio_id`, and `holding_id` directly. `grant_milestones`, `grant_reports`, and `grant_payments` still scope through their `grant_id` FK, so producers should join through `grants!inner(org_id, portfolio_id, holding_id)` or fetch org-scoped grant IDs first. Do not recreate or target the old `grant_details` table.

Entity ID convention: for entity links with `entity_type = 'grant'`, always use `grants.id`. `grant_milestones`, `grant_reports`, and `grant_payments` all FK directly to `grants.id` after migration `0041_task_workflow_foundation.sql`.

### Grant Milestone Tasks

Scan:

- `grant_milestones.status IN ('pending', 'in_progress', 'overdue')`
- `due_date IS NOT NULL`

Window:

- Due within 30 days or overdue.

Task:

- `task_type = 'review'`
- `priority = 'normal'` for 15-30 days
- `priority = 'high'` for 1-14 days
- `priority = 'urgent'` when overdue
- `source_key = grant_milestone:{id}:due`

Links:

- `grant_milestone` primary
- `grant` context
- `holding` context
- `portfolio` context

Resolution:

- Complete when `grant_milestones.status = 'completed'`.
- Cancel when `status = 'cancelled'`.
- If a task is completed from the inbox, update the linked milestone to `completed`. This reverse sync lives in `app/api/org/[orgId]/tasks/[taskId]/complete/route.ts`: after writing the task completion, check if `task.metadata.producer = 'grant_obligations'` and a `task_entity_links` row with `entity_type = 'grant_milestone'` exists; if so, set `status = 'completed'` and `completed_date = current_date` on that milestone. Both fields must be set together — the DB enforces `CHECK ((status = 'completed' AND completed_date IS NOT NULL) OR (status != 'completed'))` and will reject partial updates.

### Grant Report Tasks

Schema note: `grant_reports` is created directly in migration `0041_task_workflow_foundation.sql` with `grant_reports.grant_id -> grants.id`. `grant_details` is the old name and must not be used by new producers.

Scan:

- `COALESCE(grant_reports.submitted_date::timestamptz, grant_reports.received_at) IS NULL`
- `due_date IS NOT NULL`

Window:

- Due within 45 days or overdue.

Task:

- `task_type = 'review'`
- `priority = 'normal'` for 16-45 days
- `priority = 'high'` for 1-15 days
- `priority = 'urgent'` when overdue
- `source_key = grant_report:{id}:due`

Links:

- `grant_report` primary
- `grant` context
- `holding` context
- `portfolio` context

Resolution:

- Complete when either `submitted_date` or `received_at` is present. `submitted_date` exists in active migration `0041`; `received_at` is the original completion field from `0009`.

### Grant Payment Condition Tasks

Scan:

- `grant_payments.status IN ('scheduled', 'approved', 'processing')`
- `scheduled_date IS NOT NULL`
- `conditions_met = false`

Window:

- Scheduled within 14 days or overdue.

Task:

- `task_type = 'approval'`
- `priority = 'high'` before due
- `priority = 'urgent'` when overdue
- `source_key = grant_payment:{id}:conditions`

Links:

- `grant_payment` primary
- `grant` context
- `holding` context

Resolution:

- Complete when `conditions_met = true` or payment status becomes `completed`.
- Cancel when status becomes `cancelled` or `returned`.

## Producer 4: Import Review

Producer id: `import_review`

Source tables:

- `import_jobs`

Scan:

- Import jobs where `status` indicates user review, validation failure, failed processing, or ready-to-commit state.
- Because `import_status_enum` is the canonical source, implementation must inspect the enum values before coding final filters.

Initial status mapping:

- Error/review task when:
  - `error_rows > 0`
  - `rejected_rows > 0`
  - `error_message IS NOT NULL`
  - `ai_data_quality_report` indicates warnings/errors
- Approval task when:
  - rows are processed
  - `approved_rows > 0`
  - job is not completed
  - `reviewed_by IS NULL`

Task:

- `task_type = 'review'` for cleanup
- `task_type = 'approval'` for commit approval
- `priority = 'high'` for errors
- `priority = 'normal'` for approval
- `source_key = import_job:{id}:review_errors`
- `source_key = import_job:{id}:approval`

Links:

- `import_job` primary
- `portfolio` context when `portfolio_id` exists

Resolution:

- Complete review task when `error_rows = 0`, `rejected_rows = 0`, and `error_message IS NULL`.
- Complete approval task when `reviewed_by IS NOT NULL` or job reaches terminal success.
- Cancel all open generated tasks when job reaches terminal cancelled/failed state if no user action remains.

## Producer 5: Report Approvals

Producer id: `report_approvals`

Source tables:

- `generated_documents`
- `report_schedules`

This producer should be implemented only after confirming the active reporting schema and UI behavior. It remains in the spec because board reporting and approvals are a major product path, but it should be the last producer in this project.

Expected rules:

- Create preparation tasks before scheduled report generation dates.
- Create approval tasks for generated board reports that are draft/pending review.
- Complete tasks when a report is approved, published, or archived.

## Job Route

### `POST /api/jobs/tasks/generate`

Request:

```json
{
  "producer": "pledge_follow_up",
  "org_id": "optional-org-uuid",
  "source_type": "optional-source-type",
  "source_id": "optional-source-uuid",
  "dry_run": false,
  "now": "2026-05-15T16:00:00.000Z"
}
```

Response:

```json
{
  "ok": true,
  "run_id": "uuid",
  "results": [
    {
      "producer": "pledge_follow_up",
      "scanned": 22,
      "created": 4,
      "updated": 2,
      "completed": 1,
      "skipped": 15,
      "errors": []
    }
  ]
}
```

Security:

- Header `Authorization: Bearer ${CRON_SECRET}` or `x-job-secret`.
- Return `401` for missing/invalid secret.
- Return `400` for invalid producer/source filters.
- Return `409` if a concurrent run is already in progress for the same producer/org combination.

### `GET /api/jobs/tasks/runs`

Query parameters:

- `producer`: optional filter
- `org_id`: optional filter
- `limit`: default 50, max 200

Returns recent `task_automation_runs` rows ordered by `created_at DESC`. Requires the same `CRON_SECRET` header as the POST route, or an org admin session cookie when filtering by a specific `org_id` the user administers.

## Observability

Add a lightweight run log table unless an existing job log already fits.

Recommended migration:

```sql
CREATE TABLE IF NOT EXISTS public.task_automation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  producer text,
  org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  dry_run boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  scanned int NOT NULL DEFAULT 0,
  created_count int NOT NULL DEFAULT 0,
  updated_count int NOT NULL DEFAULT 0,
  completed_count int NOT NULL DEFAULT 0,
  skipped_count int NOT NULL DEFAULT 0,
  error_count int NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
```

RLS:

- Org admins can read their org run logs.
- Service role can manage.

### Concurrent Run Protection

Before starting a run, the job route must acquire a transaction-scoped advisory lock and then check for an in-flight run with the same producer and org_id. The preflight query alone is not sufficient because two cron retries can read "no running row" at the same time.

Recommended lock key:

- `task_automation:{producer || 'all'}:{org_id || 'all'}`

Use `pg_try_advisory_xact_lock` through a small RPC such as `try_task_automation_lock(lock_key text) returns boolean`, or an equivalent database-side lock helper. If the lock cannot be acquired, return `409 Conflict`.

After acquiring the lock, also check for a recent in-flight run:

```sql
SELECT id FROM task_automation_runs
WHERE status = 'running'
  AND (producer = $1 OR $1 IS NULL)
  AND (org_id = $2 OR $2 IS NULL)
  AND created_at > now() - interval '30 minutes';
```

If a match is found, return `409 Conflict` with the in-flight `run_id`. The 30-minute window prevents a stuck `running` row from permanently blocking re-runs. On unexpected process failure, a later run may mark stale `running` rows as `failed` before continuing.

## UI Changes

Minimal UI for this phase:

- Add source/reason display to task rows using `task.metadata.reason`.
- Add linked entity labels for common producer links.
- Add task inbox filters for:
  - `source = automation`
  - `entity_type`
  - `priority`
  - `overdue`

Do not build a full automation admin console yet. A simple run log API is enough.

## Source Event Hooks

Scheduled producers are the primary mechanism, but source mutation routes should also reconcile linked tasks when the user resolves an obligation.

Recommended hooks:

- Pledge installment status route:
  - paid -> complete due/overdue tasks
  - waived/written_off -> cancel due/overdue tasks
- Pledge cancel route:
  - cancel all open generated pledge installment tasks
- Compliance filing calendar PATCH:
  - filed -> complete filing tasks
  - waived/not_applicable -> cancel filing tasks
- Grant milestone PATCH:
  - completed -> complete milestone task
  - cancelled -> cancel milestone task
- Grant report update routes:
  - `received_at` set -> complete report task
- Import review/commit routes:
  - reviewed/committed -> complete review/approval tasks

These hooks should call the shared task writer, not duplicate task SQL.

## Testing Plan

### Unit Tests

- `upsertGeneratedTask` creates one task and links.
- Re-running with same `source_key` updates task instead of duplicating.
- Completed generated task is not reopened by default.
- `completeGeneratedTasks` only completes matching open automation tasks.
- Assignment validator rejects users outside org.

### Producer Tests

Use fixture rows and frozen `now`.

- Compliance producer creates filing reminder and overdue tasks.
- Compliance producer marks overdue filing status when safe.
- State registration producer creates renewal windows.
- Pledge producer creates due-soon tasks.
- Pledge producer escalates overdue priority.
- Pledge producer completes/cancels tasks on paid/waived/written_off.
- Grant producer creates milestone/report/payment condition tasks.
- Import producer creates review/approval tasks from error and approval states.

### Contract Tests

- Every `.from()` and `.rpc()` used by producers targets active migrations.
- Every generated `entity_type` is listed in the task entity contract.
- Every generated task status, priority, type, and source matches DB check constraints and Zod schemas.
- Every source table used by producer tests exists in active migrations.

### Route Tests

- Job route rejects missing/invalid secret.
- Job route can run all producers.
- Job route can run a single producer for one org.
- `dry_run` returns counts without writing tasks.

## Implementation Plan

### Phase 1: Shared Writer and Job Shell

- Add `task_automation_runs` migration.
- Add task automation types.
- Add shared writer helpers.
- Add job route with secret auth, dry-run support, and run logging.
- Add tests for writer and job auth.

### Phase 2: Pledge Producer

- Implement `pledge_follow_up`.
- Add source hooks to pledge installment status and pledge cancel routes.
- Add tests for due-soon, overdue, paid, waived, written-off, and cancelled flows.

This is the recommended first producer because pledge data has clear ownership via `relationship_manager`, explicit installment statuses, and direct user value.

### Phase 3: Compliance Producer

- Implement `compliance_deadlines`.
- Add source hooks to filing calendar route.
- Add state registration renewal tasks.
- Add tests for reminder windows and overdue escalation.

### Phase 4: Grant Producer

- Implement `grant_obligations`.
- Add source hooks to milestone/report/payment routes where they exist.
- Ensure task completion can optionally mark a milestone complete.
- Add tests for milestone, report, and payment condition tasks.

### Phase 5: Import Producer

- Implement `import_review`.
- Confirm `import_status_enum` values before final status filters.
- Add tests around error and approval states.

### Phase 6: Report Approval Producer

- Confirm active reporting schema.
- Implement scheduled report preparation and generated report approval tasks.

## Acceptance Criteria

- Running `POST /api/jobs/tasks/generate` with a valid secret creates tasks for at least pledge, compliance, and grant obligations.
- Re-running the job produces no duplicate open tasks.
- Source resolution completes or cancels linked generated tasks.
- Every generated task has a stable `source_key`, reason metadata, and entity links.
- Task inbox can distinguish automated tasks and show why they were generated.
- Contract tests prevent producers from referencing stale table names or invalid task enum values.
- `dry_run` can preview producer impact without writes.
- Producer failures are logged without stopping unrelated producers from running.

## Open Decisions

- Should orgs be able to set default owners for compliance, grants, pledges, imports, and reporting?
- Should overdue compliance tasks immediately enqueue `notification_events`, or wait for the notification phase?
- Should task completion update source records for all source types, or only low-risk mappings like milestones?
- Should producer runs be visible in an admin UI now, or only available through logs/API?
- Should reminder windows be org-configurable, source-configurable, or fixed for v1?
