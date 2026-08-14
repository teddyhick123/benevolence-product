# Role And Permission Consistency Audit

> **Consolidation note (2026-08-08):** The audited role and permission findings
> are resolved. This document is retained as design and verification history;
> new open work belongs in the
> [consolidated backlog](module-reviews/FULL-BACKLOG.md).

Date: 2026-07-09

## Goal

Audit role and permission consistency across the product and propose a canonical role model.

The canonical database enum is:

```text
viewer < member < admin < owner
```

The desired product model is:

- `viewer`: read-only access to permitted org views.
- `member`: operational read/write access inside configured workflows.
- `admin`: can manage workspace configuration in Builder Studio.
- `owner`: admin powers plus ownership, account, and destructive controls.
- `implementation_reviewer`: additional Builder Studio capability assignable only to `admin` or `owner`, used for reviewing implementation/code-level Builder proposals.
- Internal super admin/app admin: platform-wide internal access, not a customer org role.

## Findings

## Resolution Status (2026-07-09)

- **P0 role vocabulary: resolved.** Active org and portfolio role surfaces use
  `viewer < member < admin < owner`; `lib/types/org.ts` re-exports the canonical
  role type from `lib/organizations/roles.ts`.
- **P0 platform admin: resolved.** Platform review surfaces use the canonical
  app-admin model rather than the retired `is_super_admin` field.
- **P1 ownership controls: resolved.** Organization deletion and every owner
  membership change require an owner; the last owner remains protected.
- **P1 implementation review: resolved.** `implementation_reviewer` is an
  owner-assigned capability for admins and owners, with reviewer actions gated
  in Builder Studio while workspace configuration remains admin+.
- **P1 queue handoff: resolved.** Foundation-facing proposal work stays in
  Builder Studio and the platform queue is internal-only.
- **P2 operational writes: resolved.** Grants, grant lifecycle records, tasks,
  task links, task comments, and grant checklist completion are `member+` in
  both route guards and RLS. Import jobs are intentionally **admin+** because
  they can create organization-wide data changes.
- **P2 tests: resolved for the audited boundaries.** The suite covers canonical
  role predicates, member grant creation/transitions, owner-only organization
  deletion and membership protection, and reviewer capability decisions.

**Role-array sweep: complete.** Active org-facing routes, QuickBooks
integrations, notifications, and membership UI now use canonical predicates or
the canonical role-set exports. New code should use `getOrgAccess()` for route
authentication and `lib/organizations/roles.ts` for every role decision.

### P0: Active UI And Types Still Use `editor`

The DB canon is `owner/admin/member/viewer` in `db/migrations/0001_extensions_and_shared_infra.sql:32`, but active application code still defines or presents `editor`.

Examples:

- `lib/organizations/roles.ts:1` defines `PortfolioRole = 'viewer'|'editor'|'owner'|'admin'`.
- `lib/organizations/roles.ts:5` defines `OrgRole = 'viewer'|'editor'|'admin'`, omitting `member` and `owner`.
- `components/org/OrgMembersTable.tsx:141` and `components/org/OrgMembersTable.tsx:208` offer `Editor` as an org role option.
- `components/org/OrgQuickActions.tsx:26` treats `editor` as an edit-capable org role.
- `components/org/OrgDashboard.tsx:89` shows edit actions for `admin` or `editor`, excluding canonical `member` and `owner`.
- `components/admin/EmailLookupAdd.tsx:12` and `components/admin/AdminRoleSelect.tsx:9` still type portfolio roles with `editor`.
- `app/admin/portfolios/[id]/members/page.tsx:12` and `app/admin/portfolios/[id]/members/page.tsx:86` expose `editor` in the portfolio admin UI.

Impact: Some active screens can submit invalid enum values. This is especially likely in platform portfolio-member management, where `lib/schemas/admin.ts` already rejects `editor`.

### P0: Platform Admin Checks Are Split Between `is_app_admin()` And `is_super_admin`

The canonical platform admin model is `profiles.is_app_admin` plus `is_app_admin()`, added in `db/migrations/0023_admin_superuser_policies.sql:18`.

Most admin pages use `is_app_admin()`, but Builder admin review routes use a stale `profiles.is_super_admin` column:

- `app/admin/builder/page.tsx:12`
- `app/api/admin/builder/proposals/route.ts:14`
- `app/api/admin/builder/proposals/[proposalId]/route.ts:19`

Impact: These routes either fail against the canonical schema or create a second internal-admin concept. Platform-wide internal access should be expressed only by `is_app_admin()`.

### P1: Owner-Only Destructive And Account Controls Are Not Consistently Owner-Only

The desired model reserves ownership/account/destructive controls for `owner`. The database has an owner-specific soft-delete policy in `db/migrations/0002_organizations.sql:212`, but the route layer often gates destructive or ownership-sensitive operations on `admin+`.

