# Migration & Test Suite Audit — Benevolence impact-viz-mvp

**Codebase:** `/home/node/.openclaw/workspace/Benevolence/impact-viz-mvp/`
**Date:** 2026-04-02
**Auditor:** Claude QA Agent (claude-sonnet-4-6)
**Scope:** All migration files `db/0001_*` – `db/0051_*` plus `db/012_roles_and_policies.sql`; full test suite via `vitest --run`.

---

## Migration Issues

### Critical

#### C-01: Hardcoded Supabase JWT and Production URL in Migration
**File:** `db/0012_schedule_news_fetch.sql`

A real Supabase `anon` JWT and the production project URL are embedded in a pg_cron SQL migration:

```
https://avqsnmsdrdtervserwar.supabase.co
eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImF2cXNubXNkcmR0ZXJ2c2Vyd2FyIiwicm9sZSI6ImFub24i...
```

This token is committed to version control. Any developer with repo access—or anyone who has ever cloned the repo—can use this token to call the production Supabase REST API. The anon role may expose data depending on RLS policy breadth. **The token must be rotated immediately and removed from git history.**

---

### C-02: pnpm Lockfile Out of Sync — CI `pnpm install --frozen-lockfile` Fails
**Files:** `package.json`, `pnpm-lock.yaml`

The `pnpm-lock.yaml` file was out of sync with `package.json` at the time of audit. Two packages added for the QuickBooks integration (`intuit-oauth@^4.2.2`, `node-quickbooks@^2.0.50`) were present in `package.json` but absent from the lockfile. Running `pnpm install --frozen-lockfile` (the standard CI command) fails with `ERR_PNPM_OUTDATED_LOCKFILE`. This was fixed during audit by running `pnpm install --no-frozen-lockfile`. The regenerated lockfile must be committed to unblock CI.

---

### C-03: Duplicate Prefix Collisions — Multiple Migrations Share the Same Number
Running these as an ordered sequence is undefined:

| Prefix | Files |
|--------|-------|
| `0006` | `0006_holding_contributions_policies.sql`, `0006_holding_contributions_policies_simple.sql` |
| `0011` | `0011_ensure_staging_table.sql`, `0011_replace_staging_view_with_table.sql` |
| `0012` | `0012_add_holding_website.sql`, `0012_ai_portfolio_manager.sql`, `0012_schedule_news_fetch.sql` |
| `0013` | `0013_portfolio_recommendations.sql`, `0013_tax_tracking.sql` |
| `0022` | `0022_create_v_holdings_view.sql`, `0022_tax_enhancements.sql` |
| `0025` | `0025_recommendation_favorites.sql`, `0025_update_tax_validation_for_enhanced_types.sql` |
| `0026` | `0026_phase1_agi_donor_tracking.sql`, `0026_recommendation_comments.sql` |
| `0027` | `0027_phase1_tax_calculations_view.sql`, `0027_recommendation_status_tracking.sql` |

For the `0011` collision, the schemas are **mutually incompatible**:
- `0011_ensure_staging_table.sql`: uses `BIGINT GENERATED ALWAYS AS IDENTITY` PK
- `0011_replace_staging_view_with_table.sql`: uses `UUID DEFAULT gen_random_uuid()` PK, adds `investee_id`, `holding_id`, `metric_code` FK columns, `approved`, `reviewed_by`

Whichever runs second will fail or silently override the first. There is no migration runner configuration visible in the repo to clarify which file takes precedence.

**Migration gap:** There is no `0049_*.sql`; the sequence jumps from `0048` to `0050`.

---

### C-03: `get_top_kpis_per_holding` Dangling Reference After `kpi_definitions` Drop
**Files:** `db/0037_map_top_kpis_function.sql`, `db/0042_drop_kpi_definitions.sql`

`0037` creates `get_top_kpis_per_holding()` with a `LEFT JOIN kpi_definitions kd ON ...`. Migration `0042` then runs `DROP TABLE kpi_definitions CASCADE`. The function in `0037` is not updated or dropped in `0042`—only `get_portfolio_latest_kpis_sum` is updated. After a fresh migration run, calling `get_top_kpis_per_holding()` will throw `ERROR: relation "kpi_definitions" does not exist`.

