# Configurability Architecture

> This document is the technical companion to `PLATFORM_VISION.md`. It describes the current configurability layers, the three missing layers, and the end-state architecture for a platform where org admins can configure their operating system without writing code.

---

## Current Configurability Layers

The platform today has three real configurability layers. Understanding what they actually do — and where they stop — is the foundation for building what's missing.

### Layer A: Module Selection

**What it does:** Enables or disables entire feature modules (grants, tax, donors, compliance, etc.) per org. Module state lives in `organizations.modules` JSONB. Enforcement is three-deep: nav items hide, API routes return 403 via `org_has_module()` RLS checks, and AI tools are filtered out of the assistant context.

**What it enables:** An org can be a grants-only shop or a full-stack operation. A DAF sponsor doesn't see the compliance module. A family office without donor programs doesn't see the donor CRM.

**Where it stops:** Within any enabled module, every org gets the same schema, the same workflows, the same fields, and the same AI behavior. Module selection is a binary gate, not a configuration surface.

### Layer B: Builder (Current State)

**What it does:** An org-admin-facing AI chat (`app/api/org/[orgId]/builder/`) that reads the org's current module state and codebase scaffold context. It can propose and apply: module enable/disable, KPI definition creation, metric structure configuration. Scaffold proposals for new data shapes are generated as code diffs and require developer review + deployment via PR.

**What it enables:** An admin can ask "enable the analytics module" or "create a KPI for total grants disbursed this year" and the Builder executes it directly. For deeper customization (new tables, new views), it generates a proposal the developer reviews and deploys.

**Where it stops:** Anything beyond module config and KPI structure requires code deployment. Custom fields, workflow rules, and checklist items are not configurable at runtime. The Builder is a bridge to developers, not a self-service surface.

### Layer C: AI Tool Filtering

**What it does:** The AI assistant receives only the tools corresponding to the org's enabled modules. A `filterToolsForOrg()` call removes tools for disabled modules before the context is sent to the model.

**What it enables:** The assistant is scoped to what the org actually uses. It never suggests grant tools to an org that doesn't have grant management enabled.

**Where it stops:** Within enabled modules, all orgs get identical tool behavior. The assistant has no org-specific context, no knowledge of the org's workflows, naming conventions, or operating norms. It's module-filtered but org-generic.

---

## The Three Missing Layers

### Missing Layer 1: Runtime Workflow Configuration

**What it is:** The ability for an org admin to define, at runtime, the rules and requirements of their workflows within a module — without changing the database schema or deploying code.

**Concretely missing:**
- Custom checklists per lifecycle stage (e.g., "Site visit required before `recommended`")
- Required field rules per stage (e.g., `strategic_alignment_score` must be set before `approved`)
- Stage-level approval requirements (e.g., "board vote required" vs. "program officer decision")
- Custom labels for stages, entities, and fields

**What it needs in the schema:** An `org_workflow_config` table (or JSONB on `organizations`) that stores per-module, per-org workflow rules. The grant transition logic in `lib/grants/lifecycle.ts` reads canonical rules today; it needs to also read org-level overrides.

**Where the Builder fits:** Builder chat becomes the interface for configuring this. "Require a site visit checklist item before any grant can advance to recommended" is a Builder command, not a code change.

### Missing Layer 2: Custom Fields

**What it is:** Org-scoped, typed, named fields that can be attached to any entity (grants, holdings, donors, contributions) and are stored, indexed, and AI-readable.

**Concretely missing:**
- A program officer cannot add `strategic_alignment_score` to a grant without a migration
- A family office cannot tag holdings by `championing_family_member` without a code change
- None of this data is available to the AI assistant for querying or reasoning

**What it needs in the schema:**
```sql
-- Defines the field
org_custom_field_definitions (
  id, org_id, entity_type, field_key, field_label,
  field_type (text|integer|decimal|boolean|date|enum),
  enum_options jsonb,  -- for enum type
  required_at_stage text,  -- for grant fields: stage name
  is_ai_readable boolean
)

-- Stores the values
org_custom_field_values (
  id, org_id, entity_id, entity_type, field_definition_id, value_text, value_numeric, value_boolean, value_date
)
```

RLS: both tables are org-scoped via `can_view_org(org_id)`. Values are joined into entity queries at the API layer; the AI executor gets a `get_custom_fields(entity_id)` tool.

**Where the Builder fits:** "Add a required field 'Strategic Alignment Score' (1–5 rating) to grants" is a Builder command that creates a `org_custom_field_definitions` row. No migration required.

### Missing Layer 3: Org-Specific AI Behavior

