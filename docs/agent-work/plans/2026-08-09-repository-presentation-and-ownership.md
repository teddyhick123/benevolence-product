# Repository Presentation and Ownership Plan

**Date:** 2026-08-09  
**Status:** Phases 0–8 complete; Phase 9 ready  
**Scope:** Repository structure, ownership, documentation, tests, local artifacts,
and behavior-preserving boundary consolidation  
**Backlog:** Repository presentation initiative; add any unfinished work to
`docs/agent-work/BACKLOG.md` after that file is established in Phase 8

## Objective

Make `benevolence-product` immediately understandable to a new developer or AI
coding agent without weakening tenant isolation, schema authority, durable AI
semantics, route compatibility, or verification coverage.

The finished repository should answer these questions in under a minute:

1. Where does product UI live?
2. Where does domain logic live?
3. Where may database access occur?
4. Which database files are authoritative?
5. Where are unit, contract, integration, and walkthrough tests?
6. Where does current work come from, and where do agent plans live?
7. Which commands establish that the repository is healthy?

## Execution Rules

- Execute one phase at a time. Finish its verification before starting the next.
- Treat each phase as an independently reviewable change set. Suggested commit
  messages are included, but do not commit unless the user has authorized it.
- Preserve the working tree at the beginning of every phase. Do not overwrite
  unrelated edits or combine product work with presentation work.
- Use `rg` to prove every old import/path has been removed before deleting an
  alias or directory.
- Do not change `db/migrations` in this initiative. If a task appears to require
  storage, stop and apply the Schema Change Decision Protocol separately.
- Preserve URLs until a redirect or shared-wrapper replacement has focused
  coverage. Do not silently remove a product route.
- Keep archived documents as historical evidence. Update current links; do not
  rewrite archived prose solely to make old commands look current.
- After moving files, use normal imports to prove ownership. Do not add barrel
  files whose only purpose is hiding unclear structure.

## Verified Starting State

The ownership audit on 2026-08-09 established:

- `components/` has no loose root files and is already grouped by product domain.
- Major `lib/` domains (`ai`, `builder`, `import`, `tasks`, `tax`, `grants`, and
  `notifications`) have clear homes.
- `app/api/` contains 252 route handlers. Its directory structure is the URL
  contract and must not be reorganized as if it were a generic source tree.
- `lib/api/repositories/` contains 44 consistently named repository modules.
- `lib/__tests__/` contains 35 cross-repository contract/auth/schema tests that
  belong in `tests/integration/`, plus local unit tests that should be colocated.
- Root `__tests__/` contains one historical invitation-schema test.
- `lib/supabase.ts` declares itself a compatibility surface but has about 80
  importers, including 30 route handlers.
- Sixteen client pages/components still import `lib/supabase-browser` directly;
  authentication pages are legitimate exceptions, domain data components are not.
- Settings have three overlapping route families: `/settings/**`,
  `/dashboard/settings/**`, and `/org/[orgId]/settings/**`.
- Donor experiences have two separate implementations under
  `/dashboard/donors/**` and `/org/[orgId]/donors/**`.
- The initial cleanup already removed ignored build output, removed six obsolete
  SQL scripts/backups, added `clean:local`, and moved agent records from
  `docs/superpowers/` to `docs/agent-work/`. Those changes are currently part of
  the working tree and must be checkpointed before broader moves.

## Target Repository Map

```text
app/                         Next.js routes and composition roots
components/                  UI grouped by product domain
lib/
  ai/                        AI gateway, assistant, tools, actions
  api/                       access, transport, scoped repositories, clients
  onboarding/                onboarding conversation and provisioning logic
  organizations/             org roles, capabilities, context, active-org state
  <domain>/                  grants, tax, tasks, holdings, import, etc.
  database-client.ts         canonical typed database client contract
  database.types.ts          generated database types
db/
  migrations/                sole schema canon
  demo/                      bounded demo-only SQL/data
  seeds/                     bounded repeatable seed data
docs/
  README.md                  documentation authority and navigation
  product/                   vision, market context, active roadmaps
  engineering/               current implementation architecture
  guides/                    setup, demos, provisioning, migration, user guide
  agent-work/                current backlog plus dated plans/specs
  walkthroughs/              manual/simulated test missions
  archive/                   completed audits, old plans, historical proposals
scripts/
  verify/                    deterministic verification utilities
  walkthrough/               local walkthrough harness
tests/
  integration/               cross-module, route, schema, and boundary contracts
  fixtures/                  reusable non-secret test/import fixtures
  helpers/                   shared test utilities
  walkthrough/               browser journeys
templates/                   tested module template
public/                      shipped static assets
supabase/functions/          deployable edge functions only
```