---

### C-04: Non-Standard Migration Filename Outside Sequence
**File:** `db/012_roles_and_policies.sql`

This file has no leading zero (`012` vs `0012`). It is referenced by at minimum `0006_holding_contributions_policies.sql`, `0008_holding_widgets.sql`, `0012_ai_portfolio_manager.sql`, and `0019_grant_management.sql` (all call `can_edit_portfolio()` which is defined here). If a migration runner orders files lexicographically, `012_roles_and_policies.sql` sorts **after** `0019_grant_management.sql` (because `'0' < '0'` but `'01' < '01'... '012' > '0019'` in ASCII order), causing those migrations to fail with "function does not exist."

---

### C-05: `is_admin()` Function Referenced But Never Defined
**File:** `db/012_roles_and_policies.sql`

The `can_edit_portfolio()` helper function (used by RLS policies across holdings, holding_contributions, widgets, grants, and more) calls `public.is_admin()`. No migration file in the entire `db/` directory defines this function. At runtime, any operation that triggers an RLS policy backed by `can_edit_portfolio()` will throw:

```
ERROR: function is_admin() does not exist
```

This makes the admin bypass path of the access control system completely broken in production.

---

### C-06: Invalid FK `REFERENCES profiles(id)` in `0047_import_system.sql`
**File:** `db/0047_import_system.sql`

The `staging_import_users` table is created with a foreign key `REFERENCES profiles(id)`. However, the `profiles` table (defined in the context-only `0002_current.sql`) uses `user_id uuid` as its primary key — not `id`. This FK constraint references a non-existent column and will cause the CREATE TABLE statement to fail with:

```
ERROR: there is no unique constraint matching given keys for referenced table "profiles"
```

The entire migration `0047_import_system.sql` (which creates all 10 import-system tables) fails at this line, leaving the import system completely unprovisioned.

---

### C-07: Core Application Tables Have No Runnable CREATE TABLE Migration
**File:** `db/0002_current.sql`

The following tables are declared only in `0002_current.sql`, which is explicitly marked "WARNING: This schema is for context only and is not meant to be run":

- `admins`, `portfolios`, `portfolio_members`, `profiles`
- `investees`, `metrics`, `metric_facts`
- `holding_contributions` (aside from RLS policies added later)
- `kpi_definitions`, `sdg_mapping`, `targets`, `widgets`

No other numbered migration file creates these tables. On a fresh database, running the numbered migrations (0001–0051) in sequence will skip all of the above. The application cannot function without `portfolios`, `portfolio_members`, and `profiles`.

**The effective schema baseline is undocumented and cannot be reproduced from migrations alone.**

---

## High

### H-01: Development-Only "Allow All" RLS Policies Committed
**File:** `db/0006_holding_contributions_policies_simple.sql`

Creates two policies on `holding_contributions`:
- `holding_contributions_all_anon`: `FOR ALL TO anon USING (true)` — explicitly named "for development" in comments; grants full unauthenticated read/write
- `holding_contributions_all_authenticated`: `FOR ALL TO authenticated USING (true)` — no portfolio scoping, any authenticated user can read/write all contributions

These policies are committed alongside the correct scoped policies in `0006_holding_contributions_policies.sql`. If both files run, the permissive policies take precedence (PostgreSQL ORs all applicable policies).

---

### H-02: `cpa_access_logs_insert_any` — Unauthenticated Audit Log Injection
**File:** `db/0028_cpa_collaboration.sql`

```sql
CREATE POLICY "cpa_access_logs_insert_any"
  ON cpa_access_logs FOR INSERT WITH CHECK (true);
```

Any role—including `anon`—can insert rows into the `cpa_access_logs` audit table. This allows log poisoning and audit trail corruption without authentication.

---

### H-03: `cpa_share_links_public_view_by_token` Exposes Share Links to Any Role
**File:** `db/0028_cpa_collaboration.sql`

