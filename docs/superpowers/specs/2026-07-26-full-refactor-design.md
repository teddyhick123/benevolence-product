# Full Refactor — Umbrella Design

**Date:** 2026-07-26
**Status:** Approved (umbrella). Each phase gets its own just-in-time implementation plan.
**Owner:** teddyhick + Claude

## Goal

A clean, well-organized, efficient codebase with exactly one supported pattern per
concern — auth guards, Supabase clients, API responses, data fetching, tests —
without changing URLs, database schema, or user-visible behavior. Exception:
security bugs discovered while refactoring are fixed inline in the same commit and
called out explicitly; non-security behavior quirks are logged to
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
2. Add a CI workflow gating pushes/PRs: `npm ci` → `verify:types` → lint with
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
6. Local cleanup: delete stale `.claude/worktrees/*` (six locked git worktrees —
   unlock/remove, then prune and delete their `worktree-agent-*` branches) and
   the empty `impact-viz-mvp/` directory.

**Exit:** CI red/green on every push; test count ≥ baseline; lockfile tracked.

### Phase 2 — API & auth standardization

Consolidate `lib/org-access.ts`, `lib/portfolio-auth.ts`, `lib/admin-auth.ts` into
`lib/api/` (do not add a fourth competing pattern):

- `requireAppAdmin()`, `requireOrgAccess(orgId, minRole)`,
  `requirePortfolioAccess(portfolioId, minRole)`, `requireCpaToken(token)` — each
  returns `{ user, supabase }` or a typed 401/403 the route returns as-is.
- A `service()` (admin client) factory reachable only after a guard. Invariant:
  **every service-role query filters by the tenant id the guard validated.**
  Enforced, not just conventional: the factory takes the guard-validated tenant
  id as a required argument, and a CI check forbids direct
  `createAdminClient(`/`SUPABASE_SERVICE_ROLE` references in `app/api/**`
  outside `lib/api/`.
- `jsonOk` / `jsonError` response helpers with standard cache headers; `no-store`
  is the default for authenticated data.
- Route ownership per CLAUDE.md: org mutations under `/api/org/[orgId]`, portfolio
  reads under `/api/portfolio/[id]`. URLs never change in this refactor.

Rollout is one route family at a time — tax → grants → donors/compliance →
imports/integrations → remainder. Each family is preceded by contract tests
capturing current status codes and response shapes so migration is provably
behavior-preserving. Tenant-scoping holes get fixed inline per the bug policy.
The repeated per-route cookie/client boilerplate collapses into the guards.

Known collision: the backlog already records portfolio membership/view RLS gaps
across 14+ routes and 13 views. Under the bug policy those are security bugs
fixed inline, so families touching portfolio scoping (tax is first) will carry
real behavior-affecting fixes and should be budgeted accordingly — Phase 2 is
not purely behavior-preserving.

**Exit:** zero routes construct auth inline; contract tests cover every family;
service-role usage always tenant-scoped after a guard.

### Phase 3 — AI subsystem split

- Per-module tool definition files and `executors/<module>.ts`, composed through
  the module registry (continue the existing grants/tax extraction pattern).
  `executor.ts` becomes a dispatcher table.
- New invariant test: every registered tool has exactly one executor; every
  executor's tool is registered.
- Remove `@ts-nocheck` file-by-file (one commit each) by introducing typed tool
  arguments and DB row types.
- `lib/ai/portfolio-assistant.ts` remains the public entry point. Retire the
  `lib/claude-assistant.ts` shim and its contract test.
- Onboarding assistant and Builder remain separate bounded systems.

**Exit:** no `@ts-nocheck` in `lib/`; no file in `lib/ai/` over ~500 lines;
dispatcher invariant test green.

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

- One shared fetcher (JSON parsing, error shape, org header) + per-domain SWR
  hooks in `lib/<domain>/`. Pages prefer server-side initial load; interactive
  refresh goes through domain hooks.
- Convert the 175 ad-hoc `fetch` call sites per-domain, not big-bang.
- Consolidate hooks into `lib/hooks/`; remove `/hooks`.

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
- Security bugs: fixed inline, called out in the commit message. Behavior quirks:
  logged to the findings file, not fixed.
- No URL changes, no schema changes, no major dependency upgrades anywhere in the
  refactor.
- Lint warning floor only ratchets down.

## Decisions log

| Decision | Choice |
|---|---|
| Middleware fix | Shipped immediately as standalone hotfix (`fbca6720`) |
| Phase order | Guardrails → Auth/API → AI split → Thin pages → Client data → Hygiene |
| Bug policy | Security bugs fixed inline + flagged; quirks logged to findings file |
| Planning model | This umbrella spec + just-in-time per-phase implementation plans |

## Risks

- **Auth rollout regressions** — mitigated by per-family contract tests written
  before migration, and family-at-a-time scope.
- **Now-active middleware changes production behavior** (redirects, org cookie
  auto-select) — intended, but watch for redirect loops after deploy.
- **AI dispatcher split breaks tool dispatch** — mitigated by the
  registry↔executor invariant test.
- **Plan drift** — mitigated by writing each phase's detailed plan against the
  code as it exists when the phase starts.