## Phase 0 — Checkpoint the Existing Cleanup

**Goal:** Establish a clean review boundary before moving application code.

### Tasks

1. Review every current deletion and move with `git status`, `git diff --stat`,
   and `git diff --check`.
2. Confirm all 39 former `docs/superpowers/{plans,specs}` records exist under
   `docs/agent-work/{plans,specs}` and that `docs/superpowers` no longer exists.
3. Confirm `db/scripts/` contains only `demo_data.sql`, and that the file states
   that it is local demo data rather than schema authority.
4. Run:

   ```bash
   node --check scripts/clean-local.mjs
   npx vitest run lib/__tests__/phase6-integration-contract.test.ts
   npm run verify:hygiene
   git diff --check
   ```

5. If commits are authorized, create the checkpoint:
   `chore: clarify repository structure and agent work records`.

### Exit Criteria

- The cleanup is independently reviewable.
- No agent plan/spec was lost in the relocation.
- No active migration or product code changed.

### Completion Record — 2026-08-09

- Verified all 39 original plans/specs relocated exactly to `docs/agent-work/`.
- Confirmed no live references to the retired `docs/superpowers/` path remain.
- Confirmed `db/scripts/` contains only explicitly labeled `demo_data.sql`.
- Passed `node --check scripts/clean-local.mjs`, the focused Phase 6 contract
  suite (5 tests), `npm run verify:hygiene`, and `git diff --check`.
- Left the cleanup unstaged and uncommitted pending explicit commit authorization.

## Phase 1 — Make Local Cleanup Complete and Enforceable

**Goal:** Ensure generated/local files cannot make the repository look dirty.

### Tasks

1. Extend `scripts/clean-local.mjs` to remove `.DS_Store` recursively while
   skipping `.git` and `node_modules`. Keep the existing explicit allowlist for
   generated directories; do not introduce a broad arbitrary-directory delete.
2. Remove currently ignored nested metadata such as `app/.DS_Store`,
   `app/admin/.DS_Store`, `app/api/.DS_Store`, `lib/.DS_Store`, and
   `lib/tasks/.DS_Store`.
3. Remove tracked `supabase/.branches/_current_branch` and ignore
   `supabase/.branches/` now. It is local CLI state and must not be exempted
   from the layout gate.
4. Move the lone root invitation-schema unit test to
   `lib/schemas/invitations.test.ts` now. This removes the only current
   root-test violation before the layout guard is introduced; the broader test
   ownership consolidation remains Phase 2 work.
5. Add `scripts/verify/repository-layout.mjs` using `git ls-files` as its input.
   It must fail on:

   - tracked `.DS_Store` or `*.bak` files;
   - tracked `.next`, reports, tool output, or Supabase local-state paths;
   - a root `__tests__/` directory;
   - the retired `docs/superpowers/` path;
   - SQL outside `db/migrations`, `db/demo`, `db/seeds`, `db/scripts`,
     `scripts/verify`, or `templates/module`;
   - unexpected loose files under `lib/` after Phase 3 establishes its allowlist.

6. Add `verify:layout` and make `verify:hygiene` run it before Knip/Depcheck.
7. Document the exact cleanup and layout guarantees in `docs/HYGIENE.md`.

### Verification

```bash
npm run clean:local
npm run verify:layout
npm run verify:hygiene
git diff --check
```

### Suggested Commit

`chore: enforce repository layout and local artifact hygiene`

### Completion Record — 2026-08-09

- Added `verify:layout` and made it part of `verify:hygiene`.
- Removed ignored Graphify/tool output and twelve nested `.DS_Store` files using
  the expanded local-cleanup command.
- Removed the tracked local Supabase branch pointer and ignored
  `supabase/.branches/`.
- Moved the root invitation-schema test to `lib/schemas/invitations.test.ts` so
  the new root-test rule has no exception.
- Passed the invitation-schema suite (5 tests), `verify:layout`,
  `verify:hygiene`, script syntax checks, and `git diff --check`.
- Left the working tree unstaged and uncommitted pending explicit authorization.

## Phase 2 — Establish One Test Ownership Model

**Goal:** Make test location communicate test responsibility.

### Ownership Rules

- Unit tests live beside the production module they exercise.
- Repository tests may remain under `lib/api/__tests__/` because that directory
  belongs to the API/repository boundary.
- Route, schema, authorization, documentation, and cross-domain contracts live
  under `tests/integration/`.
- Walkthrough/browser tests remain under `tests/walkthrough/`.
- Shared mocks and fixtures remain under `tests/helpers/` and `tests/fixtures/`.

