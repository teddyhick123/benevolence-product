# Phase 4: Org-Specific AI Behavior — Design Spec

> Roadmap reference: `docs/CONFIGURABILITY_ROADMAP.md` Phase 4
> Builds on: Phases 1-3 configured workflows, fields, and automations

## Goal

The assistant can apply durable, org-scoped operating norms, naming conventions, process rules, and preferences. Admins manage this context through Builder; onboarding can seed it; and the main assistant can propose new entries only after explicit user confirmation.

## Scope

In:
- `org_ai_context` table with org-scoped RLS
- Context types: `operating_norm`, `naming_convention`, `process_rule`, `preference`
- Sources: `builder_chat`, `onboarding`, `ai_suggestion`
- Prompt injection as a prose "Your Organization" section after module-level prompt additions
- Builder tools to record/list/update/remove context
- Main assistant `suggest_context_entry` tool for confirmed user requests
- Onboarding profile extraction and optional provisioning seed

Out:
- Per-user AI preferences
- Silent learning from conversation history
- Cross-org context

## Schema

Migration: `db/migrations/0052_org_ai_context.sql`

`org_ai_context` stores:
- `org_id`
- `context_type`
- `context_key`
- `context_value`
- `source`
- `is_active`
- `created_by`
- timestamps

`UNIQUE (org_id, context_key)` keeps each org's memory stable and upsertable.

## Builder Tools

- `record_operating_norm`
- `record_naming_convention`
- `list_org_context`
- `update_org_context`
- `remove_org_context`

Builder writes use source `builder_chat`.

## Assistant Tool

`suggest_context_entry(context_type, context_key, context_value, reasoning)` persists a confirmed context entry with source `ai_suggestion`.

The assistant prompt explicitly says to ask before calling this tool. Repeated vocabulary or policy patterns should be surfaced as a suggestion first; the tool is only for explicit confirmation or direct "remember this" requests.

## Prompt Injection

`getPortfolioContext()` loads active context records for the portfolio's org. `buildSystemPrompt()` formats them as:

```text
=== YOUR ORGANIZATION ===
Operating Norms:
- ...

Naming Conventions:
- ...
```

The section appears after module-level capabilities and before general behavior rules.

## Onboarding

The onboarding assistant extracts durable context with `extract_workflow` using `workflow_type=org_context`. It also captures automation preferences as Phase 3 data. When `/api/onboarding/provision` receives an optional `session_id`, it seeds:
- `workflows.org_context` as typed context entries
- `workflows.automation_preferences` as an org preference

## Acceptance Criteria

1. Builder records "We require a site visit for first-time grantees before recommended." Future assistant prompts include it under `Your Organization`.
2. Builder records "We call grants awards." Future assistant responses can follow that naming convention.
3. The assistant asks before remembering a newly noticed pattern, then `suggest_context_entry` stores it after confirmation.
4. Onboarding-seeded context records are written during provisioning when a session id is supplied.
