# Task Notification Delivery Design

Build the notification layer that makes the task/workflow system operationally visible. Task automation creates the work graph; notification delivery turns that graph into timely, respectful in-app alerts and email digests.

This is not a new source-of-truth workflow system. Notifications must consume canonical `tasks`, `task_events`, and `notification_events`; they should not rescan compliance, grants, pledges, imports, or reports to rediscover business logic.

## Product Goal

Every user should know what needs their attention without living inside the app all day. The platform should send the right notification to the right person, through the right channel, at a sensible time, with enough context to act immediately.

The experience should feel like an operations assistant, not a noisy SaaS firehose:

- urgent work is surfaced quickly
- normal work is batched into digests
- completed/cancelled work does not keep nagging people
- users can control frequency and alert types
- email copy and PDF/export references are brand-agnostic and org-aware

## Current Foundation

Already implemented or expected from the task/workflow foundation:

- `tasks`
- `task_entity_links`
- `task_comments`
- `task_events`
- `notification_events`
- `organization_members.notification_prefs`
- `/settings/notifications` preference UI
- Resend invite-email infrastructure in `lib/email/resend.ts`
- task automation producer spec: `/docs/agent-work/specs/2026-05-15-task-automation-producers-design.md`

Current gaps:

- no notification fan-out from `task_events`
- no notification inbox UI/API
- no email delivery worker
- no digest compiler
- no read/unread state
- no retry/backoff policy
- no contract tests protecting preference keys, event types, or stale columns
- settings copy still says notification sending is “coming soon”

## Product Principles

1. **Task events are the source.** Notification logic should subscribe to `task_events` and `tasks`, not duplicate producer rules.
2. **One notification per meaningful moment.** Do not notify on every metadata patch. Notify on assignment, approaching due dates, urgent escalation, comments/mentions, approval requests, completion of assigned work, and automation failures that need a human.
3. **Immediate only when immediate matters.** Urgent/assigned/approval events can send immediately. Normal task creation should default to in-app plus digest.
4. **Digest by default.** Most operational updates should be summarized daily or weekly.
5. **Respect preferences and membership.** Never notify users outside the org, inactive members, or users who opted out of that event/channel.
6. **Brand-agnostic by construction.** Email sender names, product name, support address, logos, and copy tone come from branding/org config, not hard-coded “Ben”, “B.”, or client-specific names.
7. **Idempotent delivery.** Re-running a fan-out or delivery job must not create duplicate notifications or duplicate emails.
8. **Auditable but not leaky.** Store enough payload for delivery and debugging, but avoid long-lived copies of sensitive donor/tax data in notification rows.
9. **Actionable notifications.** Every notification should link to the exact task or source entity and explain why it was sent.

## Non-Goals

- SMS/push notifications
- Slack/Teams integration
- User-defined notification rules builder
- Marketing/product lifecycle emails
- External stakeholder notifications to grantees, donors, CPAs, or board members
- Full messaging center or direct messages

## Data Model

The current `notification_events` table is the right foundation, but it should be strengthened while the database is still prerelease.

### Canonical `notification_events`

Update the table in `0041_task_workflow_foundation.sql` to include:

- `id uuid primary key`
- `org_id uuid not null references organizations(id)`
- `recipient_user_id uuid not null references auth.users(id)`
- `task_id uuid references tasks(id) on delete cascade`
- `task_event_id uuid references task_events(id) on delete set null`
- `actor_id uuid references auth.users(id)`
- `event_type text not null`
- `channel text not null`
  - `in_app`, `email`, `digest`
- `status text not null default 'pending'`
  - `pending`, `sent`, `failed`, `suppressed`, `cancelled`
- `priority text not null default 'normal'`
  - `low`, `normal`, `high`, `urgent`