### Tasks

1. Move the 35 cross-repository files identified by the audit from
   `lib/__tests__/` to `tests/integration/`:

   ```text
   admin-routes.auth.test.ts
   admin-upload-schema-contract.test.ts
   agent-docs-contract.test.ts
   ai-actions-security-contract.test.ts
   ai-chat-org-tracking.test.ts
   ai-chat-security-contract.test.ts
   analytics-routes.auth.test.ts
   api-auth-boundary.contract.test.ts
   brand-runtime-contract.test.ts
   configurable-automations-contract.test.ts
   custom-fields-contract.test.ts
   grant-lifecycle-contract.test.ts
   holdings-routes.auth.test.ts
   import-worker-boundary.test.ts
   misc-routes.auth.test.ts
   notification-contract.test.ts
   onboarding-first-experience-contract.test.ts
   org-ai-context-contract.test.ts
   org-routes.auth.test.ts
   phase6-integration-contract.test.ts
   portfolio-assistant-compliance-columns.test.ts
   portfolio-assistant-donor-columns.test.ts
   portfolio-assistant-schema-contract.test.ts
   portfolio-auth.contract.test.ts
   recommendation-routes.auth.test.ts
   schema-privileges-contract.test.ts
   task-automation-contract.test.ts
   task-workflow-schema-contract.test.ts
   tax-ai-contract.test.ts
   tax-export-contract.test.ts
   tax-holding-import.test.ts
   tax-routes.auth.test.ts
   tax-schema-contract.test.ts
   view-config-contract.test.ts
   viz-routes.auth.test.ts
   ```

2. Before moving, assert that none of those basenames collide with files already
   in `tests/integration/`.
3. Move `lib/__tests__/database-client-types.contract.ts` to
   `tests/contracts/database-client-types.contract.ts` and update `knip.jsonc`.
   Keep it compile-only; do not rename it to `*.test.ts` unless it contains a
   runnable Vitest suite.
4. Colocate the remaining local tests with their owners. Use the Phase 3 target
   paths for files whose source is moving there. At minimum:

   - grant milestones → `lib/grants/milestones.test.ts`;
   - payout calculation → `lib/compliance/payout-calculator.test.ts` or merge
     into the existing payout-calculator suite;
   - generated-document repository → `lib/api/__tests__/`;
   - roles, org context, capabilities, view config → `lib/organizations/`;
   - Supabase browser tests → beside the final browser-auth client;
   - tax export → the owning `lib/tax/` or `lib/pdf/` module after confirming
     which production export it exercises.

5. The root `__tests__/invitations.test.ts` prerequisite was moved to
   `lib/schemas/invitations.test.ts` in Phase 1. Confirm the root `__tests__/`
   directory remains absent.
6. Update active documentation and Builder check-matrix tests that mention moved
   paths. Do not rewrite archived implementation plans.
7. Ensure the Builder still treats all `tests/integration/*.test.ts` files as its
   cross-module contract suite; measure the runtime increase and record it if
   moving 35 files materially changes targeted verification time.

### Verification

```bash
npx vitest run tests/integration
npx vitest run lib/api lib/grants lib/compliance lib/schemas
npm run verify:types
npm run verify:unit
npm run verify:hygiene
```

### Exit Criteria

- Root `__tests__/` and `lib/__tests__/` no longer exist.
- Every test location communicates unit, repository, integration, or walkthrough ownership.
- Builder verification still selects the intended suites.

### Suggested Commit

`test: consolidate unit and integration test ownership`

### Completion Record — 2026-08-09

- Moved all 35 cross-repository contract, route, schema, authorization, and
  documentation tests from `lib/__tests__/` into `tests/integration/` without
  basename collisions.
- Moved the compile-only database client contract into `tests/contracts/` and
  updated Knip's entry point.
- Colocated the remaining source-specific tests with their present owners;
  organization and browser-client tests will move again with their production
  modules in Phase 3 and Phase 7 respectively.
- Updated active test documentation and corrected three moved-test imports to
  stable `@/lib/...` aliases. Both retired test directories are now absent.
- Passed the focused ownership suite (135 files, 1,689 tests; 6 existing live
  checks skipped), Builder's check-matrix suite (29 tests), `verify:types`,
  `verify:unit`, `verify:hygiene`, and `git diff --check`. The focused suite
  completed in 9.75 seconds, with no material verification slowdown observed.
- Left the working tree unstaged and uncommitted pending explicit authorization.

## Phase 3 — Move Unambiguous Root Libraries to Domain Owners

**Goal:** Reserve root `lib/` for the small canonical infrastructure surface.

### Target Moves

