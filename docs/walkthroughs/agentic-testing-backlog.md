# Agentic Walkthrough Coverage Plan

Date: 2026-06-25

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
- `walkthrough:journeys`: passed, `14 passed` across sharded journey specs
- `walkthrough:test`: passed, `9 smoke + 14 journey checks` across sharded smoke and journey specs
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

The remaining gaps are mostly the next UI mission slices and exploratory-agent review loops rather than immediate harness enablement.

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
- UI-level module, task inbox, grant transition, visible onboarding, and dashboard workspace sweep missions.

### Onboarding Idempotency And Invalid Input

New journey coverage verifies:

- The visible `/welcome` onboarding wizard can provision a brand-new user into a usable organization and portfolio.
- Explicit onboarding module choices preserve the canonical always-on `portfolio` module.
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

### UI Mission Coverage

`tests/walkthrough/journeys/ui-missions.spec.ts` adds visible user-flow coverage for critical screens that previously had mostly API-backed journey checks.

Covered missions:

- A Beta organization admin enables Donor Management from the module settings UI and immediately reaches the donor workspace.
- An Alpha organization admin creates a task from the task inbox UI, assigns it, completes it, reopens it, and verifies the resulting database state.
- An Alpha organization admin transitions a grant from the visible Grant Management pipeline controls and verifies one history row.
- A brand-new user completes the visible onboarding wizard and lands in the provisioned dashboard.
- An Alpha organization admin loads the main high-value module workspaces: dashboard, donors, grants, tax, compliance, analytics, and reports.

Supporting product accessibility improvements:

- Task form controls now have explicit labels usable by assistive technology and Playwright.
- Task complete/reopen controls include the task title in their accessible names.

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
- `walkthrough-triage.json` also includes the active persona and a compact tail of the Next dev-server log.

## Remaining High-Value Improvements

### P2 — Continue UI-Level Mission Tests

Current journey specs now include the critical visible UI missions called out in the previous plan. Continue adding product-specific UI journeys where the visible controls are stable enough to be useful.

Remaining suggested UI paths:

- Donor creation and receipt/acknowledgment generation from visible controls.
- Tax contribution creation and export from visible controls.
- Compliance calendar/document upload flows from visible controls.
- Convert future exploratory-agent findings into focused regression tests.

### P3 — Continue Artifact And Runtime Triage

Failure artifacts now include a concise JSON summary. Continue improving triage and runtime stability.

Remaining ideas:

- Reduce occasional local `Fast Refresh` and `MaxListenersExceededWarning` noise during long dev-server runs.

## Recommended Next Implementation Order

1. Start donor, tax, and compliance exploratory-agent passes and convert confirmed findings into regressions.
2. Add visible-control regressions for the confirmed donor creation/receipt, tax contribution/export, and compliance upload paths.
3. Reduce remaining local dev-server warning noise during long runs.
