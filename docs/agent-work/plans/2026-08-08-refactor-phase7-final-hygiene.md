# Refactor Phase 7 — Final Hygiene

**Date:** 2026-08-08
**Status:** Complete
**Branch:** `codex/refactor-phase7-final-hygiene`
**Prerequisite:** Phase 6 is merged into local `main` at `8ebf55cd`.

## Objective

Finish the umbrella refactor with an executable dead-code/dependency audit, removal of confirmed compatibility debris, deletion of stale legacy SQL, and documentation that describes the boundaries the application actually enforces. Preserve the Phase 2 access/repository boundary, Phase 3 durable AI turn/idempotency boundary, Phase 5 schema/extensibility canon, and Phase 6 browser transport boundary.

This is a hygiene phase. It does not change URLs, intended product behavior, active migrations, generated database types, or organization-specific extension semantics.

## Verified starting point

- Local `main` is clean at `8ebf55cd`; Phase 6 verification is green.
- `db/legacy/` contains 78 tracked SQL files (612 KB). Live documentation still describes them as reference material even though `db/migrations` is the sole schema canon.
- `supabase/migrations` is the required symlink to `../db/migrations` and must remain unchanged.
- Knip 6.32.0 initially reports 37 unused files, 67 unused exports, 54 unused exported types, four unused dependencies, two undeclared direct dependencies, five duplicate exports, and deliberate script/template entry points that need configuration.
- depcheck 1.4.7 initially reports six unused runtime packages, two unused development packages, and the same undeclared `@next/env`/`vite` imports. Tailwind/PostCSS config and `tsconfig-paths/register` are known static-analysis exceptions.
- Confirmed compatibility surfaces include dead root contexts, unused component/domain barrels, and unused aliases in `lib/supabase.ts`. Other reported exports belong to generated database types, tests, worker entry points, or intentionally reusable domain libraries and require explicit classification before removal.
- Module templates still demonstrate retired inline auth, direct Supabase access, raw browser `fetch`, old route ownership, and the old monolithic AI executor pattern.
- `AGENTS.md` and `CLAUDE.md` still instruct new modules to use the unused `ModuleContext` client gate and stale template patterns.

## Non-negotiable boundaries

1. Do not edit active SQL under `db/migrations` or regenerate `lib/database.types.ts` unless verification proves an unrelated drift; Phase 7 has no schema exception.
2. Deleting `db/legacy/` must not touch `db/migrations`, `db/demo`, `db/scripts`, or the `supabase/migrations` symlink.
3. Do not remove an export solely because one analyzer reports it. Confirm repository references, framework conventions, script entry points, generated contracts, and documented public/template use.
4. Do not collapse scoped repositories back into generic elevated clients or move authorization into browser code.
5. Preserve stable AI request IDs, normalized `ai_turns`/`ai_messages`, transactional begin/complete/fail operations, deterministic replay, and at-most-once tool effects.
6. Organization-specific fields and behavior remain in sanctioned data/configuration extension points; hygiene must not introduce client-specific DDL.
7. No product URL changes, behavior fixes from the findings log, or major dependency upgrades.
8. Lint warnings may only ratchet down.

## Audit contract

Add pinned Knip and depcheck development tools and a `verify:hygiene` script. The checked-in configuration must:

- recognize Next.js routes, middleware, configs, scripts, Supabase functions, compile-only type contracts, and other genuine entry points;
- exclude placeholder-based module template source from parsing while separately testing the rendered template contract;
- list narrow dependency exceptions with an adjacent explanation;
- report unused files, dependencies, exports, types, and duplicate exports;
- run in CI so dead surfaces cannot silently regrow; and
- fail rather than maintain an unbounded warning baseline.

The audit record will classify every initial finding as removed, a configured entry point, a generated contract, a deliberate public surface, or a documented analyzer limitation.

## Implementation sequence

### Task 1 — Reproducible hygiene tooling

1. Add exact development versions of Knip and depcheck.
2. Declare `@next/env` and `vite` directly because repository-owned files import them.
3. Add `audit:dead`, `audit:deps`, and `verify:hygiene` scripts.
4. Add a focused Knip configuration and depcheck exception configuration.
5. Add `verify:hygiene` to the normal CI gate.

### Task 2 — Confirmed dead files and barrels

1. Remove files with no runtime, test, script, template, or documented entry-point consumer.
2. Remove dead `index.ts` barrels rather than retaining compatibility-only re-exports.
3. Remove the unused `contexts/ModuleContext.tsx` and `contexts/index.ts`; update Phase 6 source scanning to tolerate an absent optional root.
4. Update Builder check-matrix tests that use removed paths only when those paths no longer represent a supported proposal surface.
5. Run focused types, unit tests, lint, and Knip after each bounded deletion group.

### Task 3 — Dependencies and compatibility exports

1. Remove confirmed unused packages such as retired SDKs/data bundles after proving no config, worker, template, or transitive runtime contract uses them.
2. Keep Tailwind/PostCSS and script-loader packages through narrow documented audit exceptions where static import discovery is insufficient.
3. Remove only confirmed unused compatibility aliases and duplicate barrel exports.
4. Keep generated database helper exports and deliberate worker/library APIs when their contract is broader than current internal imports; document those exceptions in the audit configuration.

### Task 4 — Retire legacy SQL

1. Delete all 78 tracked files under `db/legacy/`; Git history is the archive.
2. Remove `db/legacy/` from Builder path policy and tests.
3. Update current database, onboarding, and setup documentation so it never directs an agent or developer to stale SQL.
4. Leave archived historical reviews unchanged when they are clearly labeled archival, but prevent them from being treated as current schema guidance.
5. Add a contract that rejects a recreated `db/legacy/` directory or authoritative SQL outside the sanctioned database roots.