| Current | Target |
|---|---|
| `lib/document-parser.ts` | `lib/import/document-parser.ts` |
| `lib/onboarding-assistant.ts` | `lib/onboarding/assistant.ts` |
| `lib/onboarding-provision-config.ts` | `lib/onboarding/provision-config.ts` |
| `lib/org-ai-context.ts` | `lib/organizations/ai-context.ts` |
| `lib/org-capabilities.ts` | `lib/organizations/capabilities.ts` |
| `lib/org-cookie.ts` | `lib/organizations/active-org.ts` |
| `lib/roles.ts` | `lib/organizations/roles.ts` |
| `lib/view-config.ts` | `lib/organizations/view-config.ts` |
| `lib/ai-action-executor.ts` | `lib/ai/assistant/actions/executor.ts` |
| `lib/rate-limit.ts` | `lib/api/rate-limit.ts` |
| `lib/rate-limit-response.ts` | `lib/api/rate-limit-response.ts` |
| `lib/validation.ts` | `lib/api/validation.ts` |

### Root `lib/` Allowlist After This Phase

```text
lib/database-client.ts
lib/database.types.ts
lib/supabase.ts              # temporary compatibility surface; removed in Phase 7
lib/supabase-browser.ts      # temporary auth client; replaced in Phase 7
```

### Tasks

1. Create `lib/onboarding/` and `lib/organizations/` as explicit domain homes.
2. Move one domain family at a time: import, onboarding, organizations, AI
   actions, then API infrastructure.
3. After each family, update all active imports and run `rg` against every old
   alias. There must be zero active importers before deleting the old file.
4. Move/adjust the local tests established in Phase 2 at the same time as their
   production modules.
5. Update `AGENTS.md`, `CLAUDE.md`, current architecture docs, templates, and
   active contract tests. Preserve the marked schema protocol in `AGENTS.md` and
   `CLAUDE.md` exactly.
6. Do not add compatibility re-export shims for these moves; the repository is
   prerelease and all active imports can move atomically.

### Verification Per Family

```bash
rg -n '@/lib/<old-path>' app components lib scripts tests
npx vitest related <moved-source-files> --run
npm run verify:types
npm run verify:hygiene
```

### Suggested Commits

- `refactor: group onboarding and organization libraries`
- `refactor: move AI actions and import parsing to domain owners`
- `refactor: group shared API infrastructure`

### Completion Record — 2026-08-09

- Moved the twelve planned root-library modules into explicit import,
  onboarding, organization, AI-action, and API-infrastructure domains; no
  compatibility re-exports were introduced.
- Moved organization tests beside their owners and browser-client tests into
  the API test boundary, leaving only the four documented temporary root
  infrastructure modules.
- Updated all active imports, mocks, structural tests, Builder path policy, and
  active documentation. Historical records retain their original paths.
- Tightened the layout guard to enforce the four-file root `lib/` allowlist.
- The executor move exposed one existing invalid `holding_locations.as_of`
  insert. The owning migration and generated type confirm that field does not
  exist, so the write was removed without changing the schema.
- Passed 84 related test files (731 tests), the focused schema contract,
  `verify:types`, the full unit suite, `verify:hygiene`, and `git diff --check`.
- Left the working tree unstaged and uncommitted pending explicit authorization.

## Phase 4 — Explain Repository and API Ownership Without Import Churn

**Goal:** Make dense but legitimate directories easy to navigate.

### Tasks

1. Add `lib/README.md` with the domain map and the rule that UI cannot bypass
   browser transport/hooks or tenant-scoped repositories.
2. Add `lib/api/README.md` explaining access guards, response helpers, browser
   transport, server/auth clients, and repository construction order.
3. Add `lib/api/repositories/README.md` grouping the 44 flat repository modules
   by domain (AI, Builder, imports, organizations/membership, finance/tax,
   grants/workflows/tasks, notifications, and public/token flows).
4. Keep repository implementation files flat for this initiative. Nested
   repository folders would change dozens of stable imports without removing an
   actual ambiguity once the index exists.
5. Add the repository index to the root README tour and `AGENTS.md` quick reference.

### Verification

```bash
npm run verify:hygiene
npx vitest run tests/integration/agent-docs-contract.test.ts
```

### Suggested Commit

`docs: map library and repository ownership`

### Completion Record — 2026-08-09

- Added `lib/README.md` with the library domain map, strict browser-data and
  authority flow, placement rules, and the intentionally small root surface.
- Added `lib/api/README.md` with route guard order, client/server transport
  ownership, response conventions, and scoped repository construction rules.
- Added `lib/api/repositories/README.md`, indexing all 44 intentionally flat
  repositories by responsibility without changing stable imports.
