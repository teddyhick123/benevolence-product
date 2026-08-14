# Configurability Roadmap

> **Companion documents:** `PLATFORM_VISION.md` establishes the goal and the gap. `CONFIGURABILITY_ARCHITECTURE.md` describes the technical layers. This document sequences the work — what gets built in what order and why.

## Purpose

This roadmap governs how the platform moves from its current state (module on/off, Builder KPI config, coarse AI instructions) to the full vision: an org admin can describe how their organization works, and the platform configures itself to match — without a developer.

Each phase has a defined scope boundary, a concrete acceptance test, and a just-in-time implementation spec. Phases are sequential except where noted. Each phase ships a Builder integration and an onboarding integration so that new orgs get the full configured experience from day one.

---

## Phase Overview

| Phase | Name | What It Unlocks | Key Dependency |
|-------|------|-----------------|----------------|
| 0 | Current State | Module selection, KPI config, AI tool filtering, coarse AI instructions | — |
| 1 | Runtime Workflow Configuration | Stage checklists, required fields per stage, stage labels | None |
| 2 | Custom Fields | Org-scoped typed fields on any entity, AI-queryable | Phase 1 (`required_at_stage` references stage names) |
| 3 | Configurable Automations | Admin-defined trigger → action rules | Phases 1 + 2 (stages and fields as triggers/conditions) |
| 4 | Org-Specific AI Behavior | Persistent org context the AI reads and grows | Phases 1–3 (context references configured workflows and fields) |
| 5 | Configurable Views and Vocabulary | Dashboard layout, module default views, entity naming | Phase 2 (custom fields in table columns) |
| 6 | Integration and Polish | Coherent end-to-end experience: onboarding captures everything, Builder is the OS control panel | All previous phases |

---

## Phase 0: Current State

**What exists today:**

- **Module selection** — org admins enable/disable feature modules. Enforced at nav, API (RLS + `org_has_module()`), and AI tool filtering.
- **Builder** — AI chat in org settings. Can toggle modules, create KPI definitions, update branding, update coarse AI instructions, and create scaffold proposals. Scaffold proposals for deeper changes require developer deployment via PR.
- **AI tool filtering** — assistant receives only tools for enabled modules.
- **Coarse AI instructions** — org admins can store one free-text instruction block that is injected into assistant sessions.
- **Branding** — app name, logo, colors via env vars.

**What every org shares regardless of configuration:** schema, workflows, fields, views, automations, and tool behavior within any given module. Org-specific AI behavior exists only as coarse free text, not structured context.

---

## Phase 1: Runtime Workflow Configuration

### What This Phase Enables

An org admin can define, via Builder chat, the rules governing their grant workflow: what must be completed at each stage, what fields are required before advancing, and what their stages are called. A grant cannot advance past a stage until the org's configured conditions are met.

*Proof: DD checklist example from PLATFORM_VISION.md works end-to-end. The AI can report which checklist items are blocking a grant.*

### Scope

