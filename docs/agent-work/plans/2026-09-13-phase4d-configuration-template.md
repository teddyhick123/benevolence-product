# Phase 4D — Configuration Template Implementation Plan

**Status:** Completed 2026-09-13. `verify:unit`, migration assertions, generated-type checks, hygiene, repository-wide lint, focused CLI contracts, and the full source-to-target configuration round trip pass. A five-warning mechanical cleanup restored the existing lint threshold of 442 warnings without changing behavior.

**Goal:** Export an organization’s reusable operating configuration as a deterministic, portable JSON template; review it in Git; diff it against another organization; and apply it atomically without deleting target configuration.

**Architecture:** `lib/config-template/` owns a closed artifact schema, canonical serialization, reference-path registry, live-data projection, comparison, and transactional application. CLI scripts are thin transport adapters around that boundary. A template carries informational metadata separately from the canonical semantic payload, uses natural keys rather than source identifiers, and is refused if it contains an unmapped source reference, an unsupported format, or an incompatible schema ledger.

**Spec:** `docs/agent-work/specs/2026-09-13-phase4d-configuration-template-design.md`

## Global constraints

- `db/migrations` is canonical. These are prerelease corrections, so change each owning migration rather than add a patch migration.
- After every migration edit run `npm run db:types:generate` and commit the generated type file, even when the generated output does not change.
- The CLI’s database credentials are transport only. `config:apply` receives `--actor`, proves that user is an admin of the target org inside the transaction, and appends one `org_audit_log` record in the same transaction.
- Never use `SELECT *` as an artifact serializer. Each template section is an explicit, closed DTO and rejects unknown input fields.
- Never copy source UUIDs, organization IDs, portfolio IDs, author IDs, or row timestamps into a semantic payload. Any nested entity reference must appear in the reference-path registry and be represented by its natural key.
- Apply is one direct Postgres transaction through `withTransaction`; it reads live state and runs `compareConfig` inside that transaction. A prior diff is advisory only.
- Run `npm run verify:types`, `npm run verify:lint`, and focused Vitest tests after each task. Run `npm run verify:migrations` after Task 1 and the full verification suite before merging.

## File map

| Path | Responsibility |
|---|---|
| `lib/config-template/types.ts` | Closed template DTOs, section keys, natural keys, reports |
| `lib/config-template/canonical.ts` | Canonical JSON bytes, SHA-256, semantic equality, deterministic ordering |
| `lib/config-template/references.ts` | Registered nested reference transforms and source-identity rejection |
| `lib/config-template/canonical.ts` | JSON parsing, format/schema validation, canonical JSON bytes, and SHA-256 |
| `lib/config-template/live.ts` | Explicit semantic projections from the source/target database |
| `lib/config-template/compare.ts` | Pure `{ create, update, same, extra }` computation |
| `lib/config-template/apply.ts` | Admin proof, dependency-ordered upserts, module validation, audit write |
| `scripts/config-export.ts` | Export CLI |
| `scripts/config-diff.ts` | Diff CLI |
| `scripts/config-apply.ts` | Apply CLI |

## Task 1 — Make natural-key upserts physically true

**Why:** Atomic upserts require the database to enforce the declared natural keys. A check-then-insert implementation would race and make idempotency an illusion.

**Changes:**

- Add `UNIQUE (portfolio_id, name)` to the `report_templates` definition in `0011_reports.sql`.
- Add `UNIQUE (org_id, name)` to the `workflow_templates` definition in `0041_task_workflow_foundation.sql`; the existing partial unique system-template name index remains responsible for null-org system rows.
- Add `UNIQUE (org_id, name)` to the `org_automation_rules` definition in `0051_configurable_automations.sql`; retain 0056’s onboarding-session constraint for its existing provisioning contract.
- Retain the deferrable `(portfolio_id, position)` widget constraint. It cannot be used as an `ON CONFLICT` arbiter, so Task 6 serializes widget select/update/insert with the existing portfolio advisory transaction lock.
- Correct the canonical extension-point names in `AGENTS.md` and `CLAUDE.md` together, then update their parity test only if its contract text changes.
- Add database assertions for all three constraints and a duplicate-natural-key preflight used by the clean-reset/reprovision runbook.

**Proof:** A duplicate natural-key insert fails at the database layer for every section; `npm run db:types:generate` and `npm run verify:migrations` pass from a clean reset.

## Task 2 — Extend schema compatibility to checked ledger records

**Why:** Version-only comparison misses a shared migration version whose verified contents differ. A configuration template must not write through a known schema drift.

**Changes:**

- Extend `checkSchemaCompatibility` to accept ledger entries with `version` and `checksum`.
- Retain the existing target-ahead warning and target-behind refusal.
- Refuse when a version exists in both ledgers and both checksums are verified but differ; do not treat `unverified` adoption rows as proof of equality.
- Update the Phase 4C importer to query target checksums and use the enhanced contract, preserving its archive compatibility tests.

**Proof:** Unit fixtures cover identical, target-ahead, target-behind, checksum-drifted, and adopted-ledger cases.