- Linked the new guides from the root repository tour and the AGENTS/CLAUDE
  quick references.
- Passed `tests/integration/agent-docs-contract.test.ts`, `verify:hygiene`, and
  `git diff --check`.
- Left the working tree unstaged and uncommitted pending explicit authorization.

## Phase 5 — Resolve Duplicate Product Route Ownership

**Goal:** Ensure one implementation owns each product concept while preserving URLs.

### Decision Gate

Before editing, confirm this recommended route model with the user:

- `/dashboard/**` is the primary active-workspace shell.
- `/settings/**` is the primary organization-settings shell.
- `/admin/**` is platform administration.
- `/builder-studio` is organization configuration and implementation planning.
- `/org/[orgId]/**` remains the explicit-tenant deep-link shell where it adds
  meaningful scope, but it must not own a second implementation of a screen.

If the product instead chooses explicit `/org/[orgId]/**` URLs as canonical,
reverse the redirects/adapters below while preserving the single-implementation rule.

**Decision — 2026-08-09:** Confirmed with the user. `/dashboard/**` is the
primary active-workspace shell, `/settings/**` is canonical for organization
settings, and `/org/[orgId]/**` remains an explicit-tenant/deep-link shell that
must not maintain a second screen implementation.

### Settings Tasks

1. Inventory incoming links and callbacks for all three settings route families.
2. Make `/settings/**` the implementation owner.
3. Convert `/dashboard/settings/ai` and `/dashboard/settings/integrations` into
   redirects or thin wrappers to `/settings/ai` and `/settings/integrations`.
4. Convert `/org/[orgId]/settings/modules` and `workflow` into the existing
   Builder Studio redirects while preserving `orgId`.
5. Decide whether `/org/[orgId]/settings` needs an explicit-org adapter. If it
   does, render the same settings components/repositories as `/settings`; do not
   preserve its separate direct-Supabase implementation.
6. Update the Header, QuickBooks callback, dashboard task links, and tests to use
   canonical settings URLs.

### Donor Tasks

1. Extract one donor list/dashboard implementation under
   `components/donors/screens/` with explicit `orgId` and navigation-base inputs.
2. Make both route families thin composition wrappers around the shared screen
   until product telemetry/user decisions allow one family to become redirects.
3. Consolidate the dashboard/org create and detail screens behind shared
   components and shared domain hooks.
4. Preserve deep links from contributions, receipts, and acknowledgments.
5. Add route tests for active-org switching, direct explicit-org links, stale
   tabs, and unauthorized org IDs.

### Verification

```bash
npx vitest run tests/integration/org-routes.auth.test.ts
npx vitest run tests/integration/client-data-contract.test.ts
npm run verify:types
npm run verify:unit
npm run verify:build
```

Run the documented donor and settings walkthrough missions after the baseline reset.

### Suggested Commits

- `refactor: establish canonical settings ownership`
- `refactor: share donor screens across route shells`

### Completion Record — 2026-08-09

- Confirmed the canonical route model with the user before changing URLs.
- Made `/settings/ai` and `/settings/integrations` the implementation owners;
  their dashboard predecessors are now thin redirects. The canonical
  integrations screen retains the full QuickBooks workflow and guarded access.
- Converted the explicit organization settings page into an adapter to the
  canonical organization settings screen, removing the duplicate direct
  Supabase implementation. Existing module and workflow deep links continue to
  redirect to Builder Studio with `orgId` preserved.
- Updated Header navigation, QuickBooks OAuth callback targets, dashboard task
  links, and the QuickBooks URL contract to use canonical settings URLs.
- Made dashboard donors the one donor implementation. Explicit-org donor list,
  create, and detail URLs remain valid redirects that retain organization scope
  in the canonical URL's `org` parameter. Removed the superseded org-only
  donor screens and their direct browser Supabase reads.
- Added a route-ownership contract to prevent the retired URL families from
  regaining their own implementations.
- Passed `verify:types`, the focused route/client contracts, the full unit
  suite (245 files, 2,697 tests; 6 existing live checks skipped),
  `verify:hygiene`, `git diff --check`, and the production build. The build
  retains pre-existing lint and Edge Runtime warnings but completed
  successfully.
- Left the working tree unstaged and uncommitted pending explicit authorization.

## Phase 6 — Normalize Client-Side Domain Data Ownership

**Goal:** Remove direct database ownership from domain UI while retaining browser
Supabase only for authentication/session behavior that requires it.

### Legitimate Browser-Auth Callers

Review and retain through a clearly named auth client where appropriate:

```text
app/login/page.tsx
app/forgot-password/page.tsx
app/reset-password/page.tsx
app/join/page.tsx
```

