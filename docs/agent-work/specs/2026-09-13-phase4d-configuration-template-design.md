# Phase 4D — Configuration as a Portable Artifact

**Status:** Implemented 2026-09-13. Local migration, type, focused contract, CLI, and source-to-target round-trip verification are recorded in the companion implementation plan.

**Goal:** A proven organization configuration can be exported as a human-readable artifact, reviewed and version-controlled like code, and applied to a different organization on a different instance.

**Roadmap context:** `docs/agent-work/plans/2026-08-16-tenant-sovereignty-roadmap.md` § Phase 4, scope item 2 — *"a portable, human-readable description of how this org's OS is configured… what lets you carry a proven Ford configuration to the next client."*

**Depends on:** Phase 4C for `checkSchemaCompatibility`, reused rather than reimplemented.

---

## Scope

Phase 4 is decomposed across four specs; this is the last.

| Phase | Covers | Status |
|---|---|---|
| 4A | Migrations ledger and schema transparency | Merged `c0d0eca2` |
| 4B | Full org data export | Merged `b9d49920` |
| 4C | Organization data import | Merged `4aff05de` |
| **4D** | **Configuration as a portable artifact** | **This spec** |

Import is one project: define the artifact, export it, compare it, apply it. Roughly 8 tasks.

### What this is not

This is **templating, not backup**. 4B and 4C already restore an organization exactly. The distinguishing question for every decision here is whether something is worth carrying to a *different* client — which makes org-independence the defining constraint rather than fidelity.

Because the artifact is text, *diffable* and *version-controllable* come free from git. No custom tooling is built for either.

---

## Decisions

| Decision | Choice |
|---|---|
| Purpose | A template: org-independent, keyed by natural keys |
| Contents | Structure and behaviour, not content or commercial terms |
| Apply semantics | Upsert by natural key; never delete |
| Portfolio-scoped sections | Named explicitly with `--portfolio`; refuse if absent |
| Drift | A `config:diff` command sharing the apply's comparison |
| Format | Versioned JSON: informational metadata plus a canonical semantic payload |
| Validation | Closed per-section schemas; unknown fields and unmapped source references fail closed |
| Audit | Apply requires a target-org admin actor and appends an `org_audit_log` record; export audits when an actor is supplied |

### Why JSON rather than YAML

The roadmap asks for human-readable. Pretty-printed JSON with recursively sorted object keys diffs and reviews well in git, and adds no dependency. YAML reads marginally better at the cost of putting a parser in the trust path of an operation that writes to client databases. The gain did not justify the dependency.

Sorting object keys alone is insufficient: the exporter also sorts each section by its natural key. Arrays whose order is part of the configuration — for example workflow steps and enum options — retain that order. A canonical serializer produces the bytes used for the template hash, semantic comparison, and round-trip test.

### Why upsert never deletes

An apply that removed configuration the template does not mention would, run against the wrong organization, destroy work nobody can recover — configuration is not carried in the 4B data archive. Entities the organization has and the template lacks are reported as `extra` and left alone. Removing something stays a deliberate act.

---

## The artifact

Nine sections plus a header. The **semantic payload** strips every row `id`, `org_id`, `portfolio_id`, author id, and row timestamp: what remains is the shape of a configuration, not a copy of one. Informational metadata is deliberately separate and never affects comparison, hashing, or round-trip equality.

Each section has a closed, versioned artifact schema listing the configuration columns that may cross organizations. The exporter projects only those columns; it never serializes `SELECT *` rows. The reader rejects unknown top-level keys, unknown section keys, and an unsupported `formatVersion`. This prevents a later source-only column, an audit field, or a credential-adjacent value from silently becoming portable configuration.

Configuration JSON is not automatically portable merely because its containing row is. A small reference-path registry defines every supported nested reference and how it is represented. For example, a widget's metric reference is represented by a KPI/metric key, never a KPI UUID. A value that is a source UUID or an otherwise unregistered entity reference makes export refuse with the JSON path and remediation; apply never copies it unchanged. The registry is used by serialization, validation, comparison, and apply so those paths cannot diverge.

