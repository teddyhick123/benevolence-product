# Task & Workflow Management Design

Build a first-class task and workflow layer for the platform. This should become the operational fabric across grants, compliance, donor follow-up, pledges, imports, board reporting, and AI-assisted work. The goal is not a generic to-do list; the goal is a trustworthy work queue that tells each user what needs attention, why it matters, who owns it, and what happens next.

## Current-State Audit

The codebase already contains multiple partial workflow concepts:

- Compliance filings have `due_date`, `reminder_days`, `last_reminded_at`, recurrence fields, and a notifications settings page, but no notification delivery or task generation.
- State registrations have `renewal_due_date`, `expiration_date`, and status fields, but no renewal queue.
- Pledge installments have `due_date`, overdue logic, and payment/write-off actions, but no assigned follow-up tasks.
- Grants have several UI surfaces for workflows, health, payments, communications, and deadlines.
- `components/grants/WorkflowManager.tsx` reads `workflow_templates`, `workflow_instances`, and `workflow_tasks`, and `db/seeds/workflow_templates.sql` seeds standard grant workflows, but active migrations do not create those workflow tables.
- `GrantHealthDashboard` expects `v_grant_health` and `get_upcoming_deadlines`, which are also not present in active migrations.
- Import jobs track `reviewed_by`, status, failed rows, and AI quality reports, but there is no review task or approval queue.
- `organization_members.notification_prefs` stores user preferences, but there is no notification event table, digest job, or inbox.

Product implication: task/workflow management should reconcile the existing grant workflow ambition with a platform-wide task primitive. Do not add another grant-only checklist model that competes with a later task system.

## Product Principles

1. **One work queue across the product.** A user should see one inbox for overdue filings, pledge follow-ups, grant reports, import cleanup, board approvals, and AI-created tasks.
2. **Tasks are linked to business objects.** Every system-generated task should point back to the relevant filing, pledge installment, donor, grant, import job, report, or document.
3. **Workflows are task collections, not a separate universe.** A due-diligence workflow is a template-instantiated group of tasks with ordering, dependencies, and completion rules.
4. **Approvals are first-class work.** Approving a grant, board report, import, AI-generated change, or payout should use the same queue and audit model.
5. **Notifications are generated from task events.** Email/in-app alerts should not duplicate business logic from every module.
6. **Automation should be explainable.** Generated tasks need a `source`, `reason`, and entity link so users understand why the task exists.
7. **Idempotency matters.** Scheduled producers must not create duplicate tasks for the same pledge installment, filing reminder, grant report, or import issue.

## Core Data Model

### `tasks`

Org-scoped canonical task records.

Required fields:

- `id uuid primary key`
- `org_id uuid not null references organizations(id)`
- `portfolio_id uuid references portfolios(id)`
- `title text not null`
- `description text`
- `status text not null default 'open'`
  - `open`, `in_progress`, `blocked`, `waiting`, `completed`, `cancelled`
- `priority text not null default 'normal'`
  - `low`, `normal`, `high`, `urgent`
- `task_type text not null default 'task'`
  - `task`, `approval`, `reminder`, `follow_up`, `review`, `checklist_step`
- `source text not null default 'manual'`
  - `manual`, `system`, `automation`, `ai`, `template`
- `source_key text`
  - stable idempotency key, unique per `org_id` when present
- `due_at timestamptz`
- `starts_at timestamptz`
- `completed_at timestamptz`
- `completed_by uuid references auth.users(id)`
- `created_by uuid references auth.users(id)`
- `assigned_to uuid references auth.users(id)`
- `metadata jsonb not null default '{}'`
- `created_at`, `updated_at`, `deleted_at`

Indexes:

- `(org_id, status, due_at)`
- `(org_id, assigned_to, status, due_at)`
- `(org_id, source_key) unique where source_key is not null and deleted_at is null`
- `(portfolio_id, status, due_at) where portfolio_id is not null`

RLS:

- Org members can read non-deleted tasks in their org.
- Members can update task status/comment on tasks assigned to them.
- Org admins can create/update/delete all org tasks.
- Service role can create automation tasks.

