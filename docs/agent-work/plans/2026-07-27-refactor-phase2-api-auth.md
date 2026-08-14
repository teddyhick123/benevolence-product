# Phase 2 — API and Authorization Standardization

**Date:** 2026-07-27  
**Spec:** `docs/agent-work/specs/2026-07-26-full-refactor-design.md`
**Depends on:** Phase 1 through `4565644e`  
**Working branch:** `codex/refactor-phase2-api-auth`

## Goal

Replace the project's competing route-auth patterns with one typed API boundary,
move elevated database work behind tenant-scoped repositories, and standardize
JSON responses without changing URLs. Roll out one route family at a time so
each slice has characterization tests, tenant-isolation evidence, and a green
gate before the next family starts.

Phase 2 is not a single bulk rewrite. It has one shared foundation followed by
family checkpoints:

1. API/auth foundation and service-role ratchet
2. Confirmed membership security fix
3. Tax and CPA sharing
4. Grants
5. Donors and compliance
6. Imports and integrations
7. Remaining route families
8. Remove compatibility adapters and close the ratchet

## Verified starting point

- 243 API route files.
- 111 routes construct/check a user session inline.
- 119 routes reference `createAdminClient(` or `SUPABASE_SERVICE_ROLE` directly.
- Existing helpers compete across `lib/org-access.ts`, `lib/portfolio-auth.ts`,
  and `lib/admin-auth.ts`.
- Phase 1 baseline: TypeScript green, 0 lint errors / 511 warnings, 1,951 tests
  passing / 6 skipped, and zero Vitest stderr blocks.
- Tax is the first family: 13 portfolio routes plus 2 public CPA-token routes.
- Builder is out of scope except for the already-shared CI/check-matrix
  infrastructure. Do not migrate Builder routes while another agent owns them.

## Non-negotiable invariants

- No URL changes.
- `db/migrations` remains the schema source of truth.
- Authenticated JSON defaults to `Cache-Control: no-store`.
- Binary downloads, redirects, streams, uploads, and webhooks retain their
  transport-specific responses rather than being forced through JSON helpers.
- Org mutations remain under `/api/org/[orgId]`; portfolio reads remain under
  `/api/portfolio/[id]`. Existing exceptions become adapters over canonical
  services; they are not relocated in this phase.
- User routes use the session client and RLS after an explicit guard.
- Elevated clients are never returned to a route. A repository constructor
  requires an org, portfolio, or non-user principal context and every method
  applies that scope.
- Security bugs get dedicated commits with regression coverage. Other behavior
  quirks go in `docs/agent-work/specs/2026-07-26-refactor-findings.md`.
- The lint floor only moves down.

## Target API boundary

Create `lib/api/` as the only route-boundary home:

```text
lib/api/
  access.ts                 typed guards and denied-result helper
  principals.ts             user/cpa_share/job/invitation/oauth/public union
  responses.ts              jsonOk/jsonError and cache policy
  server-client.ts          session-client construction
  admin-client.ts           private elevated-client construction
  repositories/
    tax.ts                  portfolio-scoped tax/storage operations
    cpa-share.ts            token-scoped public CPA operations
    grants.ts               added with the grants family
    ...                     added only when a family migrates
  __tests__/
```

The public guard contract is:

```ts
type AccessPrincipal =
  | { kind: 'user'; userId: string }
  | { kind: 'cpa_share'; shareLinkId: string }
  | { kind: 'job'; job: string }
  | { kind: 'invitation'; invitationId: string }
  | { kind: 'oauth'; provider: string; subject?: string }
  | { kind: 'public' };

requireAppAdmin()
requireOrgAccess(orgId, minRole?)
requirePortfolioAccess(portfolioId, minRole?)
requireCpaToken(token)
```

User guard success contexts include the session client, user principal, role,
and resolved tenant identifiers. They never include an elevated client. CPA
success contexts include the validated share-link identity, portfolio/org
scope, years, and permissions; subsequent work goes through the CPA repository.
Denied guards return one typed response result so routes do not reproduce
401/403 handling.

