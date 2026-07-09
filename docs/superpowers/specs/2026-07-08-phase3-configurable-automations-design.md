# Phase 3: Configurable Automations — Design Spec

> Roadmap reference: `docs/CONFIGURABILITY_ROADMAP.md` Phase 3
> Builds on: Phase 1 workflow stages and Phase 2 custom fields

## Goal

Org admins can define org-scoped automation rules through Builder. When configured events occur, the platform evaluates active rules and performs structured actions without code deployment.

The runtime supports the Phase 3 trigger and action set: grant stage changes, date-relative grant events, custom field value updates, and task completion can create tasks, send in-app notifications, or set custom field values.

## Scope

In:
- `org_automation_rules` and `org_automation_runs`
- Trigger types: `grant_stage_change`, `date_relative`, `custom_field_set`, `task_completed`
- Action types: `create_task`, `notify_member`, `set_custom_field`
- Builder tools to create/list/enable/disable/remove rules
- Runtime evaluator for all trigger/action combinations in the Phase 3 set
- Idempotent task creation through existing `upsertGeneratedTask`
- In-app notification delivery through `notification_events`
- Custom field updates through `org_custom_field_values`
- Date-relative producer registration in the existing task automation scheduler
- Onboarding assistant capture of automation preferences
- Run logging for completed, skipped, and failed rule evaluations

Out:
- Email/webhook actions
- UI rule builder outside Builder chat
- External automation integrations

## Schema

Migration: `db/migrations/0051_configurable_automations.sql`

### `org_automation_rules`

- `org_id`
- `name`
- `is_active`
- `trigger_type`: `grant_stage_change | date_relative | custom_field_set | task_completed`
- `trigger_config`: structured trigger config
- `conditions`: array of condition objects
- `action_type`: `create_task | notify_member | set_custom_field`
- `action_config`: structured action config
- `created_by`

Validation constraints make the accepted config shapes explicit. For example, `grant_stage_change` requires `trigger_config.stage`, `date_relative` requires a supported `entity_type`, `anchor`, and numeric `offset_days`, and `create_task` requires `action_config.title_template`.

### `org_automation_runs`

One row per evaluated rule/event:

- `rule_id`
- `trigger_entity_type`
- `trigger_entity_id`
- `status`: `queued | completed | failed | skipped`
- `result`
- `ran_at`

## Builder Tools

- `create_automation_rule`
- `list_automation_rules`
- `enable_automation_rule`
- `disable_automation_rule`
- `remove_automation_rule`

Builder tools validate canonical trigger/action enums, lifecycle stages, date-relative anchors, custom-field trigger keys, task-completion task types, and action-specific options before writing rules.

## Runtime Evaluator

`runAutomationRulesForEvent(db, event)` loads active rules for `event.orgId` and `event.triggerType`.

Implemented event examples:

```ts
{
  triggerType: 'grant_stage_change',
  orgId,
  entityType: 'grant',
  entityId: grantId,
  payload: { from_stage, to_stage, actor_id }
}
```

For `grant_stage_change`, a rule matches when `trigger_config.stage === payload.to_stage`.

For `custom_field_set`, route handlers emit an event after a value is stored. Rules match by `trigger_config.entity_type` and `trigger_config.field_key`.

For `task_completed`, task completion routes emit an event after the task status changes. Rules can match a specific `trigger_config.task_type`.

For `date_relative`, the registered `dynamic_automation_rules` producer scans active rules, computes `anchor + offset_days`, and emits rule-scoped events only when the computed date is today. Dry runs scan and report skipped matches without executing actions.

For `create_task`, the evaluator calls `upsertGeneratedTask()` with source key:

```text
automation_rule:{rule_id}:{trigger_entity_type}:{trigger_entity_id}
```

This makes each rule idempotent for each triggering entity.

For `notify_member`, the evaluator upserts an in-app `notification_events` row with a rule/entity dedupe key.

For `set_custom_field`, the evaluator resolves the configured field definition, validates the typed value with the custom-field helper, and upserts the value row without re-emitting another automation event.

## Acceptance Criteria

1. Builder can create: “When a grant reaches active, create a task titled ‘Schedule 90-day check-in’ due in 7 days.”
2. `transitionGrant()` moves a grant to `active` and then evaluates matching automation rules.
3. A task is created with the configured title, due date, priority, metadata, and grant/portfolio/holding links.
4. Date-relative rules run through `dynamic_automation_rules` and respect dry-run mode.
5. Custom field updates and task completions emit automation events.
6. In-app notifications and set-custom-field actions execute through canonical tables.
7. Disabling the rule prevents the next matching event from creating an action.
8. Each rule evaluation writes an `org_automation_runs` row.