Examples:

- `app/api/org/[orgId]/route.ts:88` documents org deletion as admin-only and checks `is_org_admin` at `app/api/org/[orgId]/route.ts:94`.
- `app/api/org/[orgId]/members/route.ts:196` allows any admin to assign roles other than owner, including demoting owners if last-owner protection passes.
- `app/api/org/[orgId]/members/[userId]/route.ts:39` lets admin+ patch member roles, including owner rows except for last-owner protection.
- `app/api/org/[orgId]/members/[userId]/route.ts:108` lets admin+ remove members, including owners except for last-owner protection.

Impact: `admin` currently has more account/ownership authority than the desired model allows.

### P1: Builder Implementation Review Has No Separate Capability

The desired `implementation_reviewer` capability does not exist in the schema or app code. Builder implementation review/build/apply permissions currently collapse to org admin.

Examples:

- `app/api/org/[orgId]/builder/chat/route.ts:46`
- `app/api/org/[orgId]/builder/proposals/route.ts:26`
- `app/api/org/[orgId]/builder/proposals/[proposalId]/route.ts:28`
- `app/api/org/[orgId]/builder/proposals/[proposalId]/build/route.ts:29`
- `app/api/org/[orgId]/builder/proposals/[proposalId]/apply/route.ts:30`
- `db/migrations/0025_builder.sql:20` stores reviewer metadata but no reviewer authorization model.

Impact: Any org admin can access implementation/code-level Builder proposal actions. That is broader than the proposed model.

### P1: Builder And Platform Review Queues Are Linked From Org-Facing Surfaces

Org-facing dashboard/settings surfaces link to `/admin/builder`, which is an internal/platform route.

Examples:

- `app/api/org/[orgId]/dashboard/route.ts:492` adds a "Review Builder proposals" next action.
- `app/api/org/[orgId]/dashboard/route.ts:497` points that action at `/admin/builder`.
- `app/api/org/[orgId]/dashboard/route.ts:506` points "Configure the workspace" at `/admin/builder`.
- `components/settings/builder/ReviewReportCard.tsx:101` links "View full diff in admin" to `/admin/builder`.

Impact: This blurs org admin, implementation reviewer, and internal app admin. Org users should not be routed into platform admin queues.

### P2: Operational Write Access Is Inconsistent By Module

Some modules already match the desired `member+` operational-write model:

- `app/api/org/[orgId]/donors/route.ts:89`
- `app/api/org/[orgId]/contributions/route.ts:121`
- `app/api/org/[orgId]/pledges/route.ts:8`
- `db/migrations/0014_donors.sql:314`
- `db/migrations/0014_donors.sql:325`

Other operational modules still require `admin+`:

- `app/api/org/[orgId]/grants/route.ts:100`
- `app/api/org/[orgId]/grants/[grantId]/route.ts:123`
- `app/api/org/[orgId]/grants/[grantId]/transition/route.ts:41`
- `app/api/org/[orgId]/tasks/route.ts:205`
- `app/api/org/[orgId]/imports/route.ts:33`
- `db/migrations/0041_task_workflow_foundation.sql:760`
- `db/migrations/0018_import_system.sql:320`

Impact: "member" has different practical meaning depending on module. Grant/task/import workflows are not aligned with "operational read/write access inside configured workflows."

### P2: Raw Role Arrays Are Duplicated Across Routes And Components

Many routes define local arrays such as `ADMIN_ROLES`, `ALLOWED_ROLES`, `ALLOWED_DONOR_ROLES`, `validRoles`, and `ROLE_OPTIONS`.

Examples:

- `app/api/org/[orgId]/members/route.ts:7`
- `app/api/org/[orgId]/members/route.ts:97`
- `app/api/org/[orgId]/grants/route.ts:8`
- `app/api/org/[orgId]/tasks/route.ts:13`
- `app/api/org/[orgId]/modules/route.ts:15`
- `app/api/org/[orgId]/pledges/route.ts:8`
- `components/settings/MemberRow.tsx:21`

Impact: The product has no single source of truth for role hierarchy or capability meaning, making future permission changes risky.

### P2: Tests Encode Stale Permission Expectations

Several tests lock current behavior that conflicts with the desired model.

Examples:

- `app/api/__tests__/grants-list.test.ts:8` states grant POST requires `ADMIN_ROLES = {'owner', 'admin'}`.
- `app/api/__tests__/grants-list.test.ts:342` expects non-admin grant creation to fail.
- `app/api/__tests__/grants-transition.test.ts:6` states transitions require admin/owner.
- `app/api/__tests__/org-members.test.ts:240` expects owner assignment to be invalid in one member route.
- `tests/integration/org-routes.auth.test.ts:384` locks Builder routes around `is_org_admin`.