`requireCpaToken` is the one bootstrap exception: it performs an exact
SHA-256-token-hash lookup internally to discover the tenant, compares hashes in
constant time, validates revocation/expiry/access limits, and then constructs a
scoped repository. The elevated client never escapes `lib/api/`.

## Incremental enforcement

The final rule is zero direct `createAdminClient(` or service-role environment
references under `app/api/**`. The current count is 119, so an immediate global
ban would make every intermediate commit red.

Add a Phase 2 contract test, an immutable baseline fixture, and a current
allowlist containing the current legacy paths. The test must:

- fail if a new route starts using either forbidden token;
- fail if a removed legacy path remains in the current allowlist, forcing it to
  ratchet down with every family;
- reject any current-allowlist path absent from the immutable baseline, so an
  old exception cannot be swapped for a new one;
- ignore comments and tests where practical;
- allow elevated construction only inside `lib/api/admin-client.ts`;
- end Phase 2 with the fixture deleted and a zero-match assertion.

Also inventory elevated usage outside routes. Family migrations must move the
domain services they call (for example `lib/tax/cpa-public-access.ts`) behind a
scoped repository; jobs and OAuth callbacks use their explicit principal types.

## Task 0 — Preflight and phase branch

- Record `4565644e` as the Phase 2 base.
- Confirm the worktree is clean and Phase 1 gates remain green.
- Work on `codex/refactor-phase2-api-auth`, based on the Phase 1 result.
- Do not remove or modify other agent worktrees.
- Keep family commits separable; no mixed-domain commits.

## Task 1 — Characterize and ratchet the legacy boundary

**Create:**

- `tests/integration/api-boundary-contract.test.ts`
- `tests/fixtures/legacy-service-role-baseline.txt`
- `tests/fixtures/legacy-service-role-routes.txt`

**Tests first:**

- The current allowlist exactly equals the set of route files containing direct
  elevated access.
- The current allowlist is a subset of the immutable 119-route baseline.
- A synthetic/new path is rejected.
- `lib/api/admin-client.ts` is the only intended constructor location after the
  foundation exists.
- Existing route families are classified by supported principal: user,
  `cpa_share`, job, invitation, OAuth, or public.

Commit the inventory separately. It is a ratchet, not a permanent exception.

## Task 2 — Build the shared API/auth foundation

**Create:**

- `lib/api/principals.ts`
- `lib/api/responses.ts`
- `lib/api/server-client.ts`
- `lib/api/admin-client.ts`
- `lib/api/access.ts`
- focused unit tests under `lib/api/__tests__/`

**Behavior:**

- `jsonOk` and `jsonError` merge caller headers and default authenticated JSON
  to `no-store`.
- 401 means no valid user session; 403 means an authenticated principal lacks
  tenant/role access. Preserve route-specific 404 concealment where existing
  characterization tests require it.
- Org and portfolio roles use `lib/roles.ts`; there is no duplicate role rank.
- `requireOrgAccess` resolves the canonical `user_org_role(p_org_id)` result.
- `requirePortfolioAccess` returns `orgId` and requires both active portfolio
  membership and active, accepted org membership.
- `requireAppAdmin` uses `is_app_admin()`.
- Guard/RPC infrastructure failures remain distinguishable from access denial
  where current routes expose a 500.

Keep the old helper modules only as temporary re-exports/adapters so unmigrated
families remain green. New and migrated routes import only `@/lib/api/...`.

## Task 3 — Fix the confirmed membership boundary

This is a dedicated security commit, not folded into mechanical route changes.

**Modify canonical migrations:**

- `db/migrations/0002_organizations.sql`
- `db/migrations/0004_portfolios.sql`

**Confirmed issue:** `org_role_gte`, `user_org_role`, `user_portfolio_role`,
`can_view_portfolio`, and `can_edit_portfolio` currently accept memberships
without consistently requiring `organization_members.accepted_at IS NOT NULL`.
The portfolio helpers also trust a surviving `portfolio_members` row after the
corresponding org membership is revoked.

**Required fix:**

- Org helpers require a non-deleted, accepted org membership.
- Portfolio helpers join `portfolios` to a non-deleted, accepted org membership
  for the same user, in addition to a non-deleted portfolio membership.
