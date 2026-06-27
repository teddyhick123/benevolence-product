# Schema / Code Alignment Sweep

**Date:** 2026-05-13
**Scope:** Active application code against deployable database migrations in `db/migrations`.

## Executive Summary

The codebase and deployable database schema are not fully aligned. The largest risk is that several runtime paths still reference tables, views, RPCs, and column names that exist only in legacy root-level SQL files or older designs, while `db/migrations/README.md` identifies `db/migrations` as the single source of truth and marks root-level SQL as stale.

This is bigger than pledge tracking. Pledge-specific issues were fixed, but a clean deploy from `db/migrations` would still leave major routes, AI tools, admin/import flows, grants, compliance, tax, and reporting code pointing at missing objects.

## Method

- Parsed active migration objects from `db/migrations/*.sql`.
- Compared application `.from(...)` and `.rpc(...)` usage across `app`, `components`, `contexts`, and `lib`.
- Excluded `.claude`, `.next`, `node_modules`, `templates`, and generated graph output.
- Confirmed the highest-risk mismatches with targeted `rg` searches against active migrations.

This sweep is intentionally conservative: dynamic table names, storage bucket names, and normalized API response fields can create false positives. The findings below are the confirmed product risks.

## Confirmed Alignment Gaps

### 1. Active Migrations Do Not Match Runtime Expectations

Root-level SQL appears to contain schema that active code expects, but those files are documented as stale and must not be run directly. Examples:

- `organization_holdings` is heavily used by org dashboard, AI, imports, maps, and admin data flows, but is not created by active migrations.
- `org_role` is called throughout org-scoped APIs and pages, but active migrations define related helpers such as `user_org_role`, `org_role_gte`, and `can_view_org` instead.
- Compliance objects such as `compliance_profiles`, `disqualified_persons`, `v_compliance_dashboard`, and `v_upcoming_filing_deadlines` are referenced by code but not created in active migrations.

Recommended direction: either fold the needed legacy schema into active migrations, or rewrite callers to the active schema. Leaving both worlds half-present will keep producing clean-database failures.

### 2. Organization Membership Is Split Between `org_id` and `organization_id`

Active org membership schema uses `organization_members.org_id`. Some code still selects or filters `organization_members.organization_id`.

Representative locations:

- `app/api/me/route.ts`
- `app/api/ai/chat/route.ts`
- `app/api/ai/chat-v2/route.ts`
- Several org/dashboard page loaders

Impact: authenticated users can appear to have no organization, causing incorrect redirects, empty dashboards, or unauthorized responses.

### 3. Organization Holdings Are Referenced But Not Created

The application still treats `organization_holdings` as a canonical table. Active migrations do not create it.

Representative locations:

- `app/org/[orgId]/page.tsx`
- `app/api/org/[orgId]/holdings/route.ts`
- `app/api/admin/organizations/[orgId]/data/route.ts`
- `lib/ai/action-executor.ts`
- `lib/claude-assistant.ts`

Impact: core org dashboard and holdings flows can fail on clean database deployments.

### 4. Grant Lifecycle Code Expects Tables The Active Grant Migration Does Not Provide

Active `0009_grants.sql` creates `grants` and `grant_reports`. The product code expects a richer lifecycle schema:

- `grant_details`
- `grant_milestones`
- `grant_payments`
- `grant_budget_items`
- `grant_documents`
- `grant_communications`
- grant workflow tables and health views

Impact: grant detail, payment, milestone, budget, document, communication, and health routes are structurally ahead of the deployable DB.

### 5. Compliance Code Expects A Rich Compliance Schema That Is Not Active

Active compliance migrations create `filing_calendar` and `state_registrations`. Runtime code expects additional compliance tables and views:

- `compliance_profiles`
- `disqualified_persons`
- `self_dealing_incidents`
- `qualifying_distributions`
- `expenditure_responsibility_grants`
- `v_compliance_dashboard`
- `v_upcoming_filing_deadlines`
- `v_er_grant_compliance`

Impact: compliance dashboard and foundation/private foundation workflows are not clean-deployable from the active schema.

### 6. Donor CRM Still Has Legacy Schema Drift

The earlier pledge fixes aligned pledge payment behavior with canonical contributions, but several older donor pages/components still reference legacy donor and contribution names:

- `organization_id` where donor tables use `org_id`
- `donor_type` where donors use `is_organization`
- `contribution_type` where contributions use `gift_type`
- `receipt_status` / receipt-number RPC assumptions that are not part of the active canonical migration

Representative locations:

- `components/donors/DonorList.tsx`
- `components/donors/ContributionForm.tsx`
- `components/donors/DonorDetail.tsx`
- `components/donors/ReceiptGenerator.tsx`
- `app/org/[orgId]/contributions/page.tsx`
- `app/org/[orgId]/receipts/page.tsx`
- `lib/claude-assistant.ts`

Impact: donor pages can render incomplete data or fail queries, and the AI assistant can write/read incompatible donor fields.

### 7. Tax, Reporting, Import, And Metric Compatibility Objects Are Missing

Multiple feature areas reference compatibility tables/views/RPCs that are not present in active migrations.

Examples:

- Tax: `tax_years`, `tax_profiles`, `tax_carryforwards`, `v_active_carryforwards`, `v_tax_contributions_enriched`
- Reporting: `generated_documents`, `report_templates`, `report_schedules`, `generate_share_token`
- Import/admin: `imports`, `import_ai_suggestions`, `import_audit_log`, `staging_import_*`, `mark_stale_import_jobs`
- Metrics/dashboard: `metrics`, `portfolio_metric_targets`, `v_portfolio_kpi_series`, `get_portfolio_latest_kpis_sum`

Impact: these modules may pass lint while still being undeployable against the documented schema.

### 8. RPC Usage Is Not Aligned With Active Functions

Confirmed missing or mismatched RPC references include:

- `org_role`
- `is_admin`
- `generate_receipt_number`
- `role_for_portfolio`
- `can_modify_portfolio`
- `generate_share_token`
- `sum_contribution_amounts`
- `get_upcoming_deadlines`
- `generate_risk_snapshot`

Impact: routes relying on these helpers can fail even if their table names are otherwise correct.

### 9. Module Key Namespace Mismatch — `reporting` vs `reports`

The TypeScript module registry (`lib/modules/registry.ts`) uses `reporting` as the module ID. The database `module_definitions` table and `organizations.modules` JSONB use `reports`. The `org_has_module` function updated in `0038_pledge_tracking.sql` added aliases for four long→short mappings (`pledge_tracking`, `donor_management`, `tax_optimization`, `compliance_regulatory`) but not for `reporting` → `reports`.

Any code that calls `org_has_module(orgId, 'reporting')` — whether in RLS policies or API routes — silently returns false, making the reporting module appear disabled for all orgs. TypeScript `core` → DB `portfolio` has the same nominal mismatch, though `core` is always enabled so the practical impact is lower.

Impact: reporting module inaccessible on a clean database; future module additions will reproduce this bug unless the alias table is the authoritative mapping and developers know to update it.

### 10. `CLAUDE.md` Agent Instructions Teach Wrong Patterns

`CLAUDE.md` is loaded into context for every coding agent session. It currently contains several patterns that contradict the active schema, meaning every agent working from the template will generate broken code:

- **`is_org_member` documented** — this function does not exist. The correct function is `can_view_org(p_org_id)`.
- **`org_role` documented** — this function does not exist. The correct function is `user_org_role(p_org_id)`.
- **Template migration uses `organization_id`** — all active tables use `org_id` as the FK column name. The template at lines 144–167 and the Common Columns section at line 472 both teach agents to create columns that won't match.
- **Template TypeScript queries `organization_members.organization_id`** — the table column is `org_id`. The template page and component examples (lines 297, 370, 379) generate queries that will always return no rows.
- **Migration path listed as `/db/NNNN_description.sql`** — the correct location is `/db/migrations/NNNN_description.sql`.
- **`p_module_id` used instead of `p_module`** — the `org_has_module` function parameter is `p_module`, but the CLAUDE.md template and at least one production route (`app/api/org/[orgId]/compliance/dashboard/route.ts`) call it with `p_module_id`, which silently passes a null and returns false.
- **No declaration that `db/migrations` is the single source of truth** — agents have no authoritative statement telling them to ignore root-level SQL files.

Impact: every new module, route, or component scaffolded from `CLAUDE.md` templates is born broken. This gap multiplies the cost of every other gap on this list.

## Recommended Fix Order

**Decision recorded:** `db/migrations` is the single source of truth for all deployable schema. Root-level SQL files are stale and must not be run directly or treated as authoritative.

1. **Fix `CLAUDE.md` first.** Correct the function names, column names, migration path, and add an explicit schema canon statement. This stops the bleeding — every future agent task will use correct patterns.
2. **Fix org identity/access.** Align `organization_members` queries (`org_id` not `organization_id`), replace `org_role` RPC calls with `user_org_role`, replace `is_org_member` calls with `can_view_org`, and either add `organization_holdings` to active migrations or remove it from runtime code.
3. **Finish donor CRM schema migration.** Convert remaining donor pages/components/AI tools from `organization_id`, `donor_type`, `contribution_type`, `receipt_status` to the canonical `donors` and `contributions_received` fields.
4. **Fix module key namespace.** Add the missing `reporting → reports` alias to `org_has_module`, audit all module key usages for similar gaps, and add `core → portfolio` alias.
5. **Decide grant/compliance product scope.** Either add the lifecycle/compliance migrations that match the code, or reduce UI/API surfaces to the simpler active schema.
6. **Add a DB contract check.** CI should fail when non-dynamic `.from()` or `.rpc()` calls reference objects not created by active migrations, with an allowlist for storage buckets and intentional external RPCs.
7. **Add a clean DB smoke test.** Run active migrations, then hit representative org, donor, grant, compliance, reporting, import, and AI routes.

## Product Judgment

The product direction is strong, but the implementation is currently split across eras of the schema. The most urgent fix is not a migration — it is updating the instructions agents read so they stop generating misaligned code. Once `CLAUDE.md` is correct, every task that follows builds on solid ground. Once a clean database can boot every enabled module without missing-object errors, the richer pledge, donor, grant, compliance, and AI experiences will be much easier to trust.