| Section | Source table | Natural key |
|---|---|---|
| `modules` | `organizations.modules` | — (a list) |
| `kpis` | `kpi_definitions` | `slug` |
| `customFields` | `org_custom_field_definitions` | `(entity_type, field_key)` |
| `views` | `org_view_config` | `(config_scope, scope_key)` |
| `widgets` | `widgets` | `position` (portfolio-scoped) |
| `reportTemplates` | `report_templates` | `name` (portfolio-scoped) |
| `workflowConfig` | `org_workflow_config` | `(module, config_type, stage_key, config_key)` |
| `automationRules` | `org_automation_rules` | `name` |
| `workflowTemplates` | `workflow_templates` | `name` |

```json
{
  "formatVersion": 1,
  "metadata": {
    "exportedAt": "2026-09-13T00:00:00.000Z",
    "sourceOrgName": "Ford Foundation"
  },
  "schema": { "ledger": [{ "version": "0001", "checksum": "..." }] },
  "modules": ["portfolio", "grant_management", "reports"],
  "kpis": [{ "slug": "grants-disbursed", "unit": "USD", "aggregation": "sum" }]
}
```

`metadata.sourceOrgName` and `metadata.exportedAt` are human breadcrumbs, not keys — nothing resolves against them. They are excluded from the canonical payload, so exporting A, applying to B, and exporting B compares equal without pretending the two organizations share a name or export time. The identity test scans the semantic payload, not this intentional metadata.

The ledger retains the Phase 4B record shape. Compatibility reuses and extends 4C's check: a target missing a template version refuses; a target ahead warns; and a shared version with two verified, unequal checksums refuses. This is required because `jsonb_populate_record` and column-list construction both drop what the target schema lacks, so applying a template built on a newer or drifted schema could silently discard fields.

### Excluded, deliberately

| Excluded | Reason |
|---|---|
| `metric_facts`, `org_custom_field_values` | Measurements and values — data, not configuration |
| `org_ai_context` | Prose describing this specific foundation; carrying it would put one client's narrative into another's assistant |
| `org_ai_spend_caps`, AI routing | Commercial terms and credential-adjacent routing |

---

## Three schema corrections this phase requires

Upsert by natural key needs a unique constraint to be atomic. Five of the nine sections have one. Three do not, and the gaps are not cosmetic.

**`org_automation_rules`** is unique on `(org_id, onboarding_session_id, name)`. That column is nullable, and in Postgres a NULL never conflicts — so template-applied rules, which have no onboarding session, would duplicate on every apply rather than update.

**`report_templates`** has no unique constraint and no `org_id`; it is portfolio-scoped.

**`workflow_templates`** has `org_id` but no unique constraint.

Without a constraint, "upsert by natural key" degrades into select-then-insert, which races and which `ON CONFLICT` cannot express. Application-level cleverness around a missing constraint is a bug waiting for concurrency.

The fix is a migration. The prerelease protocol in `CLAUDE.md` sanctions correcting an owning migration, and this is that case:

- `workflow_templates`: add `UNIQUE (org_id, name)`
- `report_templates`: add `UNIQUE (portfolio_id, name)`
- `org_automation_rules`: add `UNIQUE (org_id, name)`, leaving the existing onboarding-scoped constraint in place

Dropping these three from the template instead would remove automation rules and report templates, which are a large part of what "a proven configuration" means.

Before changing each owning migration, the implementation must query for existing duplicate natural keys and refuse the migration/reset preparation with a report if any exist. A clean prerelease reset is the supported correction path; a ledger-aware, already-applied environment must be reset or explicitly reprovisioned rather than having its historical checksum bypassed. The unique constraints are verified at the database level after a clean reset.

`widgets` already has the required `(portfolio_id, position)` unique constraint, but it is deliberately **DEFERRABLE** so a dashboard reorder can swap positions in one transaction. Postgres does not permit a deferrable unique constraint as an `ON CONFLICT` arbiter. Template apply therefore takes the existing portfolio-scoped advisory transaction lock before selecting and then updating or inserting a widget at a position. The lock makes that exceptional select/insert sequence serializable; the constraint remains the final integrity guard. Do not make the constraint non-deferrable just to simplify template apply — that would break reordering.

### A documentation correction

`CLAUDE.md` names `configurable_automations` and `workflow_config` among the sanctioned extension points. Neither exists; the real tables are `org_automation_rules` and `org_workflow_config`. That is authoritative documentation pointing at tables that are not there, and this phase corrects it.

The same text appears in `AGENTS.md`, which is canonical for the shared protocol, and `tests/integration/agent-instructions-contract.test.ts` fails when the two copies diverge. Both must change in the same commit.