- Keep canonical role thresholds: viewer for reads; member for writes.
- Add migration contract tests and, where practical, local-Supabase regression
  coverage for pending membership, revoked org membership, and valid access.
- Run `npm run verify:migrations` against local Supabase.

Commit message must begin `fix(security):` and state that revoked/pending org
members can no longer retain portfolio access.

## Task 4 — Tax characterization checkpoint

Tax includes:

- 13 routes under `app/api/portfolio/[id]/tax/**`;
- 2 public routes under `app/api/tax/cpa/[token]/**`;
- `lib/tax/cpa-public-access.ts`, which currently constructs elevated clients.

Before modifying a handler, record its current verbs, status codes, JSON/binary
shape, cache headers, and role threshold. Extend the existing 13 tax-focused
test files rather than creating one mock style per route. Adopt Phase 1 helpers
from `tests/helpers/` as each file is touched.

Required characterization includes:

- unauthenticated, viewer, member, and cross-portfolio cases;
- RPC failure versus access denial where status codes currently differ;
- body/URL portfolio mismatch;
- child IDs belonging to another contribution/portfolio;
- signed URL behavior and private storage invariants;
- CPA token: unknown, malformed, expired, revoked, max-accessed, disallowed
  permission, wrong tax year, and cross-portfolio document ID;
- JSON response keys and download/redirect headers.

No route migration begins until its characterization tests pass on the old
implementation.

## Task 5 — Migrate user-session tax routes

Migrate simple reads first, then mutations:

1. `summary`, `overview`, `export`, `form8283`
2. `contributions` collection and item
3. `carryforwards`, `profile`, `optimize`, `scenarios`
4. `cpa-share` management

Rules:

- GET uses `requirePortfolioAccess(id, 'viewer')` unless the existing contract
  intentionally requires edit access (CPA-share management currently does).
- POST/PUT/PATCH/DELETE use at least `member` and preserve stricter existing
  thresholds.
- Queries retain explicit `.eq('portfolio_id', portfolioId)` scoping even when
  RLS also applies.
- Replace JSON construction with `jsonOk`/`jsonError` only where response bodies
  and headers remain identical.
- Do not change CSV/PDF/TXF response handling.
- Remove migrated paths from the service-role fixture in the same commit.

## Task 6 — Tax elevated repositories and document storage

Create `lib/api/repositories/tax.ts` with portfolio scope required at
construction. Repository methods must be operation-specific, not expose
`.from()` or the underlying client.

Cover at least:

- profile/year upserts that require elevated access;
- tax-document metadata reads/writes scoped by `portfolio_id` and
  `tax_contribution_id`;
- upload, signed-URL, and removal methods whose storage keys are validated to
  remain under the portfolio/contribution prefix;
- rollback cleanup after failed metadata writes.

Migrate both tax-document routes. Tests must prove a tampered contribution ID,
document ID, or storage path cannot escape the portfolio context. Signed URLs
remain one-hour private URLs; `getPublicUrl` remains forbidden.

## Task 7 — CPA-token guard and repository

Create `lib/api/repositories/cpa-share.ts` and migrate
`lib/tax/cpa-public-access.ts` plus both public token routes.

- `requireCpaToken` produces a `cpa_share` principal and scope.
- Every payload query is constrained to the share's portfolio and permitted tax
  years.
- Document downloads require both the share permission and a document row in
  that portfolio/year set.
- Access logging and access-count updates are scoped to the validated link.
- Raw bearer tokens are never persisted or returned.
- Rate limiting remains before expensive token work.
- JSON uses response helpers; redirects/download bodies retain named transport
  handling.

At the tax checkpoint, run types, lint, all unit/integration tests, the tax
walkthrough journey, and direct cross-tenant API checks. Commit any security fix
separately from mechanical migration work.

## Task 8 — Grants family checkpoint

Scope: 12 grant routes across canonical org mutations and legacy portfolio
reads/adapters, plus grant services that construct elevated clients.