**What it is:** Persistent, org-scoped context that the AI assistant reads at the start of every session — encoding the org's processes, naming conventions, preferences, and operating norms.

**Concretely missing:**
- The AI doesn't know this org calls grants "awards"
- The AI doesn't know this foundation requires a site visit before recommending
- The AI doesn't know the finance director wants payment confirmations flagged
- The AI can't learn from past sessions to improve future ones

**What it needs in the schema:**
```sql
org_ai_context (
  id, org_id,
  context_type (operating_norm|naming_convention|process_rule|preference),
  context_key text,   -- e.g., 'grant_vocabulary', 'dd_requirements'
  context_value text, -- natural language or structured content
  is_active boolean,
  created_by uuid references profiles(id),
  updated_at timestamptz
)
```

This table's content is injected into the AI system prompt at session start, after module-level additions. The Builder is the interface for creating and editing these records. The AI assistant itself can propose additions: "I notice you always refer to grants as 'awards' — want me to remember that?"

**Where the Builder fits:** "Remember that we require a site visit for all first-time grantees before recommending" creates an `org_ai_context` row. That context appears in every subsequent AI session for this org.

---

## How the Builder Evolves

The Builder's evolution follows a clear progression as each missing layer is added:

### Phase 1 (Current): Module Config + Scaffold Proposals

The Builder can toggle modules and propose KPI structures. Deeper changes require developer deployment via PR.

**Boundary:** Module-level config only.

### Phase 2: Runtime Workflow Config

The Builder gains tools to read and write `org_workflow_config`. An admin can define stage checklists, required-field rules, and stage labels via Builder chat. No code deployment required.

**New Builder tools:** `set_stage_checklist`, `set_required_field_at_stage`, `rename_stage`, `set_approval_requirement`

**Boundary:** Workflow rules within existing module schemas.

### Phase 3: Custom Fields

The Builder gains tools to create and manage `org_custom_field_definitions`. Fields appear in entity forms, table views, and AI tool context automatically.

**New Builder tools:** `create_custom_field`, `list_custom_fields`, `update_custom_field`, `remove_custom_field`

**Boundary:** Custom data attached to existing entities. New entity types still require developer work.

### Phase 4: Org AI Context

The Builder gains tools to create and manage `org_ai_context`. The AI assistant can propose context entries during conversation. Context is injected into every AI session for the org.

**New Builder tools:** `record_operating_norm`, `record_naming_convention`, `list_org_context`, `remove_org_context`

The AI assistant itself gains a `suggest_context_entry` tool it can call when it notices a pattern worth recording.

**Boundary:** AI behavior personalization within the platform's existing capabilities. New capabilities still require developer work.

---

## End State

When all four phases are complete, an org admin's experience looks like this:

1. **Onboarding** — the AI conversation captures the org's workflows, naming conventions, and requirements. The Builder provisions modules and records initial org AI context automatically.

2. **Configuration** — the admin opens the Builder tab and describes their grant workflow: stages they use, what's required at each stage, what their DD checklist looks like, what they call things. The Builder creates workflow rules and context entries. No code is deployed.

3. **Custom data** — the admin adds custom fields to grants, holdings, and donors via the Builder. Fields appear immediately in forms and views. The AI can reason about them.

4. **Daily operation** — the AI assistant knows this org's context. It uses the right vocabulary, enforces the right stage rules, flags the right things, and gets more useful as it accumulates operating context.

5. **Evolution** — when the org's needs change — new program area, new compliance requirement, new team structure — the admin updates their configuration in the Builder. No developer required for anything within the platform's capability envelope.

**What still requires a developer:** New entity types, new integrations, new module-level capabilities, schema changes that affect multiple orgs, any change to security controls or audit trail behavior. The distinction is runtime configuration (admin) vs. platform capability expansion (developer).

---

## Developer Guidance

When building new features, ask: is this **platform capability** or **org configuration**?

- **Platform capability:** A new type of entity, a new integration, a new calculation method, a new AI tool. Goes through the normal module development flow. Ships to all orgs.

- **Org configuration:** A rule, a label, a field, a checklist, a preference, a threshold. Should be configurable via the Builder once the relevant missing layer exists. Until that layer ships, hardcode it with a clear comment marking it as a future configuration point.

Mark future configuration points with:
```typescript
// CONFIG-POINT: stage checklist items — hardcoded until org_workflow_config ships
const DUE_DILIGENCE_CHECKLIST_ITEMS = [
  'Site visit completed',
  'Financial statements reviewed',
];
```

This makes the gap visible and searchable without blocking current development.
