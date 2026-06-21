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
- `walkthrough:journeys`: passed, `7 passed`
- `walkthrough:test`: passed, `9 smoke + 7 journey checks`
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

The remaining gaps are mostly broader product coverage and artifact triage rather than immediate harness enablement.

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

### Service-Role Tenant Isolation

New journey coverage probes a logged-in Alpha owner against Gamma service-role-backed routes:

- `GET /api/org/[orgId]/compliance/dashboard`
- `GET /api/portfolio/[id]/grants/export`
- `GET /api/portfolio/[id]/tax/export`
- `GET /api/portfolio/[id]/tax/cpa-share`

Expected invariant:

- Cross-tenant requests return `401`, `403`, or `404`.
- Response bodies do not leak Gamma org names, portfolio names, grant names, or seeded amounts.

### Duplicate Lifecycle Semantics

The grant lifecycle journey now repeats a successful transition request and verifies:

- The duplicate request returns `422`.
- Only one `grant_status_history` row exists for the target stage.

### Harness Noise Reduction

Implemented cleanup:

- `next.config.js` allows the local `127.0.0.1` dev origin used by Playwright.
- `scripts/walkthrough/lib.ts` removes inherited `NO_COLOR` from walkthrough child envs so Playwright/Next output no longer emits the `NO_COLOR`/`FORCE_COLOR` conflict warning.

## Remaining High-Value Improvements

### P1 — Simulated Partial-Failure Rollback

Add a deterministic fault-injection path for onboarding so tests can prove organization, membership, portfolio, and portfolio membership writes roll back together when a later creation step fails.

Relevant route:

- `app/api/onboarding/provision/route.ts`

### P1 — Expand Service-Role Isolation Matrix

Add probes for the remaining service-role-backed paths:

- Compliance document and filing attachment routes.
- Settings routes that read/write org-scoped data through admin clients.
- Any download or signed URL route.

### P2 — Add Explicit Read Guards To Portfolio GET Routes

Some GET routes rely heavily on RLS plus authenticated clients. That is defensible, but explicit `can_view_portfolio` checks give clearer failures and reduce the chance that a future RLS regression silently becomes an exposure.

Good first candidate:

- `app/api/portfolio/[id]/holdings/route.ts`

Suggested behavior:

- Unauthenticated: `401`
- Authenticated but not allowed: `403` or `404`
- Allowed: data

Then add tenant-isolation tests for the explicit behavior.

### P2 — Expand Duplicate And Retry Semantics

The lifecycle duplicate case is covered. Add duplicate/retry tests for:

- Repeating module enable/disable operations.
- Retrying task completion/reopen.
- Refresh/back-submit behavior on forms once UI-level journeys are added.

Expected invariant:

- Duplicate requests are idempotent or return a clear `409`/`422`.
- Duplicate requests do not append duplicate history rows or create duplicate child rows.

### P2 — Add UI-Level Mission Tests

Current journey specs use API requests for many stateful actions, which is useful and stable. Add a smaller number of UI-driven mission tests for critical screens so layout, controls, and accessible names stay healthy.

Suggested UI paths:

- Enable donor management in Beta through the UI, not only via API.
- Transition a grant through visible controls.
- Complete and reopen a task through the task inbox.
- Walk a new user through the visible onboarding flow.

### P3 — Improve Artifact Triage

Failure artifacts are already uploaded on CI failure. Improve triage by adding a concise machine-readable summary when a walkthrough fails.

Ideas:

- Capture failed URL, active org cookie, persona, and failing endpoint.
- Persist browser console and HTTP failure list as a small JSON artifact.
- Include the last `/api/me` payload in failed walkthrough artifacts when authenticated.

## Recommended Next Implementation Order

1. Add onboarding fault-injection rollback coverage.
2. Expand service-role isolation probes to document/download/settings routes.
3. Add duplicate/retry coverage for module toggles and task operations.
4. Add a small UI-driven mission suite for the most valuable visible workflows.
5. Improve failure artifacts with persona, active org, failed URL, console, and HTTP summary data.