- Characterize the current grant status/response contract first.
- Use `requireOrgAccess` for org routes and `requirePortfolioAccess` for legacy
  portfolio reads.
- Org mutations remain `member+` unless an existing operation is stricter.
- Child tables are scoped through `grants!inner(org_id)` or a parent grant lookup;
  never recreate `grant_details` or portfolio-scoped mutation routes.
- Lifecycle changes continue through `lib/grants/lifecycle.ts` and always record
  history.
- Elevated grant work moves to an org-scoped repository.
- Leave Builder and AI executor restructuring to their owning phases; only
  adapt a narrow call boundary if required for tenant scoping.

Review and gate before donors/compliance.

## Task 9 — Donors and compliance checkpoint

Scope: 2 donor routes and 9 compliance routes, plus their directly invoked
services.

- Donors use org guards and the canonical `donors` module slug.
- Compliance org routes use org guards; portfolio reports use portfolio guards.
- Preserve legal/compliance calculations and export formats.
- Elevated attachment/storage operations require org/filing scope and validate
  object paths.
- Add cross-org tests for detail IDs, attachments, state registrations, and
  filing mutations.

Review and gate before imports/integrations.

## Task 10 — Imports and integrations checkpoint

Scope: 23 import routes and 9 QuickBooks integration routes.

- Admin imports use `requireAppAdmin`; org imports use
  `requireOrgAccess(orgId, 'admin')`.
- Workers/watchdogs use the `job` principal and org-scoped repositories.
- QuickBooks connect/disconnect/accounts/status use a user principal;
  callback routes use the `oauth` principal and state-bound org context.
- Export/sync operations prove org scope before elevated reads or writes.
- Never accept an org ID from callback/query/body without matching signed OAuth
  state or an authenticated context.

Review and gate before the remainder.

## Task 11 — Remaining families

Process the remaining routes in bounded groups, each with characterization,
migration, ratchet reduction, and a green checkpoint:

1. holdings, metrics, analytics, visualizations, reports
2. tasks, workflows, pledges, acknowledgments, notifications
3. memberships, invitations, modules, capabilities, custom fields
4. onboarding and public invitation flows
5. AI routes and background jobs (boundary adaptation only; no AI subsystem split)
6. app-admin, charities, recommendations, and miscellaneous public routes

Explicitly classify every route by supported principal. Public routes do not
receive a fake user context; jobs, invitations, and OAuth callbacks do not use
the user guard as a convenience.

## Task 12 — Phase exit

- Delete the temporary legacy service-role fixture.
- Enforce zero direct elevated-client/environment references under `app/api/**`.
- Confirm all elevated domain work uses a tenant/principal-scoped repository.
- Remove `lib/org-access.ts`, `lib/portfolio-auth.ts`, and `lib/admin-auth.ts`
  compatibility adapters after `rg` confirms no imports.
- Confirm zero routes construct auth inline.
- Run:

```bash
npm run verify:types
npm run verify:lint
npm run verify:unit
npm run verify:migrations
npm run verify:build
```

- Run the org-isolation walkthrough and the affected family journeys.
- Ratchet the lint ceiling down if the warning count decreased.
- Update architecture docs to point to `lib/api/` as the only route boundary.
- Open the phase-boundary PR(s) for user review; do not merge automatically.

## Per-family definition of done

A family is complete only when:

- every route has an explicit supported principal and typed guard;
- current response/status behavior is characterized;
- tenant IDs are applied to every direct query or proved through a documented
  parent join;
- elevated work is behind operation-specific scoped repository methods;
- direct service-role allowlist entries for the family are removed;
- cross-tenant read and mutation tests pass;
- types, lint floor, full unit/integration suite, and relevant walkthroughs pass;
- security fixes, if any, are isolated and named as security commits;
- non-security quirks are recorded rather than opportunistically changed.

## Why family-by-family is required

The route surface is too large and too heterogeneous for a safe big-bang edit:
user sessions, CPA bearer links, background jobs, invitations, OAuth callbacks,
binary downloads, and storage operations have different trust boundaries. The
shared foundation makes their contracts consistent; family checkpoints keep
data ownership, response compatibility, and tenant isolation reviewable.