```sql
CREATE POLICY "cpa_share_links_public_view_by_token"
  ON cpa_share_links FOR SELECT
  USING (share_token IS NOT NULL AND revoked_at IS NULL AND expires_at > NOW());
```

No `TO authenticated` clause — applies to `anon`. An unauthenticated actor who knows (or guesses) a valid token can enumerate live share links.

---

### H-04: `uuid_generate_v4()` Used Without Enabling `uuid-ossp` Extension
**Files:** `db/0018_investment_tracking.sql`, `db/0019_grant_management.sql`

Both files call `uuid_generate_v4()` as a column default. The `uuid-ossp` extension is never explicitly enabled in any migration file in this repo. On a fresh Supabase project the extension is auto-enabled, but this is an implicit dependency. If the extension is disabled or the schema runs outside Supabase, both migrations will fail. `gen_random_uuid()` (built-in since PG 13) should be used instead for consistency—it is already used in newer migrations.

---

### H-05: `0001_init.sql` — All RLS Policies Use `USING (true)` (No Auth Check)
**File:** `db/0001_init.sql`

Four tables (`uploads`, `staging_metric_facts`, `holdings`, `holding_facts`) have RLS enabled with policies using bare `USING (true)`:
```sql
CREATE POLICY "Allow all" ON uploads FOR ALL USING (true);
```
These were presumably bootstrap policies, but if this migration was applied to production and later migrations only added new policies (rather than replacing these), the `USING (true)` policies still apply and override scoped policies via OR logic.

Additionally, `0001` attempts `CREATE POLICY ... ON v_portfolio_latest` which is a VIEW—policy creation on views is deprecated and will silently fail or error on modern PostgreSQL versions.

---

### H-06: Migration `0002_current.sql` Is Non-Executable Documentation
**File:** `db/0002_current.sql`

Header reads: `-- WARNING: This schema is for context only and is not meant to be run.`

Despite this, the file sits in the `db/` migrations directory with valid SQL `CREATE TABLE` statements. If any migration runner that does not skip this file runs it, it will conflict with tables created by other migrations. It must be moved out of `db/` or renamed with a non-SQL extension (e.g., `.sql.bak`).

---

### H-07: Index Created Without `IF NOT EXISTS` in `0022_tax_enhancements.sql`
**File:** `db/0022_tax_enhancements.sql`

```sql
CREATE INDEX idx_tax_contributions_qcd ON tax_contributions(qcd_qualified);
```

No `IF NOT EXISTS`. Migration `0024_enhanced_tax_fields.sql` also references `qcd_qualified` and adds the same index WITH `IF NOT EXISTS`. Running `0022` twice will throw `ERROR: relation "idx_tax_contributions_qcd" already exists`. Additionally, both 0022 and 0024 add the `qcd_qualified` column, making 0024 an implicit supersede of 0022.

---

## Low

### L-01: Storage Bucket Policies Not Idempotent
**File:** `db/0007_storage_bucket.sql`

Creates 4 storage policies using `CREATE POLICY` (no `DROP ... IF EXISTS` guards and no `CREATE POLICY IF NOT EXISTS` — this syntax does not exist in PostgreSQL). Re-running this migration will fail with duplicate policy name errors. All other policy-creating migrations (0006, 0019, 0028, etc.) use `DROP POLICY IF EXISTS` guards first.

---

### L-02: Seed / Default Data Embedded in Migration
**Files:** `db/0047_import_system.sql`, `db/0033_backfill_charities_from_recommendations.sql`

`0047` inserts a default "Blackbaud RE NXT Standard" field-mapping profile at migration time. `0033` is a one-time backfill migration that copies data from `portfolio_recommendations` into `charities`. Embedding data mutations in schema migrations creates problems for:
- CI environments with empty databases (0033 inserts 0 rows silently, which is fine, but the intent is unclear)
- Idempotency: re-running 0047 will violate a unique constraint on `name` for the Blackbaud profile

---