`app/org/layout.tsx` must be reviewed separately; prefer a server guard if it
does not require a browser auth lifecycle.

### Domain Components to Migrate

Move the remaining direct Supabase domain reads/writes to guarded APIs,
repositories, `lib/api/client.ts`, and domain hooks:

```text
components/acknowledgments/screens/AcknowledgmentsPage.tsx
components/contributions/screens/ContributionsPage.tsx
components/donors/ContributionForm.tsx
components/grants/CommunicationLog.tsx
components/grants/PaymentSchedule.tsx
components/grants/WorkflowManager.tsx
app/org/[orgId]/receipts/page.tsx
```

### Tasks

1. For each domain, reuse existing APIs/repositories before introducing a new route.
2. Put interactive GET ownership in that domain's `hooks.ts`; do not create
   component-local SWR fetchers or a second cache.
3. Use `requestJson`, `uploadJson`, `requestDownload`, or `requestStream` as
   appropriate. Do not preserve raw `fetch` wrappers.
4. Keep route identifiers as routing inputs only; every server route must prove
   tenant/portfolio authority independently.
5. Add or extend `tests/integration/client-data-contract.test.ts` so these direct
   browser database imports cannot return.

### Verification Per Domain

```bash
npx vitest related <changed-domain-files> --run
npx vitest run tests/integration/client-data-contract.test.ts
npm run verify:types
npm run verify:lint
```

### Suggested Commit Pattern

`refactor(<domain>): move browser data ownership to hooks and APIs`

### Completion Record — 2026-08-10

- Replaced the direct browser Supabase reads and writes in acknowledgments,
  contributions, receipts, grant communications, payments, workflows, and the
  legacy organization shell with guarded organization APIs. Interactive reads
  now live in domain hooks backed by the shared client cache; mutations
  revalidate their affected resources.
- Added scoped grant-operation endpoints and repository methods for the grant
  holdings, communications, and payment views. Payment sequence numbers are now
  determined server-side after the grant scope is proven.
- Expanded the contribution list's donor projection with the receipt-preview
  address fields so the migrated screen retains its existing receipt behavior.
- Strengthened the browser-data contract to allow `supabase-browser` only in
  the four dedicated auth/session pages; no domain UI imports it now.
- Passed `verify:types`, the browser-data contract, `verify:hygiene`, the full
  unit suite, and `git diff --check`. Left the working tree unstaged and
  uncommitted pending explicit authorization.

## Phase 7 — Retire Server Database Compatibility Surfaces

**Goal:** Remove `lib/supabase.ts` only after every caller uses the canonical
guard/repository/client boundary.

### Migration Batches

1. **Server pages:** dashboard, profile, settings, org, Builder Studio, and admin
   pages. Use server clients for session reads and scoped repositories after access.
2. **Portfolio/holding/report routes:** migrate the 30 compatibility-importing
   route handlers in small domain batches with their authorization contracts.
3. **Charity routes/services:** distinguish public RLS reads from app-admin
   enrichment/import operations.
4. **Workers and automations:** elevated clients stay behind job guards and
   tenant-scoped repository/capability constructors.
5. **Tests:** replace mocks of `@/lib/supabase` with the actual boundary being tested.

### Removal Rules

- `createSupabaseServerClient`, `supabasePublic`, and `createAdminClient` aliases
  may be removed only after `rg` shows zero active importers.
- Elevated client construction remains internal to `lib/api/admin-client.ts`.
- Product routes must not construct elevated clients directly.
- Replace `lib/supabase-browser.ts` with a narrowly named browser auth client
  under `lib/api/` only after Phase 6 leaves it with auth/session callers alone.
- Keep `lib/database-client.ts` and `lib/database.types.ts` at their canonical
  documented paths.

### Verification Per Batch

```bash
rg -n "@/lib/supabase(['\"]|$)|@/lib/supabase-browser(['\"]|$)" app components lib scripts tests
npx vitest run tests/integration
npm run verify:types
npm run verify:unit
```

Finish with the full build and, for any touched database behavior, the applicable
local integration/walkthrough journey. This phase changes no migration files.

### Suggested Commit Pattern

`refactor(<domain>): retire legacy Supabase access`

### Completion Record — 2026-08-11

- Replaced every production import of `lib/supabase.ts` with the explicit
  session client (`lib/api/server-client.ts`) or elevated client
  (`lib/api/admin-client.ts`) appropriate to its execution boundary.
- Preserved the existing RLS and access checks in portfolio, holdings, charity,
  reporting, admin-page, worker, and service flows; no schema or migration
  changed.