### Task 5 — Modernize extension templates and agent guidance

1. Rewrite module templates around org-scoped routes, typed access contexts, scoped repositories, standard response helpers, domain hooks/shared browser transport, and split AI definitions/executors.
2. State the schema decision protocol: stable shared platform semantics may enter canonical migrations; org/client variability uses custom fields, KPI facts, widgets/view config, automations/workflows, modules, or validated JSONB.
3. Remove instructions to use `ModuleContext`, inline auth, direct elevated clients, raw browser `fetch`, or monolithic AI dispatcher cases.
4. Update `AGENTS.md`, `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/MODULES.md`, README/setup/database docs, and template documentation consistently.
5. Add source contracts for the current template and documentation invariants.

### Task 6 — Phase boundary verification

Run:

1. `npm run verify:hygiene`;
2. `npm run verify:types`;
3. `npm run verify:lint` and lower the warning ceiling only by the warnings actually removed;
4. `npm run verify:unit`;
5. `npm run verify:build`;
6. `npm run verify:migrations` to prove legacy deletion did not affect the canon or generated types;
7. the agent, Builder, access, schema, client-data, template, and AI durability contract suites; and
8. representative local walkthrough smoke journeys.

Record any product behavior discovery in the findings log instead of changing it. Update this plan with the final audit classifications and verification counts.

## Commit sequence

1. `docs(refactor): plan phase 7 final hygiene`
2. `chore(hygiene): add reproducible dead-code audits`
3. `refactor(hygiene): remove confirmed dead surfaces`
4. `chore(db): retire legacy schema archive`
5. `docs(architecture): align extension guidance with current boundaries`
6. `refactor(hygiene): complete phase 7`

## Exit criteria

Phase 7 is complete only when:

- Knip and depcheck pass from a clean install with every exception narrow and documented;
- confirmed dead files, exports, types, barrels, aliases, and packages are removed;
- no `db/legacy/` directory or live reference treats stale SQL as authoritative;
- `db/migrations` and `supabase/migrations → ../db/migrations` remain untouched and verified;
- templates and agent documentation generate code that follows the access, repository, schema, AI durability, and client transport boundaries;
- docs match the current directory structure, module lifecycle, and extension model;
- the full type, lint, unit, build, migration, contract, and smoke gates pass; and
- the branch lands as reviewable commits with a clean worktree.

## Expected review focus

- False positives: an analyzer exception must name a real framework, generated, script, worker, or public-library reason.
- Behavioral preservation: deletion must not remove a dynamically resolved component, job, tool, or deployment entry point.
- Schema safety: no stale SQL remains available to future AI agents, and no active migration changes occur.
- Boundary integrity: examples and templates must not teach retired auth, direct database, client-fetch, or AI execution patterns.
- Audit durability: CI must catch future dead dependencies and exports without depending on globally installed tools.

## Final audit record

- Removed 27 confirmed dead source files, including retired root contexts,
  compatibility barrels, unreachable dashboards, unused map/tax helpers, and
  the obsolete CPA compatibility wrapper.
- Removed all 78 files under `db/legacy`; Git history is now the only retired
  SQL archive. `db/migrations` and the `supabase/migrations → ../db/migrations`
  symlink were unchanged.
- Removed five unused direct packages: `@supabase/auth-helpers-nextjs`,
  `claude`, `ioredis`, `world-atlas`, and `@eslint/eslintrc`. Declared the
  repository-owned `@next/env` and `vite` imports directly and pinned Knip and
  depcheck.
- Removed confirmed compatibility exports and duplicate aliases from the org,
  role, Supabase, browser-client, and tax-schema surfaces. The remaining Knip
  export/type report is classified as deliberate domain-library API, generated
  database surface, tests, or worker/public composition; CI blocks objective
  dead files/dependencies/unresolved imports/duplicates without privatizing
  those libraries based only on current importer count.
- Configured entry points cover Next/Playwright/Vitest/Tailwind configs,
  repository scripts, Supabase functions, and compile-only type contracts.
- Narrow analyzer exceptions cover Tailwind/PostCSS configuration loading and
  the `tsconfig-paths` command-line loader. Placeholder templates are excluded
  from generic parsing and enforced by a dedicated source contract.
- Rewrote module templates and current agent/docs guidance around schema
  classification, org-scoped guards, tenant-scoped repositories, shared browser
  transport, scoped AI capabilities, durable `ai_turns`/`ai_messages`, and
  request-idempotent assistant execution.

## Final verification

- `npm run verify:hygiene`: pass (Knip and depcheck clean for enforced issue classes)
- `npm run verify:types`: pass
- `npm run verify:lint`: pass at the ratcheted 446-warning ceiling (0 errors)
- `npm run verify:unit`: 231 files passed, 2,582 tests passed, 6 intentionally skipped
- `npm run verify:build`: pass; existing Supabase Edge-runtime and lint warnings remain non-blocking
- `npm run verify:migrations`: pass; 54 migrations, 135 public tables, behavior assertions, and generated-type drift check
- Focused agent/Builder/schema/client/template/AI boundary contracts: pass
- `npm run walkthrough:smoke`: 9 Playwright smoke tests passed

During walkthrough preparation, the local Supabase CLI returned a transient 502
while restarting containers after applying migrations. The stack passed the
doctor immediately afterward; direct local seeding succeeded, and the smoke
suite passed. This did not affect the dedicated clean migration verification.