## Task 3 — Define and canonicalize the artifact

**Why:** Human-readable JSON is only reviewable when semantically identical exports yield identical bytes, and only portable when source identities cannot leak through a generic row serializer.

**Changes:**

- Create strict Zod DTOs for the header and all nine sections. Explicitly project allowed fields for KPIs, custom fields, views, widgets, report templates, workflow configuration, automation rules, and workflow templates.
- Define each section’s natural-key function and canonical section ordering. Sort object keys recursively while preserving meaningful nested-array order.
- Separate `metadata` from the canonical semantic payload. `sourceOrgName` and `exportedAt` never participate in `compareConfig`, canonical bytes, or template SHA-256.
- Reject unsupported format versions, unrecognized keys, and missing natural-key fields.

**Proof:** Different row/property orders produce the same canonical bytes; metadata changes do not; unknown fields and invalid module slugs fail before database access.

## Task 4 — Register every portable reference

**Why:** A JSONB column can hide a source identifier even after top-level IDs are stripped. Applying that identifier to another organization is silent corruption.

**Changes:**

- Add a reference-path registry with serializer, validator, and comparison hooks for every supported nested entity reference. The initial widget metric path uses a metric/KPI key, not a KPI UUID.
- Walk every exported JSON object recursively. Reject source UUIDs and entity-reference-shaped values not claimed by the registry, reporting the exact JSON path.
- Validate references against the template’s dependency-ordered sections and the target’s live natural-key lookup before writes.

**Proof:** A registered widget reference survives A → B; an unregistered UUID in a config field refuses with its path; a missing required target reference rolls back before any upsert.

## Task 5 — Read and compare semantic configuration

**Why:** `config:diff` and `config:apply` must share one comparison to avoid promising work that apply does not perform.

**Changes:**

- Read the current migration ledger and each section through explicit SELECT lists; query portfolio-scoped rows only when `--portfolio` is present.
- Implement pure `compareConfig(template, live)` returning stable `create`, `update`, `same`, and `extra` records with field-level changes for updates.
- Refuse portfolio-scoped content without an explicit portfolio; include it only when the named target/source portfolio is supplied.

**Proof:** Fixtures cover empty target, each report state, omitted target extras, and field-level JSON comparison. A source exported twice has a stable semantic hash.

## Task 6 — Apply atomically and accountably

**Why:** Configuration is live behavior. An apply must be all-or-nothing, must not rely on stale diff output, and must leave a durable explanation of who changed what.

**Changes:**

- In one `withTransaction` callback: load target ledger, validate compatibility, prove `--actor` is an admin member, validate module slugs/dependency closure, read live configuration, compute comparison, and upsert in dependency order.
- Merge enabled template module slugs into `organizations.modules`; never disable target modules.
- Upsert by database natural key. Preserve target `created_at`, `updated_at`, `created_by`, source IDs, and omitted target rows; use the target actor only where a newly-created record genuinely requires an author.
- For widgets only, acquire the portfolio advisory transaction lock and use select/update/insert at `position`; Postgres forbids `ON CONFLICT` against the deliberately deferrable reorder constraint.
- Insert one `org_audit_log` record with `action: 'configuration_template_applied'`, actor, template SHA-256, source breadcrumb, and the complete report.

**Proof:** A second apply is all `same`; a target-only row survives; a non-admin actor, invalid module, missing reference, or forced upsert failure leaves no configuration or audit changes.

## Task 7 — Add the CLIs and operator-safe output

**Why:** The artifact moves between dedicated client instances where browser authentication may be unavailable.

**Changes:**

- Add `config:export`, `config:diff`, and `config:apply` package scripts using `ts-node` and the existing direct-Postgres configuration.
- Parse required source/target org, optional portfolio, template path, and required apply actor. Reject extra or malformed flags with usage text.
- Write export JSON only to stdout; write progress, warnings, and errors to stderr so shell redirection produces a valid artifact.
- Print deterministic comparison/apply lines and the canonical template SHA-256. Never print database URLs or credentials.

**Proof:** CLI contract tests assert flag handling, stdout/stderr separation, explicit portfolio refusal, and that apply delegates to the transactional library rather than embedding SQL.

## Task 8 — Prove the Ford portability path

**Why:** The feature’s value is a configuration proven with Ford and safely carried to the next foundation.

**Changes:**

- Add an integration round trip: seed source configuration across all supported sections, export A, apply to B, export B, and compare canonical semantic bytes and hash.
- Include source metadata differences, module dependency validation, a metric-configured dashboard widget, concurrent widget apply serialization, target-only extras, an invalid reference, a non-admin actor, and repeat apply.
- Update the tenant-sovereignty roadmap status: Phases 1–3 and 4A–4C are merged; Phase 4D is in delivery; Phase 5 remains gated by BLD-01 and Phase 6 by BLD-03.

**Proof:** Focused tests, `npm run verify:migrations`, and the complete normal verification suite pass. The final report includes the remaining Ford production gates rather than implying autonomous Builder delivery exists.