### L-03: Orphaned Utility Files in `db/`
The following files in `db/` are not sequential migrations and have no guard to prevent accidental execution:
- `demo_data.sql` / `demo_data.sql.bak`
- `fix_donation_validation.sql`
- `fix_metric_codes_uppercase.sql`
- `test_map_data.sql`
- `update_demo_metrics_timeseries.sql`
- `MIGRATION_GUIDE_0039-0043.md` (not SQL, but lives alongside SQL files)

These should be moved to a `db/scripts/` or `db/dev/` subdirectory.

---

### L-04: Missing Migration `0049`
The sequence jumps from `0048_import_jobs_heartbeat.sql` to `0050_report_templates.sql`. No `0049_*.sql` file exists. This may indicate a dropped or abandoned migration. If a migration runner validates sequence continuity it will halt here.

---

## Informational

### I-01: `kpi_definitions` Table Full Lifecycle
- Created as part of the context-only `0002_current.sql`
- Referenced by `0003_kpi_aggregation.sql` (aggregation logic)
- Migrated/emptied in `0039_portfolio_metric_targets.sql` and `0040_migrate_kpi_definitions_data.sql`
- Dropped in `0042_drop_kpi_definitions.sql` (CASCADE)
- Dangling reference in `0037_map_top_kpis_function.sql` (see C-04)

### I-02: `asset_type_enum` Evolution
- `0017_asset_type_enum.sql`: renames `holdings.asset_class` → `asset_type_text` → drops it, adds `asset_type asset_type_enum`
- `0023_enhanced_asset_types.sql`: adds more values to the enum

Column renames are done with `ALTER TABLE ... RENAME COLUMN` (non-destructive), but if 0017 is re-run after 0023 has already added the enum, the `DROP COLUMN` on a missing column will fail.

### I-03: pg_cron Extension Assumed Available
`0012_schedule_news_fetch.sql` calls `cron.schedule(...)`. The `pg_cron` extension is not enabled in any migration. On non-Supabase PostgreSQL instances this will fail at runtime. The extension assumption is undocumented.

### I-04: SECURITY DEFINER Functions
`db/0048_import_jobs_heartbeat.sql` creates `mark_stale_import_jobs()` as `SECURITY DEFINER`. This is appropriate here (it needs elevated access to update jobs), but the function is granted `EXECUTE` only to `service_role`, which is correct. No other SECURITY DEFINER functions were found with overly broad grants.

---

## RLS Coverage Table

| Table | RLS Enabled | Policies Present | Policy Quality |
|-------|-------------|-----------------|----------------|
| `uploads` | Yes (0001) | `USING (true)` for all roles | No auth — permissive |
| `staging_metric_facts` | Yes (0001/0011) | `USING (true)` bootstrap; 0011 adds better policies | Mixed; old permissive still applies |
| `holdings` | Yes (0001/012) | 0001 `USING (true)`; 012 adds `can_edit_portfolio()` scoped policies | Mixed |
| `holding_facts` | Yes (0001) | `USING (true)` | No auth — permissive |
| `holding_contributions` | Yes (0006) | Scoped via `can_edit_portfolio()` | Good (0006 proper) |
| `holding_contributions` (dev) | Yes | `USING (true)` for anon + authenticated | **Dev-only policy committed** |
| `portfolio_members` | Yes (012) | Scoped by `user_id = auth.uid()` | Good |
| `portfolios` | Yes (012) | Scoped via `can_edit_portfolio()` | Good |
| `grants` | Yes (0019) | Scoped via `can_edit_portfolio()` | Good |
| `tax_contributions` | Yes (0013) | Scoped per portfolio member | Good |
| `cpa_share_links` | Yes (0028) | One policy: token + expiry (no auth check) | Overly permissive for anon |
| `cpa_access_logs` | Yes (0028) | INSERT `WITH CHECK (true)` | **Anyone can insert** |
| `charities` | Yes (0030) | SELECT for authenticated; INSERT/UPDATE admin only | Good |
| `import_jobs` | Yes (0047) | Scoped per portfolio member | Good |
| `quickbooks_connections` | Yes (0051) | Scoped per portfolio member | Good |
| `qb_accounts` | Yes (0051) | Scoped per portfolio member | Good |
| `report_templates` | Yes (0050) | Scoped per portfolio member | Good |
| `generated_letters` | Yes (0044) | Scoped per portfolio member | Good |
| `news_articles` | Yes (0010) | SELECT for authenticated; no write policy visible | Possible missing write policies |
| `widgets` | Yes (0008) | Scoped via `can_edit_portfolio()` | Good |
| `investees` | Not confirmed | Not found in scanned migrations | **RLS status unknown** |
| `metrics` / `metric_facts` | Not confirmed | Not found in scanned migrations | **RLS status unknown** |
| `profiles` | Not confirmed | Not found in scanned migrations | **RLS status unknown** |

