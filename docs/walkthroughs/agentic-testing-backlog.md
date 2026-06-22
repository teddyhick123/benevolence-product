# Agentic Walkthrough Coverage Plan

Date: 2026-06-20

## Current Local Status

The local Supabase-backed walkthrough stack is working, and the high-value journey suite now runs as part of the combined walkthrough command and CI workflow.

Commands run:

```bash
npm run walkthrough:doctor
npm run walkthrough:setup
npm run walkthrough:smoke
npm run walkthrough:journeys
npm run walkthrough:test
npx vitest run lib/__tests__/schema-privileges-contract.test.ts
npx tsc --noEmit --pretty false
```

Results:

- `walkthrough:doctor`: passed
- `walkthrough:setup`: passed, reset from canonical `db/migrations`, seeded deterministic personas
- `walkthrough:smoke`: passed, `9 passed`
- `walkthrough:journeys`: passed, `9 passed`
- `walkthrough:test`: passed, `9 smoke + 9 journey checks`
- Schema privilege contract: passed, `5 passed`
- TypeScript: passed

CI status:

- `.github/workflows/walkthrough-smoke.yml` now runs both `npm run walkthrough:smoke` and `npm run walkthrough:journeys`.

## Findings

No new product-breaking walkthrough failures were found in the automated smoke or journey suites after the schema privilege fixes. The current implementation now guards the main regression classes found during the walkthrough work:

- Missing `GRANT`/RLS privilege regressions on app-used tables and views.
- Missing service-role execute grants on security-definer RPCs used by app routes.
- Journey coverage drift between local runs and CI.
- Duplicate grant lifecycle requests creating duplicate history.
- Duplicate or invalid onboarding provisioning creating partial account state.
- Service-role-backed export/module routes leaking cross-tenant data.
- Local walkthrough warning noise hiding useful failure output.
- Task completion/reopen retries creating duplicate task events.
- Portfolio GET routes relying only on RLS for cross-tenant reads.

The remaining gaps are mostly UI-level mission coverage and continued artifact/runtime polish rather than immediate harness enablement.

## Implemented Coverage

### Schema Privilege Guard

`lib/__tests__/schema-privileges-contract.test.ts` scans canonical migrations for app-used tables/views and verifies expected privileges for `authenticated` and `service_role`.

Covered areas:

- Service-role execute access for the onboarding provisioning RPC.
- Views used by app routes, such as `v_holdings`, `v_grants`, `v_portfolio_kpi_latest`.
- Tables behind security-invoker views, such as `holding_valuations`.
- Service-role-managed workflow/task/grant tables.

### CI Journey Gate

`npm run walkthrough:journeys` was added and wired into `.github/workflows/walkthrough-smoke.yml` after smoke.

Covered journeys:

- Grant lifecycle transition/history rules.
- Module enablement and immediate page availability.
- Onboarding provisioning.
- Active-org switching and stale-tab mutation scoping.
- Service-role route tenant isolation.

### Onboarding Idempotency And Invalid Input

New journey coverage verifies:

- Submitting `/api/onboarding/provision` twice for the same new user creates one membership and one portfolio, with the second request returning `409`.
- Invalid `name` and invalid `org_type` return `400`.
- Invalid provisioning requests leave membership counts unchanged.
- A walkthrough-only fault after portfolio creation rolls back the organization, membership, and portfolio rows.

### Service-Role Tenant Isolation

New journey coverage probes a logged-in Alpha owner against Gamma service-role-backed routes:

- `GET /api/org/[orgId]/compliance/dashboard`
- `GET /api/org/[orgId]/compliance/filing-calendar/[filingId]/attachments`
- `GET /api/portfolio/[id]/grants/export`
- `GET /api/portfolio/[id]/holdings`
- `GET /api/portfolio/[id]/settings`
- `GET /api/portfolio/[id]/tax/export`
- `GET /api/portfolio/[id]/tax/cpa-share`
- `GET /api/portfolio/[id]/tax/contributions/[contributionId]/documents/[documentId]`
- `POST /api/admin/portfolios/[id]/settings`

Expected invariant:

- Cross-tenant requests return `401`, `403`, or `404`.
- Response bodies do not leak Gamma org names, portfolio names, grant names, or seeded amounts.

### Duplicate Lifecycle Semantics

The journeys now repeat successful state changes and verify stable side effects:

- The duplicate request returns `422`.
- Only one `grant_status_history` row exists for the target stage.
- Duplicate module enable/disable requests return success and leave the module JSON in the expected state.
- Duplicate task complete/reopen requests return success with an idempotency marker and do not create duplicate `task_events`.

### Explicit Portfolio Read Guards

`app/api/portfolio/[id]/holdings/route.ts` now checks `can_view_portfolio(p_portfolio_id)` before querying `v_holdings`.

Expected behavior:

- Unauthenticated: `401`
- Authenticated but not a portfolio member: `403`
- Allowed member: data

The expanded service-route isolation journey covers the cross-tenant `403` path.

### Harness Noise Reduction

Implemented cleanup:

- `next.config.js` allows the local `127.0.0.1` dev origin used by Playwright.
- `scripts/walkthrough/lib.ts` removes inherited `NO_COLOR` from walkthrough child envs so Playwright/Next output no longer emits the `NO_COLOR`/`FORCE_COLOR` conflict warning.
- `tests/walkthrough/fixtures.ts` attaches `walkthrough-triage.json` on console, page, request, or HTTP 5xx failures with current URL, active org cookie, request failures, HTTP failures, console errors, and `/api/me` context.

## Remaining High-Value Improvements

### P2 — Add UI-Level Mission Tests

Current journey specs use API requests for many stateful actions, which is useful and stable. Add a smaller number of UI-driven mission tests for critical screens so layout, controls, and accessible names stay healthy.

Suggested UI paths:

- Enable donor management in Beta through the UI, not only via API.
- Transition a grant through visible controls.
- Complete and reopen a task through the task inbox.
- Walk a new user through the visible onboarding flow.

### P3 — Continue Artifact And Runtime Triage

Failure artifacts now include a concise JSON summary. Continue improving triage and runtime stability.

Ideas:

- Capture persona names explicitly in failure metadata.
- Persist a compact server log excerpt around failing requests.
- Reduce occasional local `Fast Refresh` and `MaxListenersExceededWarning` noise during long dev-server runs.

## Recommended Next Implementation Order

1. Add a small UI-driven mission suite for the most valuable visible workflows.
2. Capture persona names and server log excerpts in failure metadata.
3. Reduce remaining local dev-server warning noise during long runs.