- `dedupe_key text not null`
- `scheduled_for timestamptz not null default now()`
- `sent_at timestamptz`
- `read_at timestamptz`
- `delivery_attempts int not null default 0`
- `last_attempt_at timestamptz`
- `next_attempt_at timestamptz`
- `error_message text`
- `payload jsonb not null default '{}'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints and indexes:

- unique `(org_id, recipient_user_id, channel, dedupe_key)`
- `(recipient_user_id, status, created_at desc)` for inbox
- `(status, scheduled_for)` where `status = 'pending'`
- `(status, next_attempt_at)` where `status = 'failed'`
- `(org_id, task_id, event_type)`

RLS:

- recipients can select their own notifications for orgs they can view
- recipients can update only `read_at` on their own in-app notifications
- service role manages creation, delivery, suppression, retry, and cancellation

Payload should be small and render-ready:

```json
{
  "title": "Grant report due next week",
  "body": "Quarterly report for Community Food Fund is due May 22.",
  "href": "/org/{orgId}/tasks?task={taskId}",
  "task_title": "Submit quarterly grant report",
  "source_label": "Community Food Fund",
  "reason": "Assigned task is due in 7 days"
}
```

Do not store full donor addresses, tax documents, receipt bodies, or long AI-generated text in `payload`.

### Notification Preferences

Formalize `organization_members.notification_prefs` as:

```typescript
type NotificationPrefs = {
  digest: 'daily' | 'weekly' | 'never';
  quiet_hours?: {
    enabled: boolean;
    timezone: string;
    start: string; // HH:mm
    end: string;   // HH:mm
  };
  channels: {
    in_app: boolean;
    email: boolean;
  };
  alerts: {
    assigned_to_me: boolean;
    due_soon: boolean;
    overdue: boolean;
    approvals: boolean;
    comments: boolean;
    mentions: boolean;
    automation_failures: boolean;
    digest_summary: boolean;
    org_admin: boolean;
  };
};
```

Default:

```json
{
  "digest": "weekly",
  "channels": { "in_app": true, "email": true },
  "alerts": {
    "assigned_to_me": true,
    "due_soon": true,
    "overdue": true,
    "approvals": true,
    "comments": true,
    "mentions": true,
    "automation_failures": true,
    "digest_summary": true,
    "org_admin": false
  }
}
```

Settings UI should expose digest frequency, email on/off, in-app on/off, and the alert categories above. Quiet hours can be stored now and surfaced later if needed.

## Event Taxonomy

Define notification event types as a shared const in `lib/notifications/types.ts`.

Required event types:

- `task_assigned`
- `task_due_soon`
- `task_overdue`
- `task_priority_escalated`
- `approval_requested`
- `task_commented`
- `task_mentioned`
- `task_completed`
- `task_cancelled`
- `automation_failed`
- `digest_ready`

Mapping from `task_events`:

| `task_events.event_type` | Notification Event | Notes |
|--------------------------|--------------------|-------|
| `created` | `approval_requested` when task type is `approval`; otherwise usually digest only |
| `assigned` | `task_assigned` | notify new assignee |
| `due_date_changed` | `task_due_soon` only if now inside due-soon window |
| `status_changed` | `task_priority_escalated` or suppress if low signal |
| `commented` | `task_commented` or `task_mentioned` |
| `completed` | `task_completed` only for watchers/assigner when useful |
| `cancelled` | `task_cancelled` only for assigned users/watchers when useful |

Task automation producers may also enqueue direct task events for due-soon/overdue states, but fan-out still owns recipient/channel decisions.

## Recipient Resolution

Recipient order:

1. Task `assigned_to`, if active org member.
2. Mentioned users in a task comment.
3. Approval owner/requested approver from task metadata.
4. Portfolio admins/owners for unassigned urgent tasks.
5. Org admins for automation failures.

Never notify:

- inactive/deleted org members
- users outside the org
- the actor for their own low-signal action, unless the notification is confirmation-worthy and explicitly requested
- users who disabled the alert category or channel

If a task is unassigned and normal priority, create no immediate email. It can appear in shared task views and org/admin digests.

## Fan-Out Service

Add:

- `lib/notifications/types.ts`
- `lib/notifications/preferences.ts`
- `lib/notifications/recipients.ts`
- `lib/notifications/fanout.ts`
- `lib/notifications/delivery.ts`
- `lib/notifications/digest.ts`
- `lib/notifications/render.ts`

### `fanOutTaskEvent`

Input:

```typescript
type FanOutTaskEventInput = {
  taskEventId: string;
  now?: string;
};
```

Behavior:

1. Load `task_events` with task, org, actor, links, and task metadata.
2. Classify into notification event type(s).
3. Resolve recipients.
4. Load each recipient's preferences.
5. Decide channels:
   - always create in-app if enabled
   - create immediate email only for urgent/approval/assignment/comment/mention/automation failure events
   - create digest-channel event for digest-eligible work
6. Insert `notification_events` with stable `dedupe_key`.

Dedupe key format:

- `task:{task_id}:event:{task_event_id}:type:{notification_type}`
- due-soon automation reminders: `task:{task_id}:due_soon:{yyyy-mm-dd}`
- overdue reminders: `task:{task_id}:overdue:{bucket}`
- digest membership: `digest:{org_id}:{recipient_user_id}:{period_start}:{period_end}:{source_event_id}`

Use `upsert`/unique constraint so repeated fan-out is safe.

## Delivery Jobs

### Job Routes

Add protected routes:

- `POST /api/jobs/notifications/fanout`
- `POST /api/jobs/notifications/send`
- `POST /api/jobs/notifications/digest`

Auth:

- Require `CRON_SECRET` header.
- Use service/admin client.
- Support `dry_run`, `org_id`, `task_event_id`, `recipient_user_id`, and `now` for tests/repair.

### Fan-Out Job

Scans recent `task_events` that do not yet have matching notification rows.

Window:

- default: last 24 hours
- repair mode: accepts `since` and `until`

Return:

```typescript
{
  scanned: number,
  created: number,
  suppressed: number,
  errors: Array<{ taskEventId: string, message: string }>
}
```

### Send Job

Scans:

- `notification_events.status = 'pending'`
- `channel = 'email'`
- `scheduled_for <= now()`

Behavior:

1. Recheck task state before delivery.
2. Suppress if task is completed/cancelled and event no longer matters.
3. Render email using org/brand config.
4. Send through Resend.
5. Mark `sent`, increment attempts, store `sent_at`.
6. On transient failure, mark `failed` with `next_attempt_at`.
7. On permanent suppression, mark `suppressed`.

Retry:

- 1st failure: retry in 5 minutes
- 2nd: 30 minutes
- 3rd: 2 hours
- after 5 attempts: keep `failed`, no more automatic retries

### Digest Job

Runs daily and weekly.

Daily digest:

- send at 8:00 AM recipient local time when timezone is known
- fallback: 8:00 AM org timezone if configured
- fallback: 8:00 AM America/Los_Angeles

Weekly digest:

- Monday 8:00 AM local time

Digest contents:

- overdue tasks assigned to me
- tasks due in next 7 days
- approval requests
- recent comments/mentions
- automation failures for org admins
- completed/cancelled summary only when useful

Do not include:

- tasks completed before digest generation
- notifications already sent as immediate urgent email unless they remain materially unresolved
- suppressed categories

After digest email sends, mark included `digest` channel notification rows as `sent`.

## In-App Notification Center

### API Routes

Add:

- `GET /api/org/[orgId]/notifications`
- `PATCH /api/org/[orgId]/notifications/[notificationId]/read`
- `POST /api/org/[orgId]/notifications/mark-all-read`

GET query params:

- `status=unread|read|all`
- `limit`
- `cursor`

Response shape:

```typescript
{
  data: Array<{
    id: string;
    event_type: string;
    priority: string;
    task_id: string | null;
    title: string;
    body: string;
    href: string;
    read_at: string | null;
    created_at: string;
  }>;
  unread_count: number;
  next_cursor: string | null;
}
```

### UI

Add:

- header bell with unread count
- popover list of recent unread notifications
- full notifications page at `/org/[orgId]/notifications`
- mark one/all as read

Behavior:

- clicking a notification opens `payload.href` and marks it read
- stale links should fall back to the task inbox
- high/urgent items get clear visual priority, not aggressive color noise

## Email Rendering

Use React Email templates:

- `lib/email/templates/task-notification.tsx`
- `lib/email/templates/task-digest.tsx`

Sender:

- derive from `lib/config/branding.ts` and org overrides
- fallback to generic product name
- never hard-code “Ben”, “B.”, “Benevolence”, or a client name in templates

Email content requirements:

- subject starts with the actionable noun:
  - `Task assigned: Submit quarterly grant report`
  - `Approval needed: Board report`
  - `3 overdue tasks need attention`
- preheader summarizes the urgency
- CTA links to app task
- footer includes org name and preference link
- no sensitive donor/tax details beyond what the user needs to identify the work

## Suppression Rules

Suppress notification rows before send when:

- task is completed or cancelled
- recipient is no longer an active org member
- recipient disabled the alert/channel
- same dedupe key already sent
- notification is older than 14 days and not urgent
- task was reassigned away from the recipient before delivery

Do not delete suppressed rows; mark `status = 'suppressed'` with `error_message` or `payload.suppression_reason`.

## Observability

Add lightweight admin/job observability:

- job result JSON for all job routes
- console logs with stable prefixes:
  - `[notifications:fanout]`
  - `[notifications:send]`
  - `[notifications:digest]`
- include counts for scanned, created, sent, failed, suppressed
- optional future table: `notification_delivery_runs`

Do not block v1 on a full admin dashboard.

## Tests & Contracts

Unit tests:

- preference merge/default behavior
- recipient resolution
- fan-out classification
- dedupe key generation
- suppression rules
- digest grouping

Route tests:

- unread/read API only returns recipient's rows
- mark-read cannot mutate another user's notifications
- job routes reject missing/invalid `CRON_SECRET`

Contract tests:

- every notification event type used in code is in `NOTIFICATION_EVENT_TYPES`
- every preference alert key used in code is in `NOTIFICATION_ALERT_KEYS`
- app code does not write stale notification columns
- email templates do not contain hard-coded client/product assistant names
- `notification_events` has `dedupe_key`, `read_at`, retry fields, and recipient-scoped RLS

Suggested contract file:

- `lib/__tests__/notification-contract.test.ts`

## Implementation Phases

### Phase 1 — Schema & Contracts

- strengthen `notification_events` in `0041_task_workflow_foundation.sql`
- define notification event/pref constants
- add schema contract tests
- update settings preference schema/UI labels

### Phase 2 — In-App Inbox

- add notification list/read APIs
- add header bell/popover
- add full notifications page
- mark read on click

### Phase 3 — Fan-Out

- implement `fanOutTaskEvent`
- add fan-out job route
- create in-app notifications from task assignment, comments, approval requests, due/overdue events

### Phase 4 — Immediate Email

- add task notification email template
- add send job route and retry/suppression logic
- support urgent, assignment, approval, mention/comment, automation failure emails

### Phase 5 — Digest

- add digest compiler and email template
- add digest job route
- group digest events by org/user/time window
- mark digest-channel events sent after successful delivery

## Acceptance Criteria

- Assigned users get one in-app notification for a new assignment.
- Users who enable email for assignments receive exactly one email for that assignment.
- Completing/cancelling a task before send suppresses pending email.
- Daily/weekly digest respects `notification_prefs.digest`.
- Opting out of an alert category suppresses both email and digest entries for that category.
- Header unread count reflects unread in-app notifications.
- Mark-read endpoints cannot update another user's notification.
- Job routes are idempotent and safe to retry.
- Email templates are brand-agnostic and derive branding from config/org context.
- Full test suite passes, including contract tests.

## Product Decisions To Make Before Build

1. Should all org members receive unassigned urgent compliance/grant tasks, or only admins/owners?
2. Should completion notifications exist in v1, or should completed work appear only in digest?
3. What default digest should new members get: daily or weekly?
4. Should due-soon mean 7 days globally, or should it read task metadata/source configuration?
5. Should notifications support watcher/subscriber lists now, or defer until task collaboration is richer?
