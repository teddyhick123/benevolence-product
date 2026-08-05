# Full Refactor — Umbrella Design

**Date:** 2026-07-26
**Status:** Approved (umbrella). Each phase gets its own just-in-time implementation plan.
**Owner:** teddyhick + Claude

## Goal

A clean, well-organized, efficient codebase with exactly one supported pattern per
concern — auth guards, Supabase clients, API responses, data fetching, tests —
without changing URLs or intended user-visible behavior. Exception: security bugs
discovered while refactoring are fixed in dedicated, explicitly called-out commits;
when a security fix requires an active-migration correction, it may change the
canonical prerelease schema. Non-security behavior quirks are logged to
`docs/superpowers/specs/2026-07-26-refactor-findings.md` instead of fixed.

## Verified baseline (2026-07-26)

- 243 API route files, 35,172 lines; 141 create Supabase clients inline; 119 touch
  the service-role client; only 68 use the shared auth helpers.
- Oversized files: `lib/ai/assistant/executor.ts` 3,367 · `lib/builder/tools.ts`
  2,765 · `app/dashboard/holdings/[holdingId]/page.tsx` 1,623 ·
  `lib/ai/assistant/tool-definitions.ts` 1,224 · `lib/onboarding-assistant.ts` 810.
- 7 AI files carry `@ts-nocheck`: `lib/onboarding-assistant.ts`,
  `lib/ai-action-executor.ts`, `lib/ai/assistant/{prompts,executor,portfolio-assistant,helpers,context}.ts`.
- Client data: 175 TSX files call `fetch` directly; 21 files use SWR. Hooks live in
  both `/hooks` (2 files) and `/lib/hooks` (4 files).
- Tests: 1,939 passing, 0 failing, 6 skipped. Units are colocated in `__tests__/`
  dirs; contract tests sit in `app/api/__tests__/`; Playwright journeys in
  `tests/walkthrough/`.
- Lint: 0 errors, 511 warnings. No CI gate runs types/lint/tests/build (only
  `walkthrough-smoke.yml` exists).
- `package-lock.json` exists locally but is gitignored (`.gitignore:7-9`).
- `db/legacy/` has 78 tracked files. `impact-viz-mvp/` contains only an empty
  `.next` cache. `.claude/worktrees/` holds ~48MB of stale, gitignored agent
  worktrees.

**Already shipped ahead of this spec:** commit `fbca6720` moved `app/middleware.ts`
to the project root. Next.js never activates middleware inside `app/`, so the auth
gate for `/dashboard`, `/admin`, `/settings`, `/welcome`, `/onboarding` had been
dead code (empty middleware manifest; only 7 of 44 protected pages self-check
auth). Verified post-move: the build emits `ƒ Middleware` with the expected
matchers.

## Target architecture

```
middleware.ts           Session gate + x-org-id auto-select (root — active)
app/                    Routing, request parsing, page composition ONLY
components/<domain>/    Domain UI;  components/ui/ = shared primitives
lib/api/                NEW: auth guards, response helpers, client factories
lib/<domain>/           Data access, services, calculations, types, hooks
lib/ai/assistant/       Thin dispatcher + per-module tool defs/executors
tests/integration/      Cross-module + API contract tests
tests/walkthrough/      Playwright journeys (unchanged)
*/__tests__/            Colocated unit tests (unchanged convention)
```

## Scope exclusion: Builder

`lib/builder/**` (including the 2,765-line `tools.ts`) is out of scope. Builder is
a separate bounded system with its own active roadmap (Increment 2, durable data
contract) and recent dedicated commits; refactoring it here would collide with
that work. It participates in this refactor only where shared infrastructure
(guards, CI, test conventions) applies to it like any other consumer.

## Phases

Order is deliberate: guardrails before risky change; the highest-stakes rollout
(auth) lands with reproducible builds and CI already in place.

### Phase 1 — Guardrails

1. Track `package-lock.json`: remove lockfile lines from `.gitignore`, commit the
   lockfile.
2. Add a CI workflow gating every PR update and push: `npm ci` → `verify:types` → lint with
   `--max-warnings=<floor>` → `vitest run` → `verify:build`. All scripts already
   exist in `package.json`.
3. Lint floor: none of the 511 warnings are ESLint-auto-fixable (verified
   2026-07-26: 344 `no-unused-vars`, 129 `no-console`, 33
   `react-hooks/exhaustive-deps`, 5 `@next/next/no-img-element` — none carry a
   fixer). Set the max-warnings floor at the current count and ratchet it down at
   each subsequent phase boundary as touched files are cleaned. No lint-rule
   changes, no bulk manual edits in this phase.