### `task_entity_links`

Allows one task to be attached to one or more product records.

Fields:

- `id uuid primary key`
- `task_id uuid not null references tasks(id) on delete cascade`
- `org_id uuid not null references organizations(id) on delete cascade`
- `entity_type text not null`
  - `holding`, `grant`, `grant_report`, `grant_milestone`, `filing`, `state_registration`, `pledge`, `pledge_installment`, `donor`, `contribution`, `acknowledgment`, `import_job`, `report_document`, `ai_action`, `portfolio`
- `entity_id uuid not null`
- `relationship text not null default 'primary'`
- `created_at timestamptz not null default now()`

Indexes:

- `(org_id, entity_type, entity_id)`
- `(task_id)`

### `task_comments`

Lightweight task discussion and activity notes.

Fields:

- `id uuid primary key`
- `task_id uuid not null references tasks(id) on delete cascade`
- `org_id uuid not null references organizations(id)`
- `author_id uuid references auth.users(id)`
- `body text not null`
- `created_at timestamptz not null default now()`

### `task_events`

Audit trail for changes and notification fan-out.

Fields:

- `id uuid primary key`
- `task_id uuid references tasks(id) on delete cascade`
- `org_id uuid not null references organizations(id)`
- `actor_id uuid references auth.users(id)`
- `event_type text not null`
  - `created`, `assigned`, `status_changed`, `due_date_changed`, `commented`, `completed`, `cancelled`, `linked`, `notification_sent`
- `before_values jsonb`
- `after_values jsonb`
- `created_at timestamptz not null default now()`

### `workflow_templates`

Reusable task bundle definitions.

Fields:

- `id uuid primary key`
- `org_id uuid references organizations(id)`
  - `null` means system template
- `name text not null`
- `workflow_type text not null`
  - `due_diligence`, `grant_monitoring`, `closeout`, `renewal_review`, `site_visit`, `compliance_filing`, `import_review`, `board_report`
- `description text`
- `is_system boolean not null default false`
- `is_active boolean not null default true`
- `steps jsonb not null`
- `created_at`, `updated_at`

This formalizes the existing `db/seeds/workflow_templates.sql` intent.

### `workflow_instances`

An instance of a template for a specific business process. It groups tasks but does not replace tasks.

Fields:

- `id uuid primary key`
- `org_id uuid not null references organizations(id)`
- `portfolio_id uuid references portfolios(id)`
- `template_id uuid references workflow_templates(id)`
- `name text not null`
- `workflow_type text not null`
- `status text not null default 'active'`
  - `active`, `paused`, `completed`, `cancelled`
- `due_at timestamptz`
- `started_at timestamptz not null default now()`
- `completed_at timestamptz`
- `created_by uuid references auth.users(id)`
- `metadata jsonb not null default '{}'`
- `created_at`, `updated_at`

### `workflow_tasks`

Mapping table between workflows and canonical tasks.

Fields:

- `workflow_id uuid references workflow_instances(id) on delete cascade`
- `task_id uuid references tasks(id) on delete cascade`
- `step_id text`
- `sequence_order int not null`
- `is_required boolean not null default true`
- `depends_on_task_id uuid references tasks(id)`
- `outcome text`
  - `pass`, `fail`, `conditional`, `n/a`
- `outcome_notes text`
- primary key `(workflow_id, task_id)`

This keeps `WorkflowManager` compatible with a workflow-specific view while still storing all work in `tasks`.

### `notification_events`

Durable event queue for in-app and email delivery.

Fields:

- `id uuid primary key`
- `org_id uuid not null references organizations(id)`
- `recipient_user_id uuid references auth.users(id)`
- `task_id uuid references tasks(id)`
- `event_type text not null`
- `channel text not null`
  - `in_app`, `email`, `digest`
- `status text not null default 'pending'`
  - `pending`, `sent`, `failed`, `suppressed`