Impact: Tests will need to be updated alongside the canonical role model, or they will preserve stale assumptions.

## Proposed Canonical Helper API

Replace `lib/organizations/roles.ts` with a canonical helper module used by app routes, components, schemas, and tests.

```ts
export const ORG_ROLES = ['viewer', 'member', 'admin', 'owner'] as const;
export type OrgRole = typeof ORG_ROLES[number];

export type OrgCapability = 'implementation_reviewer';

export function isOrgRole(value: unknown): value is OrgRole;
export function roleGte(role: OrgRole | null | undefined, min: OrgRole): boolean;

export function canViewOrg(role: OrgRole | null | undefined): boolean;          // viewer+
export function canOperateOrg(role: OrgRole | null | undefined): boolean;       // member+
export function canManageWorkspace(role: OrgRole | null | undefined): boolean;  // admin+
export function canManageOwnership(role: OrgRole | null | undefined): boolean;  // owner

export function canReviewImplementation(input: {
  role: OrgRole | null | undefined;
  capabilities: OrgCapability[];
  isAppAdmin?: boolean;
}): boolean;
```

Recommended route helpers:

```ts
requireOrgRole(orgId, 'viewer');
requireOrgRole(orgId, 'member');
requireOrgRole(orgId, 'admin');
requireOrgOwner(orgId);
requireAppAdmin();
requireOrgCapability(orgId, 'implementation_reviewer');
```

Recommended naming:

- Use `isAppAdmin` only for platform/internal access.
- Use `isOrgAdmin` only for customer org `admin+`.
- Use `canOperateOrg` for `member+` workflow writes.
- Use `canManageWorkspace` for Builder/configuration changes.
- Use `canManageOwnership` for owner-only destructive/account controls.

## Suggested Data-Model Changes

The base `member_role_enum` does not need to change.

Add an org member capability table for non-role permissions:

```sql
CREATE TABLE public.organization_member_capabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capability text NOT NULL CHECK (capability IN ('implementation_reviewer')),
  granted_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id, capability)
);
```

Add a trigger or checked RPC path that only grants `implementation_reviewer` when the grantee is currently `admin` or `owner`. Keep this as a capability rather than an enum role, because it is additive and narrower than customer org role membership.

## Phased Implementation Plan

### Phase 1: Establish Shared Role Vocabulary

- Replace `lib/organizations/roles.ts` with canonical role constants, role ranking, and helper predicates.
- Re-export or consolidate `lib/types/org.ts` role types from the canonical helper.
- Replace active `editor` UI/API usage with `member`.
- Keep tests that assert `editor` is rejected.

### Phase 2: Normalize Platform Admin Access

- Replace `profiles.is_super_admin` checks with `requireAppAdmin()` or `is_app_admin()`.
- Update `/admin/builder` and `app/api/admin/builder/**`.
- Update stale helper comments in `lib/admin-auth.ts`.

### Phase 3: Split Customer Roles From Capabilities

- Add `organization_member_capabilities`.
- Add `requireOrgCapability(orgId, 'implementation_reviewer')`.
- Gate Builder implementation review/build/apply routes with `implementation_reviewer` or app admin.
- Keep general Builder configuration access at `admin+`.

### Phase 4: Reclassify Route Permissions

- Viewer: read-only org views and non-sensitive aggregates.
- Member: donor/contribution/pledge/grant/task operational writes inside configured workflows.
- Admin: modules, workflow configuration, custom field definitions, automations, integrations, imports if classified as workspace configuration.
- Owner: org deletion, ownership transfer, last-owner changes, account/destructive controls.
- App admin: platform admin routes, cross-org tools, internal queues.

### Phase 5: Align RLS With Route Semantics

- Update operational table policies from `is_org_admin` to `can_edit_org` where member writes are intended.
- Keep configuration tables on `is_org_admin`.
- Add owner-specific policies or RPC guards for destructive org/account operations.
- Keep service-role policies explicit and narrow.

### Phase 6: Update Tests And Contracts

- Add role-boundary tests for viewer/member/admin/owner across org routes.
- Add implementation reviewer tests for Builder proposal review/build/apply.
- Update grant/task tests that currently assert admin-only operational writes.
- Update contract tests that require `ADMIN_ROLES` or raw role arrays, replacing them with canonical helper expectations.

## Open Decisions

- Should imports be considered operational data work (`member+`) or workspace configuration (`admin+`)? Current implementation treats import jobs as admin-only, while report uploads use `can_edit_org`.
- Should org admins be allowed to grant `implementation_reviewer`, or should only owners assign that capability?
- Should admins be able to demote/remove non-last owners, or should all owner role changes be owner-only?
