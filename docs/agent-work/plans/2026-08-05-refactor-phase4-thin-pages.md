# Phase 4 — Thin Pages Implementation Plan

**Spec:** `docs/agent-work/specs/2026-07-26-full-refactor-design.md`

## Goal

Make route pages composition roots instead of mixed data, mutation, calculation,
and presentation modules. Preserve URLs, rendered behavior, RLS/session access,
repository boundaries, grant lifecycle rules, and every behavior quirk recorded
in the findings log.

## Guardrails

- Route pages stay at or below 300 lines; the two pilots target about 150 lines.
- Server reads remain on cookie-backed Supabase clients and therefore keep RLS.
- Extracted mutations must not introduce service-role/elevated clients.
- Grant stage changes continue exclusively through `lib/grants/lifecycle.ts`.
- Grant mutations remain org-scoped; portfolio context is read/navigation context.
- Existing empty/error fallbacks, validation, revalidation, and geocoding timing
  are preserved unless a security regression is found.
- Phase 3 AI turn persistence and idempotency boundaries are untouched.

## Baseline inventory

The branch begins with 18 page files over 300 lines. Work worst-first:

1. `app/dashboard/holdings/[holdingId]/page.tsx` (1,624)
2. `app/dashboard/compliance/page.tsx` (847)
3. `app/dashboard/grants/page.tsx` (664)
4. `app/dashboard/grants/[grantId]/page.tsx` (601)
5. `app/charities/page.tsx` (591)
6. `app/dashboard/donors/[donorId]/page.tsx` (543)
7. `app/admin/upload/page.tsx` (519)
8. `app/dashboard/letter/page.tsx` (513)
9. `app/admin/portfolios/[id]/kpis/page.tsx` (487)
10. `app/dashboard/tax/page.tsx` (458)
11. `app/admin/org/[orgId]/page.tsx` (429)
12. `app/org/[orgId]/donors/new/page.tsx` (394)
13. `app/org/[orgId]/contributions/page.tsx` (389)
14. `app/org/[orgId]/acknowledgments/page.tsx` (338)
15. `app/dashboard/reports/page.tsx` (324)
16. `app/org/[orgId]/donors/[donorId]/page.tsx` (321)
17. `app/dashboard/donors/new/page.tsx` (320)
18. `app/dashboard/tax/print/page.tsx` (320)

## Task 1 — Structural characterization

- Add a contract test that inventories every App Router `page.tsx` and fails when
  any route exceeds 300 lines.
- During extraction, keep the test scoped to the migrated set; enable the global
  assertion after the last route is thin.
- Add pilot contracts proving the holding page delegates to domain queries and
  actions, contains no direct Supabase access, and the grant page imports the
  lifecycle service rather than writing `lifecycle_stage` directly.

## Task 2 — Holdings detail pilot

- Move row/view-model types to `lib/holdings/detail/types.ts`.
- Move RLS-backed queries to `lib/holdings/detail/queries.ts` and load the page
  through one `getHoldingDetail()` composition query.
- Move calculations and presentation derivations to
  `lib/holdings/detail/view-model.ts` with focused unit coverage.
- Move server actions to `lib/holdings/detail/actions.ts`; retain the current RLS
  client, exact validation, write filters, and revalidation paths.
- Split JSX into cohesive components under `components/holdings/detail/`:
  summary/editing, contact and analytics, narrative/financials, locations,
  contributions, and facts.
- Leave the route responsible only for params, portfolio mismatch handling,
  missing-row behavior, data loading, and component composition.

## Task 3 — Grants pilot

- Extract grant list/detail reads and view models to `lib/grants/`.
- Extract page sections to `components/grants/list/` and
  `components/grants/detail/`.
- Keep mutations at `app/api/org/[orgId]/grants/**` and stage transitions through
  `transitionGrant()` so history is recorded atomically with the lifecycle rule.
- Add a structural contract preventing direct `lifecycle_stage` updates in page
  and component code.

## Task 4 — Remaining oversized routes

For each route, apply the same ownership rule: domain reads/types/helpers in
`lib/<domain>/`, reusable presentation in `components/<domain>/`, and only route
concerns in `page.tsx`. Client-only page implementations may move to a named
domain screen component when their network normalization belongs to Phase 6;
do not change their fetch semantics in this phase.

## Verification

After each pilot: focused unit/contract tests and TypeScript. At the end:

1. all App Router pages at or below 300 lines;
2. holdings and grants walkthrough journeys, including direct URL, invalid ID,
   stale portfolio query, edits, repeated submissions, and grant transitions;
3. full type, lint, unit, build, and clean-migration gates;
4. diff audit for elevated clients, direct lifecycle writes, URL changes, and
   accidental changes to findings-log quirks.