- `scheduled_for timestamptz not null default now()`
- `sent_at timestamptz`
- `error_message text`
- `payload jsonb not null default '{}'`
- `created_at timestamptz not null default now()`

This table should respect `organization_members.notification_prefs`.

## Automation Producers

Automation jobs should create tasks idempotently using `source_key`.

### Compliance

Producer: `compliance_deadline_tasks`

Rules:

- For each `filing_calendar` row in `upcoming`, `in_progress`, or `extended`, create reminder tasks at `reminder_days`.
- For overdue filings, create or escalate an urgent task.
- For state registrations with `renewal_due_date`, create renewal tasks at 60/30/14/7 days.
- Completing a filing should complete or cancel open tasks linked to that filing.

Example `source_key`:

- `filing:{filing_id}:reminder:{days_before}`
- `filing:{filing_id}:overdue`
- `state_registration:{id}:renewal:{days_before}`

### Pledges

Producer: `pledge_follow_up_tasks`

Rules:

- For pending installments due in the next 14 days, create a follow-up task.
- For overdue installments, escalate priority by age bucket.
- Mark task complete when installment becomes `paid`, `waived`, or `written_off`.

Example `source_key`:

- `pledge_installment:{id}:due_soon`
- `pledge_installment:{id}:overdue`

### Grants

Producer: `grant_obligation_tasks`

Rules:

- Create tasks from `grant_milestones.due_date`.
- Create tasks from `grant_reports.due_date`.
- Create workflow instances from templates for due diligence, monitoring, renewal, site visit, and closeout.
- When a task is completed, optionally update the source milestone/report status.

Example `source_key`:

- `grant_milestone:{id}:due`
- `grant_report:{id}:due`
- `grant:{id}:workflow:{template_id}`

### Imports

Producer: `import_review_tasks`

Rules:

- When an import job reaches validation complete with failed or warning rows, create a review task.
- When an import is ready to commit, create an approval task for admins.
- Completing/cancelling the import should close linked tasks.

Example `source_key`:

- `import_job:{id}:review_errors`
- `import_job:{id}:approval`

### Reports / Board Portal

Producer: `report_review_tasks`

Rules:

- Generated board reports can create approval/review tasks.
- Scheduled reports can create preparation tasks before the report date.

## UX Surfaces

### Global Work Inbox

Route: `/org/[orgId]/tasks`

Default tabs:

- `My Tasks`
- `Approvals`
- `Due Soon`
- `Overdue`
- `All`

Filters:

- assignee
- status
- priority
- due date
- source module
- linked entity type
- portfolio

Row data:

- title
- linked entity label
- priority
- due date
- assignee
- status
- source/reason

Actions:

- mark complete
- start progress
- reassign
- change due date
- add comment
- open linked entity

### Dashboard Widget

Show:

- overdue tasks
- due this week
- approvals waiting on me
- system-generated tasks requiring action

### Entity Task Panels

Add a task panel on:

- donor profile
- pledge detail
- grant detail / holding detail
- compliance filing detail
- import job detail
- board report/document detail

Each panel should show linked tasks and allow quick task creation.

### Workflow View

Route: `/dashboard/grants?tab=workflows` can remain, but it should read from the canonical task/workflow tables above.

Expected behavior:

- Start workflow from template.
- Instantiate canonical tasks.
- Show progress based on task completion.
- Allow pass/fail/conditional outcome on steps.
- Link every task back to the grant or holding.
- Surface blocked dependencies.

## API Design

Org-scoped task APIs:

- `GET /api/org/[orgId]/tasks`
- `POST /api/org/[orgId]/tasks`
- `GET /api/org/[orgId]/tasks/[taskId]`
- `PATCH /api/org/[orgId]/tasks/[taskId]`
- `POST /api/org/[orgId]/tasks/[taskId]/comments`
- `POST /api/org/[orgId]/tasks/[taskId]/complete`
- `POST /api/org/[orgId]/tasks/[taskId]/reopen`

Workflow APIs:

- `GET /api/org/[orgId]/workflow-templates`
- `POST /api/org/[orgId]/workflow-templates`
- `POST /api/org/[orgId]/workflows`
- `GET /api/org/[orgId]/workflows`
- `GET /api/org/[orgId]/workflows/[workflowId]`
- `PATCH /api/org/[orgId]/workflows/[workflowId]`

Automation APIs/jobs:

- `POST /api/jobs/tasks/generate`
- Cron entrypoint protected by job secret.
- Supports `?org_id=` for targeted repair/backfill.

## AI Assistant Integration

Add task tools once the core API is stable:

- `list_tasks`
- `create_task`
- `update_task`
- `complete_task`
- `assign_task`
- `start_workflow`
- `get_workflow_status`

Guardrails:

- Viewer role can list tasks but cannot mutate.
- Member can update tasks assigned to them.
- Admin/owner can assign and create workflow instances.
- AI-created tasks should set `source = 'ai'` and include prompt/session metadata.

System prompt context:

- Include top overdue tasks and approvals for the active org.
- Include current date.
- Include role-specific capabilities.

## Notifications

Notification delivery should be driven by `notification_events`, not by each module directly.

Initial channels:

- in-app notification list
- daily/weekly email digest

Immediate email should be reserved for:

- urgent overdue compliance tasks
- direct assignment to a user
- approval requests

Respect `organization_members.notification_prefs`:

- `digest`: `daily`, `weekly`, `never`
- `alerts`: expand beyond current generic settings to include `task_assigned`, `task_due_soon`, `approval_requested`, `compliance_overdue`, `pledge_overdue`

## Implementation Plan

### Phase 1 — Schema and Contract Tests

- Add migration for `tasks`, `task_entity_links`, `task_comments`, `task_events`, `workflow_templates`, `workflow_instances`, `workflow_tasks`, `notification_events`.
- Move `db/seeds/workflow_templates.sql` into active seed/migration path or create a migration that inserts built-in workflow templates.
- Add schema contract tests verifying workflow tables used by `WorkflowManager` and grant dashboard views/RPCs exist.
- Add contract tests for task entity types and status enums.

### Phase 2 — API and Inbox

- Build org-scoped task CRUD APIs.
- Build task completion/comment APIs.
- Build `/org/[orgId]/tasks` inbox.
- Add dashboard task summary widget.

### Phase 3 — Grant Workflow Repair

- Rewire `WorkflowManager` to the canonical task/workflow API.
- Add `v_grant_health` or replace direct client reads with API-backed data.
- Add `get_upcoming_deadlines` or replace it with a task/deadline API.
- Ensure grant milestone/report tasks stay synchronized with their source records.

### Phase 4 — Compliance and Pledge Producers

- Generate filing reminder tasks from `filing_calendar`.
- Generate state registration renewal tasks.
- Generate pledge installment due/overdue tasks.
- Close tasks automatically when source records are resolved.

### Phase 5 — Notifications

- Implement `notification_events`.
- Add in-app notifications.
- Add digest emails.
- Respect notification preferences.

### Phase 6 — AI Tools

- Add task and workflow tools.
- Add assistant context for overdue tasks and approvals.
- Ensure AI task mutations follow role guardrails.

## Product Acceptance Criteria

- A user can open one task inbox and see all assigned work across modules.
- System-generated tasks explain their source and link to the relevant entity.
- Completing a source event, such as paying a pledge installment or filing a return, resolves the linked task.
- Grant workflow templates instantiate real tasks, not isolated checklist rows.
- Workflow progress is derived from task status.
- Notification preferences affect digest and assignment/reminder delivery.
- Contract tests prevent UI from referencing nonexistent workflow tables/views/RPCs.
- The AI assistant can create and complete tasks only within the user’s permission level.

## Open Decisions

- Should task assignments allow teams/groups in addition to individual users?
- Should recurring manual tasks use RRULE strings or a simpler recurrence config?
- Should approvals be a task subtype only, or should high-stakes approvals also get a separate immutable approval record?
- Should task comments live only on tasks, or should comments become a platform-wide activity stream?
- Should generated tasks be visible to all org members by default, or only assignees/admins?