- Rebound affected test mocks to their real client boundaries and removed the
  compatibility module after verifying there were no remaining legacy imports.
- Passed the full unit suite, `verify:types`, `verify:hygiene`, `git diff
  --check`, and the zero-results legacy-import audit. Left the working tree
  unstaged and uncommitted pending explicit authorization.

## Phase 8 — Consolidate Root Scripts, Fixtures, and Documentation

**Goal:** Make the repository root and `docs/` read like a curated product.

### Scripts and Fixtures

1. Move `test-rate-limits.sh` to `scripts/verify/rate-limits.sh`, update its
   self-documentation, and expose it as `verify:rate-limits` if it is still useful.
2. Move the unreferenced `db/demo_blackbaud_export.csv` to
   `tests/fixtures/imports/blackbaud-demo.csv` if it is a maintained import
   fixture. Otherwise delete it after confirming Git history is sufficient.
3. Verify `supabase/.branches/` remains ignored; it is local CLI state, not
   product source.
4. Keep standard framework configuration files at the root. Do not create a
   generic `config/` directory for Next, TypeScript, Tailwind, Playwright, or Vitest.

### Documentation Target

```text
docs/README.md
docs/product/
  PLATFORM_VISION.md
  CONFIGURABILITY_ROADMAP.md
  SELF_SERVICE_WORKBENCH_ROADMAP.md
  PHILANTHROPY_TECH_MARKET_MAP.md
docs/engineering/
  ARCHITECTURE.md
  DATABASE_ARCHITECTURE.md
  MODULES.md
  CONFIGURABILITY_ARCHITECTURE.md
  BUILDER_OPERATIONS.md
  AI_IMPORTER_BLUEPRINT.md
  HYGIENE.md
docs/guides/
  GETTING_STARTED.md
  PROVISIONING.md
  DEMO_ENVIRONMENTS.md
  MIGRATION_GUIDE.md
  USER_GUIDE.md
docs/agent-work/
  README.md
  BACKLOG.md
  plans/
  specs/
docs/walkthroughs/
docs/archive/
  audits/
  architecture/
  plans/
  module-reviews/
```

### Documentation Tasks

1. Move `docs/module-reviews/FULL-BACKLOG.md` to
   `docs/agent-work/BACKLOG.md`. This becomes the obvious current queue for
   both humans and coding agents.
2. Verify that all still-open items from these completed audits are present in
   the backlog, then archive them under `docs/archive/audits/`:

   - `BUILDER_REVIEW_ORCHESTRATION_AUDIT.md`;
   - `ROLE_PERMISSION_AUDIT.md`;
   - `module-reviews/2026-06-27-reliability-audit.md`.

3. Move the historical `docs/architecture/MODULAR_AI_PLATFORM.md` to
   `docs/archive/architecture/`.
4. Move current product, engineering, and guide documents into the target
   folders above without renaming their filenames.
5. Update root README, `docs/README.md`, `AGENTS.md`, `CLAUDE.md`, current docs,
   templates, and active tests. Do not update archived prose merely because it
   records an old path.
6. Add a lightweight active-document link check that excludes `docs/archive/`
   and dated agent-work records but validates the root README, docs map, agent
   README, backlog, current guides, and current architecture documents.
7. Update the docs authority order:

   1. `db/migrations` for schema;
   2. `AGENTS.md` for implementation rules;
   3. `docs/agent-work/BACKLOG.md` for actionable work;
   4. `docs/engineering` and `docs/guides` for current explanation;
   5. dated agent records and archive material for historical context.

### Verification

```bash
rg -n "docs/(superpowers|module-reviews/FULL-BACKLOG|architecture/MODULAR_AI_PLATFORM)" \
  README.md AGENTS.md CLAUDE.md docs lib app components tests templates
npm run verify:layout
npm run verify:hygiene
npx vitest run tests/integration/agent-docs-contract.test.ts
git diff --check
```

### Suggested Commits

- `chore: organize scripts and import fixtures`
- `docs: establish product engineering and agent documentation map`

### Completion Record — 2026-08-11

- Moved the local rate-limit check under `scripts/verify/` and exposed it as
  `npm run verify:rate-limits`; its header now explains the local-server
  prerequisite.
- Moved the unreferenced Blackbaud sample into the maintained import-fixture
  boundary at `tests/fixtures/imports/blackbaud-demo.csv`.
- Established `docs/agent-work/BACKLOG.md` as the single active backlog;
  archived completed audit records and the historical modular-AI proposal.
- Organized current documentation into `docs/product`, `docs/engineering`, and
  `docs/guides`, then updated active references in the root README, agent
  guides, tests, and documentation map.