4. Test conventions: keep colocated `__tests__/` for units; move cross-cutting
   contract tests from `app/api/__tests__/` (26 files) to `tests/integration/`;
   extract shared Supabase/request mocks to `tests/helpers/`; silence
   expected-error logging in tests. The move must update
   `lib/builder/check-matrix.ts` (`SCHEMA_CONTRACT_SUITE`,
   `API_CONTRACT_SUITE_GLOB` hardcode `app/api/__tests__/` paths) and its tests
   in the same commit — this is the sanctioned shared-infrastructure touch on
   Builder, not a scope violation.
5. Create the findings file stub
   (`docs/superpowers/specs/2026-07-26-refactor-findings.md`) so behavior quirks
   have a landing place from the first commit.
6. Optional local cleanup: only after a unique-commit audit and explicit user
   approval, remove stale `.claude/worktrees/*` and the empty `impact-viz-mvp/`
   directory. Never delete an unmerged `worktree-agent-*` branch without an
   explicit preservation or deletion decision.

**Exit:** CI runs green on every PR update and push; test count ≥ baseline;
lockfile tracked.

### Phase 2 — API & auth standardization

Consolidate `lib/org-access.ts`, `lib/portfolio-auth.ts`, `lib/admin-auth.ts` into
`lib/api/` (do not add a fourth competing pattern):

- `requireAppAdmin()`, `requireOrgAccess(orgId, minRole)`,
  `requirePortfolioAccess(portfolioId, minRole)`, and `requireCpaToken(token)`
  return a typed access context or a typed 401/403 response. Contexts use a
  discriminated principal (`user`, `cpa_share`, `job`, `invitation`, `oauth`, or
  `public`) rather than assuming every caller has a user. Each route category
  has an explicit supported guard.
- Service-role access is provided through tenant-scoped repositories, not a
  generic client handed to routes. An org/portfolio context is mandatory at
  construction and each repository method applies or proves its tenant scope;
  tables without a direct `org_id` use a documented parent-scope helper. A CI
  check forbids direct `createAdminClient(`/`SUPABASE_SERVICE_ROLE` references
  in `app/api/**` outside `lib/api/`, and contract tests verify representative
  scope predicates for every route family.
- `jsonOk` / `jsonError` response helpers with standard cache headers; `no-store`
  is the default for authenticated data.
- Route ownership per CLAUDE.md: org mutations under `/api/org/[orgId]`, portfolio
  reads under `/api/portfolio/[id]`. URLs never change in this refactor: legacy
  endpoints become thin adapters over the canonical domain service until a
  separately approved URL migration.

Rollout is one route family at a time — tax → grants → donors/compliance →
imports/integrations → remainder. Each family is preceded by contract tests
capturing current status codes and response shapes so migration is provably
behavior-preserving. Tenant-scoping holes get fixed in dedicated commits per the
bug policy.
The repeated per-route cookie/client boilerplate collapses into the guards.

Known collision: the backlog already records portfolio membership/view RLS gaps
across 14+ routes and 13 views. Under the bug policy those are security bugs
fixed in dedicated commits, so families touching portfolio scoping (tax is first)
will carry real behavior-affecting fixes and should be budgeted accordingly —
Phase 2 is not purely behavior-preserving.

**Exit:** zero routes construct auth inline; contract tests cover every family;
service-role usage always tenant-scoped after a guard.

### Phase 3 — AI subsystem split

- Per-module tool definition files and `executors/<module>.ts`, composed through
  the module registry (continue the existing grants/tax extraction pattern).
  `executor.ts` becomes a dispatcher table.
- Phase 3 consumes, and must not weaken, the Phase 2 access boundary: API routes
  authorize the principal first, construct an org/portfolio/user-scoped
  repository from that typed access context, and pass only scoped capabilities
  into the assistant dispatcher and executors. Executors must not construct an
  elevated client, accept a generic service-role client, or perform unscoped
  table access. Elevated AI writes remain hidden behind tenant-scoped
  repositories under `lib/api/repositories/`.
- New invariant test: every registered tool has exactly one executor; every
  executor's tool is registered.
- Remove `@ts-nocheck` file-by-file (one commit each) by introducing typed tool
  arguments and DB row types.
- `lib/ai/portfolio-assistant.ts` remains the public entry point. Retire the
  `lib/claude-assistant.ts` shim and its contract test.
- Onboarding assistant and Builder remain separate bounded systems.

The just-in-time Phase 3 design discussion must also resolve AI message
persistence and idempotency. The current portfolio chat repository stores the
whole session history in one `ai_sessions.messages` JSON array using separate
read/replace writes; concurrent turns can overwrite each other, as recorded in
the 2026-08-05 findings entry. The discussion must cover:

- normalized, append-only message/turn rows versus an atomic JSON-append RPC,
  including ordering, history reads, retention, and migration of existing
  session data;
- a stable client-provided turn/request id, uniqueness constraints, and the
  behavior for completed, failed, and concurrently in-progress retries;
- persisting the user turn before model invocation, then durably recording the
  assistant result and its action/tool-call linkage before reporting completion;