---

## Test Suite Health

### Summary

| Metric | Count |
|--------|-------|
| Total test suites | 8 |
| Passing suites | 8 |
| Failing suites | 0 |
| Total tests | 141 |
| Tests passing | 141 |
| Tests failing | 0 |
| Duration | ~6–10s |

All 8 suites and 141 tests pass as of 2026-04-02 (`vitest run` via pnpm virtual store binary).

### Passing Suites

| Suite | File | Tests |
|-------|------|-------|
| Admin Schemas | `lib/schemas/admin.test.ts` | 7 |
| AI Schemas | `lib/schemas/ai.test.ts` | 12 |
| Portfolio Schemas | `lib/schemas/portfolio.test.ts` | (included in total) |
| Recommendations Schemas | `lib/schemas/recommendations.test.ts` | 12 |
| Profile Schemas | `lib/schemas/profile.test.ts` | 10 |
| Tax Scenario Calculator | `lib/tax/scenario-calculator.test.ts` | (included in total) |
| Import Validator | `lib/import/validator.test.ts` | 28 |
| Import Performance | `lib/import/__tests__/performance.test.ts` | 1 (1000 rows in ~11ms; 90k rows/sec) |

### Test Content Review

All test files contain substantive, production-quality assertions. No stub or placeholder tests were found.

**`lib/schemas/admin.test.ts`** — Zod schema validation for admin entities. Covers required fields, enum constraints, UUID format rules.

**`lib/schemas/ai.test.ts`** — Zod schema for AI portfolio manager payloads. Covers field constraints, nested object validation, and UUID checks.

**`lib/schemas/portfolio.test.ts`** — Portfolio creation/update schema. Covers required names, numeric range checks, and optional fields.

**`lib/schemas/recommendations.test.ts`** — Recommendation schema with charity linking fields. Covers required vs optional fields, URL validation, and numeric constraints.

**`lib/schemas/profile.test.ts`** — User profile schema. Covers max lengths, optional fields, and password change validation.

**`lib/tax/scenario-calculator.test.ts`** — Tax scenario calculation logic (AGI tiers, DAF deduction caps, QCD eligibility). Pure numeric logic with `toBe`/`toBeCloseTo` assertions.

**`lib/import/validator.test.ts`** — Tests `validateTransformedRow()` for all defined rules: `required`, `positive`, `date_valid`, `date_not_future`, `ein_format`, `contribution_type_valid`, `amount_reasonable`. Also covers `holdings`, `investees`, and `metrics` entity schemas. 28 test cases.

**`lib/import/__tests__/performance.test.ts`** — Smoke test: transforms and validates 1000 contribution rows and asserts completion in under 30 seconds. Actual: ~11ms (90,909 rows/sec).

### Coverage Gaps

1. **No API route tests** — `app/api/` has no test files. OAuth flow (`/api/quickbooks/callback`), import job processing, and PDF generation are untested.
2. **No UI component tests** — `components/` and `app/` have no test files.
3. **No database integration tests** — All tests are unit-level with no Supabase client mocking or integration harness.
4. **No migration regression tests** — No automated check that migrations apply cleanly in sequence on a fresh schema.
5. **`vitest.setup.ts` imports `@testing-library/react` and `@testing-library/jest-dom`** — no current test file uses React Testing Library directly. The setup file dependency is unnecessary overhead; if the packages are ever removed, all suites will fail at setup.