**In:**
- Stage checklist items (per stage, per org) with completion tracking on grant records
- Required field enforcement at stage transitions (fields that must be non-null before advancing)
- Stage label overrides (rename "due_diligence" → "Site Review" in this org's UI without changing the canonical enum)
- Approval requirement flags per stage (board vote required vs. program officer decision)
- Builder tools to configure all of the above via natural language
- Onboarding captures checklist and stage preferences during AI conversation

**Out:**
- Cross-module workflow rules (this phase is grants only)
- Custom automation triggers (Phase 3)
- Custom fields as required transition items (Phase 2; Phase 1 only enforces canonical grant fields and checklist items)
- Configurable views of checklist status (Phase 5)

### Key Schema

```sql
org_workflow_config (
  id, org_id, module text,
  config_type text CHECK (config_type IN ('stage_checklist', 'required_field', 'stage_label', 'approval_requirement')),
  stage_key text,          -- canonical stage name (e.g. 'due_diligence')
  config_key text,         -- e.g. checklist item key or field name
  config_value jsonb,      -- e.g. { label: "Site visit completed", required: true }
  sort_order int,
  created_at, updated_at,
  UNIQUE(org_id, module, config_type, stage_key, config_key)
)

grant_checklist_completions (
  id, org_id, grant_id, workflow_config_id uuid REFERENCES org_workflow_config(id) ON DELETE CASCADE,
  stage_key text, checklist_item_key text,
  completed_by uuid REFERENCES profiles(id),
  completed_at timestamptz,
  UNIQUE(grant_id, workflow_config_id)
)
```

RLS: org-scoped via `can_view_org(org_id)` for reads; `is_org_admin(org_id)` for writes to `org_workflow_config`.

Integrity requirements for the phase spec:
- `stage_key` must be validated against the canonical grant lifecycle stages when `module = 'grant_management'`.
- `grant_checklist_completions.org_id` must match both the referenced grant's `org_id` and the referenced config row's `org_id`.
- `grant_checklist_completions.stage_key` and `checklist_item_key` are denormalized for query ergonomics but must match the referenced config row.
- Checklist completions should be written through an RPC or trigger-protected path so callers cannot complete items for another org or for non-checklist config rows.

### Key Builder Tools Added

`set_stage_checklist` — define checklist items for a stage
`set_required_field_at_stage` — mark a field required before a transition
`rename_stage` — set display label for a canonical stage
`set_approval_requirement` — flag a stage as requiring formal approval
`list_workflow_config` — read current configuration

### Key Lifecycle Change

`lib/grants/lifecycle.ts → canTransition()` currently reads only canonical rules. This phase adds an org-config layer: before allowing a transition, check `org_workflow_config` for checklist completion requirements and required field rules. Canonical immovable rules (e.g., `decision-required` transitions) remain hardcoded and cannot be overridden.

### Acceptance Criteria

1. An org admin tells the Builder: "Require a site visit checklist before any grant can advance to recommended." The Builder creates the config. A grant in `due_diligence` now shows the checklist. Attempting to transition to `recommended` without checking it returns a validation error.
2. An org admin tells the Builder: "Rename 'due_diligence' to 'Site Review' for our org." The pipeline, table view, and grant detail all show "Site Review." The underlying canonical stage value remains `due_diligence` in the database.

### Implementation Spec

Spec created when phase begins: `docs/agent-work/specs/<date>-phase1-workflow-config-design.md`

---

## Phase 2: Custom Fields

### What This Phase Enables

An org admin can create typed, named fields on any entity (grants, holdings, donors, contributions) via Builder chat. Fields appear in entity forms immediately. Values are stored, surfaced in table views as sortable columns, and available to the AI assistant for querying and reasoning.

*Proof: Strategic alignment score example from PLATFORM_VISION.md works end-to-end. The AI can answer "Show me active grants with alignment score below 3."*

### Scope

**In:**
- Custom field definitions: text, integer, decimal, boolean, date, single-select enum
- Fields on: grants, holdings, donors, contributions
- `required_at_stage` on grant fields (field must be set before a stage transition — builds on Phase 1 required-field enforcement)
- Dynamic form rendering on entity detail pages
- Sortable/filterable column in table views (grants table, holdings list)
- AI tool: `get_custom_fields(entity_id, entity_type)` for any entity
- AI can query and filter by custom field values
- Builder tools to create, update, list, and remove field definitions

**Out:**
- Multi-select enum fields (Phase 5 scope if needed)
- Custom fields on join tables or child records (grant milestones, installments) — canonical fields only for now
- Custom field values as automation triggers (Phase 3)
- Aggregations or reporting on custom fields (Phase 6)

### Key Schema

```sql
org_custom_field_definitions (
  id, org_id,
  entity_type text CHECK (entity_type IN ('grant', 'holding', 'donor', 'contribution')),
  field_key text,           -- slug, e.g. 'strategic_alignment_score'
  field_label text,         -- display name
  field_type text CHECK (field_type IN ('text', 'integer', 'decimal', 'boolean', 'date', 'enum')),
  enum_options jsonb,       -- [{ value: 'high', label: 'High' }, ...]  for enum type
  required_at_stage text,   -- grant fields only; canonical stage name
  is_ai_readable boolean NOT NULL DEFAULT true,
  sort_order int,
  created_at, updated_at,
  UNIQUE(org_id, entity_type, field_key)
)

org_custom_field_values (
  id, org_id, entity_id uuid, entity_type text,
  field_definition_id uuid REFERENCES org_custom_field_definitions(id) ON DELETE CASCADE,
  value_text text, value_numeric numeric, value_boolean boolean, value_date date,
  created_at, updated_at,
  UNIQUE(entity_id, field_definition_id)
)
```

RLS: org-scoped. Definitions: `can_view_org` read, `is_org_admin` write. Values: `can_view_org` read, members write.

Integrity requirements for the phase spec:
- `field_definition_id` must belong to the same `org_id` and `entity_type` as the value row.
- The target entity must exist and belong to the same `org_id`; because `entity_id` is polymorphic, enforce this with RPCs/triggers or replace the polymorphic value table with entity-specific value tables in the phase spec.
- Exactly one typed value column must be populated, and it must match `org_custom_field_definitions.field_type`.
- Enum values must be validated against `enum_options`.
- Grant `required_at_stage` values must be canonical lifecycle stages and must participate in Phase 1 transition validation when the entity type is `grant`.

### Key Builder Tools Added

`create_custom_field` — define a new field on an entity type
`list_custom_fields` — show all fields for an entity type
`update_custom_field` — rename, re-type, or change options
`remove_custom_field` — delete definition and all values (destructive, requires confirmation)

### Key AI Tool Added

`get_custom_fields(entity_id, entity_type)` — returns all custom field definitions and current values for an entity. Injected into grant, holding, and donor tool responses automatically when `is_ai_readable = true`.

### Acceptance Criteria

1. An org admin tells the Builder: "Add a strategic alignment score (1–5) to grants, required before recommending." The field appears on grant forms. Attempting to transition to `recommended` with no score set returns a validation error. The AI can answer "List active grants with alignment score below 3."
2. Removing a custom field definition cascades to delete all its values. The Builder warns before executing and requires explicit confirmation.

### Implementation Spec

Spec created when phase begins: `docs/agent-work/specs/<date>-phase2-custom-fields-design.md`

---

## Phase 3: Configurable Automations

### What This Phase Enables

An org admin can define automation rules via Builder chat: when a specific event occurs (grant stage change, date arrives, field value set, task completed), the platform takes a defined action (create a task, send a reminder, notify a member, update a field). Rules are org-scoped and evaluated by the existing task automation infrastructure.

*Proof: "When a grant reaches active, create a task for the program officer: 'Schedule 90-day check-in.'" — defined in Builder, fires automatically.*

### Scope

**In:**
- Trigger types: grant stage transition, date-relative (N days after event), custom field value set, task completed
- Action types: create task (with assignee, due-date formula, title template), send in-app notification to member(s), set a custom field value
- Conditions on triggers: e.g., "only if grant amount > $50,000" or "only for first-time grantees"
- Rule management: enable/disable, list, delete via Builder
- Builder tools to define and manage rules via natural language
- Onboarding captures key automation preferences ("do you want reminders when grants are approaching deadlines?")

**Out:**
- Email automation (in-app notifications only for now)
- Cross-org automation rules
- Webhook or external API actions (Phase 6 scope)
- Automation history / audit log (Phase 6 scope)

### Key Schema

```sql
org_automation_rules (
  id, org_id,
  name text,
  is_active boolean NOT NULL DEFAULT true,
  trigger_type text CHECK (trigger_type IN ('grant_stage_change', 'date_relative', 'custom_field_set', 'task_completed')),
  trigger_config jsonb,     -- e.g. { stage: 'active' } or { days_after: 'grant_approved_at', offset: 90 }
  conditions jsonb,         -- e.g. [{ field: 'amount_usd', op: 'gt', value: 50000 }]
  action_type text CHECK (action_type IN ('create_task', 'notify_member', 'set_custom_field')),
  action_config jsonb,      -- e.g. { title_template: '90-day check-in: {{grant_name}}', assignee_role: 'program_officer', due_days: 7 }
  created_by uuid REFERENCES profiles(id),
  created_at, updated_at
)

org_automation_runs (
  id, org_id, rule_id uuid REFERENCES org_automation_rules(id),
  trigger_entity_id uuid, trigger_entity_type text,
  idempotency_key text UNIQUE,
  status text CHECK (status IN ('queued', 'completed', 'failed', 'skipped')),
  result jsonb,
  ran_at timestamptz
)
```

### Key Builder Tools Added

`create_automation_rule` — define trigger + conditions + action in natural language; Builder translates to structured config
`list_automation_rules` — show all active rules for the org
`enable_automation_rule` / `disable_automation_rule` — toggle without deleting
`remove_automation_rule` — delete rule and future runs (past run records preserved)

### Key Infrastructure Change

The task automation producer framework (`lib/tasks/automation/task-writer.ts`) has hardcoded producers. This phase adds a dynamic producer that evaluates `org_automation_rules` on applicable events. Hardcoded producers remain for canonical behaviors (grant stage → default task types); org rules layer on top. Task-completed rules consume durable `task_automation_outbox` events, and `org_automation_runs.idempotency_key` makes retrying one event/rule pair safe.

### Acceptance Criteria

1. An org admin tells the Builder: "When a grant reaches active, create a task for the program officer titled 'Schedule 90-day check-in' due in 7 days." A grant transitions to `active`. The task appears in the task inbox for the program officer, due 7 days from today.
2. An org admin defines a date-relative reminder, a task-completed notification, and a custom-field-set field update. Each rule fires from the existing automation/event paths and writes an `org_automation_runs` row.
3. An org admin disables the rule. The next matching event occurs. No action is created.

### Implementation Spec

Spec: `docs/agent-work/specs/2026-07-08-phase3-configurable-automations-design.md`

---

## Phase 4: Org-Specific AI Behavior

### What This Phase Enables

The AI assistant accumulates and applies org-specific context: operating norms, naming conventions, process rules, and preferences recorded by admins via Builder. This context is injected into every AI session for the org, after module-level additions. The AI can propose new context entries when it notices patterns worth recording.

*Proof: Site visit norm example from PLATFORM_VISION.md works end-to-end. A new staff member asks "How do we handle site visits?" and gets the right answer.*

### Scope

**In:**
- `org_ai_context` table: persistent org-scoped context records
- Context types: operating norm, naming convention, process rule, preference
- Context injected into AI system prompt at session start (after module additions)
- Builder tools to create, list, update, and remove context records via natural language
- AI assistant `suggest_context_entry` tool — when the AI notices a pattern, it proposes recording it; user confirms
- Onboarding: AI conversation captures and records initial org context during provisioning
- Context is human-readable in Builder ("show me what the AI knows about our org")

**Out:**
- Per-user AI preferences (org-level only in this phase)
- AI learning from conversation history without explicit confirmation (the AI proposes; the human confirms)
- Cross-org context (each org's context is fully isolated)

### Key Schema

```sql
org_ai_context (
  id, org_id,
  context_type text CHECK (context_type IN ('operating_norm', 'naming_convention', 'process_rule', 'preference')),
  context_key text,        -- slug for deduplication, e.g. 'grant_vocabulary', 'site_visit_policy'
  context_value text,      -- natural language, e.g. "We require a site visit for all first-time grantees..."
  source text CHECK (source IN ('builder_chat', 'onboarding', 'ai_suggestion')),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES profiles(id),
  created_at, updated_at,
  UNIQUE(org_id, context_key)
)
```

### Key Builder Tools Added

`record_operating_norm` — store a process or policy the AI should know
`record_naming_convention` — store vocabulary preferences ("we call grants 'awards'")
`list_org_context` — show all active context records
`update_org_context` — modify an existing entry
`remove_org_context` — deactivate or delete a context record

### Key AI Tool Added

`suggest_context_entry(context_type, context_key, context_value, reasoning)` — the AI calls this when it notices a pattern worth recording. The assistant presents it as a suggestion before writing anything: "I notice you consistently refer to grants as 'awards' — should I remember that for future conversations?"

### Prompt Injection Point

`lib/ai/assistant/prompts.ts → buildSystemPrompt()` — after module-level additions, inject active `org_ai_context` records as a "Your Organization" section. Records are formatted as prose, not a raw list.

### Acceptance Criteria

1. An org admin tells the Builder: "Remember that we require a site visit for all first-time grantees before advancing to recommended." A new staff member opens the AI assistant and asks: "How do we handle site visits?" The AI answers correctly, citing the org's policy.
2. During a conversation where the user refers to grants as "awards" three times, the AI surfaces a suggestion: "I notice you use 'awards' instead of 'grants' — want me to remember that?" The user confirms. All subsequent AI responses use "awards."

### Implementation Spec

Spec: `docs/agent-work/specs/2026-07-08-phase4-ai-context-design.md`

---

## Phase 5: Configurable Views and Vocabulary

### What This Phase Enables

Org admins control what they see: dashboard widget layout, default landing view per module, which columns appear in table views, and what entities are called throughout the UI. A family office can put their payout gauge front and center. A corporate giving program can rename "Grants" to "Awards" everywhere without touching code.

*Proof: Family office sees payout status on dashboard by default. Corporate program sees "Awards" instead of "Grants" across the entire UI.*

### Scope

**In:**
- Dashboard layout configuration: which widgets appear, in what order, pinned vs. carousel
- Module default view: which tab/view a module lands on (e.g., grants opens to Attention Queue instead of Pipeline)
- Table column configuration: which columns are visible and in what order in grants table, holdings list, donors list
- Entity vocabulary overrides: rename top-level entities (Grant→Award, Holding→Portfolio Company, Donor→Supporter, Contribution→Gift) org-wide — UI labels only, canonical schema names unchanged
- Builder tools for all of the above
- Config stored in `org_view_config` and resolved at render time

**Out:**
- Per-user view preferences (org-level defaults only; users can't yet override)
- Custom page layouts or new page types (requires developer)
- Completely custom navigation structure

### Key Schema

```sql
org_view_config (
  id, org_id,
  config_scope text CHECK (config_scope IN ('dashboard', 'module_default', 'table_columns', 'entity_vocabulary')),
  scope_key text,           -- e.g. 'grants_table', 'grant_module', 'entity.grant'
  config_value jsonb,       -- e.g. { columns: ['name', 'stage', 'amount', 'strategic_alignment_score'] }
  created_at, updated_at,
  UNIQUE(org_id, config_scope, scope_key)
)
```

### Key Builder Tools Added

`set_dashboard_layout` — configure which widgets appear and in what order
`set_module_default_view` — set the landing tab for a module
`set_table_columns` — define visible columns (including custom fields from Phase 2)
`rename_entity` — set vocabulary override for an entity type

### Key UI Change

All entity label rendering goes through a `useEntityVocabulary()` hook (or server-side equivalent) that reads `org_view_config` for vocabulary overrides before rendering. No hardcoded "Grant" strings in component JSX — all use the vocabulary resolver.

### Acceptance Criteria

1. An org admin tells the Builder: "Show our payout gauge and grant attention queue on the dashboard. Don't show the widget carousel." The dashboard reflects this immediately and persists across sessions.
2. An org admin tells the Builder: "We call grants 'Awards.'" Every nav item, page title, table header, and AI response that referred to "grants" now reads "Awards." The database still stores `grants`; exports and 990-PF data use canonical terminology.

### Implementation Spec

Spec: `docs/agent-work/specs/2026-07-08-phase5-views-vocabulary-design.md`

---

## Phase 6: Integration and Polish

### What This Phase Enables

The platform feels like a coherent "dream OS" from first login. Onboarding captures all configured layers during the AI conversation and provisions them automatically. The Builder becomes the single control panel for the entire org configuration. Report templates are configurable. The AI can give a complete picture of how the org is configured and help evolve it over time.

### Scope

**In:**
- Onboarding AI conversation extended to capture and provision: workflow checklists, key custom fields, core automation rules, org naming conventions, dashboard preferences — in a single conversational flow
- Configurable board report templates: logo, section selection, content ordering, custom field inclusion
- Builder configuration history: admins can see what was changed, when, and by whom
- Builder can give a full configuration summary: "Here's how your org is currently set up" across all six layers
- Selected P2 items from `docs/agent-work/BACKLOG.md` are revalidated, batched, and resolved
- End-to-end walkthrough tests covering the full configured-org experience

**Out:**
- External-facing portals (grantee application intake, board portal) — separate product surface requiring significant new work
- Per-user configuration preferences — org-level only throughout this roadmap
- Webhook / external API automation actions
- New module capabilities beyond what exists at Phase 5 — new capabilities go through normal module development, not the configurability roadmap

### Acceptance Criteria

1. A new org admin signs up, completes onboarding, and describes their foundation's operation in the AI conversation. By the time they land on the dashboard: their preferred modules are enabled, their key checklist items are configured, their entity vocabulary is set, their most important widget is pinned. No additional setup required.
2. An admin asks the Builder: "Show me everything that's configured for our org." The Builder returns a complete, human-readable summary of all `org_workflow_config`, `org_custom_field_definitions`, `org_automation_rules`, `org_ai_context`, and `org_view_config` records, organized by layer.

### Implementation Spec

Spec: `docs/agent-work/specs/2026-07-08-phase6-integration-polish-design.md`

---

## Cross-Cutting Concerns

### Builder UX Across All Phases

The Builder gains tools in every phase. The UX must keep up:
- Phase 1: Builder understands grant workflow vocabulary
- Phase 2: Builder can describe field types and their implications
- Phase 3: Builder can translate natural language automation descriptions into structured rules ("when a grant is approved, remind the program officer in two weeks")
- Phase 4: Builder presents org context in a readable summary view
- Phase 5: Builder previews layout changes before applying
- Phase 6: Builder owns the full config surface and can audit it

### Onboarding Integration

Each phase ships an onboarding integration: the AI conversation learns to ask about and capture that phase's configuration layer. By Phase 6, a single onboarding conversation produces a fully configured org.

### Testing Strategy

Each phase ships:
- Contract tests for new schema (migration structure, RLS policies, enum values)
- Auth tests for new API routes (401/403 boundaries)
- A walkthrough mission testing the phase end-to-end in the simulated walkthrough stack

The `CONFIG-POINT` comment pattern from `CONFIGURABILITY_ARCHITECTURE.md` should be used to mark hardcoded values that will become configurable in a later phase.

### The Developer-Required Boundary

This roadmap closes the configuration gap for the platform's existing capability envelope. What still requires a developer after Phase 6:
- New entity types
- New integrations (QuickBooks beyond what exists, new external APIs)
- New module-level capabilities
- Schema changes that affect multiple orgs
- Security controls, audit trail behavior, RLS policies
- External-facing portals (grantee intake, board portal)

The Builder's scaffold-and-PR path remains for these cases. The roadmap and the scaffold path are complementary — the roadmap defines the self-service surface; the scaffold path handles capability expansion.

---

## How to Use This Roadmap

1. **Before starting a phase:** Brainstorm and write the phase's implementation spec (`docs/agent-work/specs/`). Use that spec to generate the implementation plan (`docs/agent-work/plans/`).
2. **During a phase:** Mark hardcoded values that belong to a later phase with `// CONFIG-POINT: <description> — configurable in Phase N`.
3. **After a phase ships:** Update this document to note the ship date and any scope changes that were made.
4. **Adding scope:** If new requirements emerge that don't fit a phase boundary, add them explicitly rather than expanding phase scope silently. Each phase should remain shippable independently.