---

## The commands

```
config:export -- --org <id> [--portfolio <id>] > ford.json
config:diff   -- --template ford.json --org <id> [--portfolio <id>]
config:apply  -- --template ford.json --org <id> --actor <user-id> [--portfolio <id>]
```

CLI for all three, matching 4C: a template is carried between instances, and the apply target may be a fresh deployment with no browser administrator to authenticate as. `config:apply` nevertheless requires an existing target-org admin in `--actor`; the transaction proves that membership before writing and writes an `org_audit_log` row with the actor, canonical template SHA-256, source breadcrumb, and create/update/same/extra summary. `config:export` accepts the same optional actor to audit an export when one is known. Credentials are privileged transport, never authority.

**All three call one pure `compareConfig(template, live)`** returning `{ create, update, same, extra }` per entity. This is Phase 4A's ledger pattern, for the same reason: a preview that computes its answer separately from the action it previews will eventually disagree with it. Here that would mean a diff promising one thing and an apply doing another, against a client's live configuration.

```
  create  kpi          grants-disbursed
  update  kpi          impact-reach  (unit: count -> people)
  same    view         dashboard.main
  extra   automation   local-reminder  (org has it; template does not)
```

**Apply validates before it writes and runs in one transaction**, reusing 4C's `withTransaction`. It reads target state, computes `compareConfig`, performs the declared upserts in dependency order, writes the audit record, and prints that exact in-transaction report. A prior `config:diff` is informational; apply never reuses a stale preview. `modules` merges into the `organizations.modules` JSONB rather than replacing it, so enabling what a template needs cannot disable what an organization already uses. Before that merge, every module slug is validated against `module_definitions`, the core `portfolio` module is present, and the full dependency closure is checked.

**Portfolio-scoped sections refuse rather than guess.** A template containing `widgets` or `reportTemplates` applied without `--portfolio` is an error naming what it needs. An organization with several portfolios has no defensible default, and silently choosing one would overwrite a dashboard nobody was thinking about.

---

## Testing

- **`compareConfig` against fixtures**: create, update, same, extra, and an empty organization. Pure, no database.
- **Canonical round trip**: export organization A, apply to organization B, export B, and the canonical semantic payloads and SHA-256 hashes match; their metadata may differ.
- **Idempotency**: applying twice changes nothing the second time — which the three new unique constraints are what make true.
- **Never deletes**: an entity the organization has and the template lacks survives an apply, asserted directly.
- **Identity stripping**: no semantic payload contains a source UUID, an `org_id`, a `portfolio_id`, author id, or a row timestamp. Intentional metadata is excluded from this assertion.
- **Reference handling**: supported references serialize as their registered natural keys; an unknown source reference refuses with its JSON path; and a target missing a required reference refuses before any write.
- **Canonicalization**: equivalent source rows returned in different database orders produce identical canonical bytes; meaningful nested-array order remains unchanged.
- **Deferrable widget key**: concurrent applies to one portfolio serialize through the advisory lock; widget reordering remains valid with its deferrable unique constraint.
- **Portfolio refusal**: a template with widgets or report templates refuses without `--portfolio`.
- **Schema refusal**: a template built on a newer or checksum-drifted schema is refused, reusing the enhanced 4C check.
- **Authorization and audit**: a non-admin actor is refused before writes; a successful apply writes one complete `org_audit_log` event in the same transaction.
- The three new unique constraints, asserted at the database level as 4B and 4C assert theirs.

### What the round trip does not prove

It proves a template reproduces *configuration*, not that the resulting organization behaves identically. A dashboard can reference a KPI whose data does not exist in the target, and that is correct for a template rather than a defect. The spec states this so the test is not read as a stronger guarantee than it is.

## Scope estimate

Ten tasks: the three unique constraints and the documentation correction, the canonical artifact schemas and reference registry, the compatibility extension, `compareConfig`, the export command, the diff command, the audited apply command, the portfolio-scoped sections, and the round-trip proof.

## Out of scope

- Restoring one organization's own configuration exactly. That is 4B and 4C.
- Deleting configuration an apply does not mention, under any flag.
- A review UI. The artifact is text; git is the review tool.
- Templating `org_ai_context`, spend caps, or AI routing.
- Partial application of a single section. A template is applied whole.