- Added a current-document Markdown-link contract that intentionally excludes
  archives and dated agent records. Passed its focused suites, the full unit
  suite (245 files, 2,699 tests; 6 existing skips), `verify:types`,
  `verify:hygiene`, and `git diff --check`. Left the working tree unstaged and
  uncommitted pending explicit authorization.

## Phase 9 — Final Presentation and Regression Gate

**Goal:** Prove the repository is clean, navigable, and behaviorally unchanged.

### Tasks

1. Update the root README with a 60-second tour, setup link, documentation map,
   current backlog link, and the smallest useful command set.
2. Confirm every top-level directory appears in the tour or is standard tooling.
3. Run `npm run clean:local`, then show a top-level disk-usage/tree snapshot to
   confirm generated output is gone.
4. Search for retired paths and compatibility names:

   ```bash
   rg -n "docs/superpowers|lib/supabase|lib/supabase-browser|^__tests__/" \
     README.md AGENTS.md CLAUDE.md app components lib scripts tests templates docs
   ```

   Any remaining occurrence must be an explicitly labeled historical reference
   under `docs/archive` or a deliberate compatibility note with an owner.
5. Run the full gate:

   ```bash
   npm run verify:layout
   npm run verify:hygiene
   npm run verify:types
   npm run verify:lint
   npm run verify:unit
   npm run verify:build
   ```

6. Run `npm run verify:migrations` only if a migration or generated database type
   changed unexpectedly; the expected migration diff for this initiative is zero.
7. Run `npm run walkthrough:doctor`, reset the documented local baseline, and run
   the donor/settings journeys affected by Phase 5 plus `npm run walkthrough:smoke`.
8. Review `git diff --stat`, `git diff --check`, and `git status --short` for a
   final handoff. Confirm no source, plan, fixture, or migration disappeared by accident.

### Final Exit Criteria

- The root contains only standard framework configuration and documented entry points.
- All current documentation is reachable from the root README or docs map.
- `docs/agent-work/BACKLOG.md` is the single actionable queue.
- Agent plans/specs have a durable, clearly secondary home.
- Root `__tests__`, `lib/__tests__`, `docs/superpowers`, tracked local state,
  backup SQL, and generated artifacts are absent.
- Root `lib/` contains only the generated/canonical database type boundary.
- Domain UI does not query Supabase directly.
- `lib/supabase.ts` compatibility aliases are gone.
- Duplicate donor/settings routes share one implementation or redirect to the
  approved canonical surface.
- Layout, hygiene, type, lint, unit, build, and affected walkthrough checks pass.

### Phase 9 Closure Record — 2026-08-12 (runtime walkthrough blocker recorded)

- The root README now gives a concise repository tour, setup/documentation/backlog
  links, and the smallest useful command set; the tour explicitly covers `public/`
  and local Supabase configuration alongside standard tooling.
- Renamed the auth-only browser client to
  `lib/api/browser-auth-client.ts`, updated its four auth consumers and boundary
  contracts, and removed the retired `lib/supabase-browser.ts` path.
- Confirmed clean layout and ownership boundaries with `clean:local`, the
  top-level snapshot, retired-path audit, `verify:layout` (1,247 tracked files),
  `verify:hygiene`, `verify:types`, `verify:lint` (431 pre-existing warnings,
  within the established warning budget), the full unit suite (245 files,
  2,699 tests; 6 existing skips), `git diff --check`, and a production build.
  The build needs ordinary Google Fonts network access and completed successfully
  once that access was available; it retains the existing Supabase Edge-runtime
  warnings.
- Reset the documented local Supabase baseline successfully from canonical
  migrations. The Playwright runner exposed an orphaned local-server problem, so
  its configuration now reuses a local server while CI remains isolated.
- Runtime walkthrough sign-in is not yet clean: after the reset, a browser with
  stale auth state remains on “Signing in…” and logs `Invalid Refresh Token:
  Refresh Token Not Found`. This is tracked as `WT-02` in the current backlog;
  donor/settings authenticated journeys are therefore deliberately not marked
  passed. No migration or generated database type changed in this initiative.

## Recommended Execution Sequence for Terra

Use one fresh task/turn per numbered phase, carrying forward this plan and the
latest verified Git status. Phases 0–4 and 8 are primarily mechanical ownership
work. Phase 5 requires the route decision gate. Phases 6–7 are architectural
refactors and should be executed domain by domain rather than as a bulk rewrite.

At the end of every phase, report:

- files moved, removed, and created;
- behavior intentionally preserved;
- commands run and their results;
- unresolved decisions or follow-up backlog items;
- the exact next phase that is safe to start.