- idempotency for tool side effects as well as message rows, so retrying one turn
  cannot repeat a grant mutation, widget save, or other executor action;
- identical durability semantics for streaming and non-streaming routes,
  including disconnects and failures after partial output; and
- repository contract and concurrency tests proving tenant scope, no lost
  messages, deterministic replay, and at-most-once committed side effects.

Preferred direction for discussion: normalized message/turn rows with database
uniqueness and transactional begin/complete operations, while keeping
`ai_sessions` as session metadata. The server should treat persisted history as
authoritative instead of trusting a caller-supplied transcript. Onboarding chat
has a related best-effort persistence finding (2026-08-03), but remains outside
this phase unless its bounded-system scope is explicitly expanded.

Implementing either persistence option is a reliability behavior change and
likely an active-migration change, not a security fix. The Phase 3 design review
must therefore explicitly approve an exception to the cross-phase migration and
behavior-preservation rules, or defer implementation while still designing the
repository interfaces so durable turns can be added without breaking the access
boundary.

**Exit:** no `@ts-nocheck` in `lib/`; no file in `lib/ai/` over ~500 lines;
dispatcher invariant test green. If durable turns are approved for Phase 3,
message concurrency/idempotency contract tests are also green and both chat
transports use the same scoped persistence service.

### Phase 4 — Thin pages

- Pilot 1: `app/dashboard/holdings/[holdingId]/page.tsx` (1,623 lines) → queries
  and types to `lib/holdings/`, sections to `components/holdings/detail/`, route
  file becomes composition (~150 lines). This establishes the recipe.
- Pilot 2: grants — all lifecycle mutations flow through `lib/grants/lifecycle.ts`
  services; org-vs-portfolio route boundary formalized.
- Apply the recipe to remaining oversized pages, worst-first.

**Exit:** no page file over ~300 lines; pilots' behavior verified against
walkthrough journeys.

### Phase 5 — Client data normalization

- One shared JSON fetcher (parsing, error shape, non-authoritative org context)
  + per-domain SWR hooks in `lib/<domain>/`. Pages prefer server-side initial
  load; interactive refresh goes through domain hooks. Uploads, downloads,
  streams, SSE, and binary responses use named transport helpers rather than
  being forced through the JSON fetcher.
- Convert the 175 ad-hoc `fetch` call sites per-domain, not big-bang.
- Consolidate generic hooks into `lib/hooks/`; domain hooks live in their owning
  `lib/<domain>/` folder. Remove the root `/hooks` directory.

**Exit:** every dashboard domain's interactive fetches go through its domain
hook; no raw `fetch` in components outside the shared fetcher (enforced by a CI
grep once the last domain converts); single hooks home.

### Phase 6 — Final hygiene

- Dead-dependency and dead-export audit (knip/depcheck); remove compatibility
  exports.
- Decide `db/legacy/` (recommendation: delete — git history preserves it,
  `db/migrations` is declared canon, stale SQL is an active hazard for AI-assisted
  work). Keep `db/migrations` and the `supabase/migrations` symlink untouched.
- Update `docs/ARCHITECTURE.md` and related docs to describe the now-real
  boundaries.

**Exit:** knip/depcheck clean or exceptions documented; docs match reality.

## Cross-phase rules

- Every phase lands as reviewable commits on green tests; user reviews at phase
  boundaries before the next phase's plan is written.
- Security bugs: fixed in dedicated commits with regression coverage and called
  out in the commit message. Behavior quirks: logged to the findings file, not
  fixed.
- No URL changes or major dependency upgrades anywhere in the refactor. Active
  migration changes are allowed only when required to correct a confirmed
  security issue, with the reason and regression test recorded in the commit.
- Lint warning floor only ratchets down.

## Decisions log

| Decision | Choice |
|---|---|
| Middleware fix | Shipped immediately as standalone hotfix (`fbca6720`) |
| Phase order | Guardrails → Auth/API → AI split → Thin pages → Client data → Hygiene |
| Bug policy | Security bugs fixed in dedicated commits + flagged; quirks logged to findings file |
| Planning model | This umbrella spec + just-in-time per-phase implementation plans |
| Phase 3 persistence exception | Approved: normalized durable turns and idempotency are implemented in the active prerelease migration set |

## Risks

- **Auth rollout regressions** — mitigated by per-family contract tests written
  before migration, and family-at-a-time scope.
- **Now-active middleware changes production behavior** (redirects, org cookie
  auto-select) — intended, but watch for redirect loops after deploy.
- **AI dispatcher split breaks tool dispatch** — mitigated by the
  registry↔executor invariant test.
- **AI retries lose messages or repeat side effects** — the Phase 3 design must
  define durable turn state and end-to-end idempotency before changing either
  chat transport or executor orchestration.
- **Plan drift** — mitigated by writing each phase's detailed plan against the
  code as it exists when the phase starts.
