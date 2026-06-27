# Import System Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Align the active DB schema, TypeScript types, and all application code so the AI-native import pipeline works end-to-end without runtime failures caused by stale column names, non-existent enum values, or missing staging tables.

**Architecture:** Rewrite `0018_import_system.sql` from scratch (prerelease — no backward-compat needed), extend the `import_status_enum` in `0001`, add per-entity staging tables, then sweep every TypeScript file that touches import state to match. The commit route becomes the sole production-load path; the stale `/load` route is deleted.

**Tech Stack:** PostgreSQL 15, Supabase RLS, Next.js App Router API routes, TypeScript, Vitest.

---

## Concrete bugs this plan fixes

| Bug | Where | Symptom |
|-----|-------|---------|
| `'running'`, `'paused'` not in DB enum | `job-queue.ts`, `load/route.ts`, `rollback.ts` | Postgres rejects the write at runtime |
| `pause_reason` column doesn't exist in `import_jobs` | 6 files | Silent no-op; error state never persisted |
| `last_heartbeat_at` column doesn't exist | `job-queue.ts` | Write silently dropped |
| Per-entity staging tables missing from active migrations | all of `loader.ts` | Every load query returns "relation does not exist" |
| `import_mapping_profiles` has `field_mappings` + `entity_type`; TS type uses `entity_mappings` | `etl-runner.ts`, mapping UI | Profile reads always have `entity_mappings: undefined` |
| `import_jobs` has `source_system`; TS type inserts `source_type` | create route | Column silently dropped on insert |
| `import_jobs` has `entity_type`, `total_rows`, `processed_rows`; TS type has `total_records_extracted`, `records_loaded`, `records_failed` | loader, producer | Counter updates write to wrong/missing columns |
| `'rolled_back'` not in DB enum | `rollback.ts` | Rollback status update rejected at runtime |
| `staging_import_users` referenced everywhere; v1 defers users import | loader, rollback, create route | Dead code + wrong scopes |
| Commit route accepts `needs_review` (skips approval gate) | `commit/route.ts` | Human review bypassed |

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `db/migrations/0001_extensions_and_shared_infra.sql` | Modify | Add `committing`, `rolled_back` to `import_status_enum` |
| `db/migrations/0018_import_system.sql` | **Rewrite** | Canonical import schema: mapping profiles, jobs, 5 per-entity staging tables |
| `db/migrations/0031_staging_cleanup.sql` | Modify | Purge per-entity staging tables in addition to `staging_import_rows` |
| `lib/import/types.ts` | Modify | Canonical TS types matching new schema |
| `lib/import/loader.ts` | Modify | Remove `users` phase, add `donors` phase, fix counter column names |
| `lib/import/job-queue.ts` | Modify | `running`→`processing`, `paused`→`needs_review`, remove `pause_reason` |
| `lib/import/rollback.ts` | Modify | Remove `users`, `paused`→`needs_review`, remove `pause_reason` |
| `app/api/admin/imports/route.ts` | Modify | Remove `users.csv`, add `donors.csv`→`donors`, require `org_id` |
| `app/api/admin/imports/[id]/commit/route.ts` | Modify | Accept only `approved`; use `committing` during load |
| `app/api/admin/imports/[id]/resume/route.ts` | Modify | `paused`→`needs_review`, remove `pause_reason` |
| `app/api/admin/imports/[id]/rollback/route.ts` | Modify | Remove `paused` from valid statuses, remove `users` from valid scopes |
| `app/api/admin/imports/[id]/reconciliation/route.ts` | Modify | Remove status mutation from POST (reconciliation is now read-only) |
| `app/api/admin/imports/[id]/load/route.ts` | **Delete** | Superseded by commit route |
| `lib/tasks/automation/producers/imports.ts` | Modify | Use `name` instead of `entity_type`, add `rolled_back` to cancel set |
| `lib/tasks/automation/__tests__/producers.imports.test.ts` | Modify | Replace `entity_type` with `name` in all mock fixtures |
| `app/api/admin/imports/__tests__/commit.test.ts` | Modify | Update assertions for `committing` status and `approved`-only gate |
| `lib/__tests__/task-automation-contract.test.ts` | Modify | Add import-specific schema and source-key contract assertions |

---

## Task 1: Extend `import_status_enum`

**Files:**
- Modify: `db/migrations/0001_extensions_and_shared_infra.sql`
- Modify: `lib/__tests__/task-automation-contract.test.ts`

- [ ] **Step 1: Write the failing contract test**

Add to the end of `lib/__tests__/task-automation-contract.test.ts`:

```typescript
// ---------------------------------------------------------------------------
// 13. Import status enum completeness
// ---------------------------------------------------------------------------
describe('Import status enum includes all required values', () => {
  const REQUIRED_IMPORT_STATUSES = [
    'pending',
    'processing',
    'needs_review',
    'approved',
    'committing',
    'completed',
    'failed',
    'rejected',
    'rolled_back',
  ];

  for (const status of REQUIRED_IMPORT_STATUSES) {
    it(`import_status_enum includes '${status}'`, () => {
      expect(migrations).toContain(`'${status}'`);
    });
  }
});

// ---------------------------------------------------------------------------
// 14. No stale import status values in app code
// ---------------------------------------------------------------------------
describe('No stale import status values in app code', () => {
  const jobQueueSrc = read('lib/import/job-queue.ts');
  const rollbackSrc = read('lib/import/rollback.ts');
  const loadRouteSrc = (() => {
    try { return read('app/api/admin/imports/[id]/load/route.ts'); } catch { return ''; }
  })();

  it('job-queue does not use stale running status', () => {
    expect(jobQueueSrc).not.toContain("'running'");
  });

  it('job-queue does not use stale paused status', () => {
    expect(jobQueueSrc).not.toContain("'paused'");
  });

  it('job-queue does not reference pause_reason column', () => {
    expect(jobQueueSrc).not.toContain('pause_reason');
  });

  it('load route is deleted (stale duplicate of commit route)', () => {
    expect(loadRouteSrc).toBe('');
  });

  it('rollback does not reference stale paused status', () => {
    expect(rollbackSrc).not.toContain("'paused'");
  });

  it('rollback does not reference pause_reason', () => {
    expect(rollbackSrc).not.toContain('pause_reason');
  });
});

// ---------------------------------------------------------------------------
// 15. Import producer uses canonical column names
// ---------------------------------------------------------------------------
describe('Import producer uses canonical column names', () => {
  it('import producer queries name not entity_type', () => {
    expect(importsSrc).not.toContain("'entity_type'");
    expect(importsSrc).toContain("'name'");
  });

  it('import producer cancels tasks for rolled_back jobs', () => {
    expect(importsSrc).toContain("'rolled_back'");
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx vitest run lib/__tests__/task-automation-contract.test.ts 2>&1 | tail -30
```

Expected: FAILs on `committing`, `rolled_back`, stale status checks, and `name` column.

- [ ] **Step 3: Extend `import_status_enum` in `0001`**

In `db/migrations/0001_extensions_and_shared_infra.sql`, find the `import_status_enum` definition and replace it:

```sql
CREATE TYPE import_status_enum AS ENUM (
  'pending',
  'processing',
  'needs_review',
  'approved',
  'committing',
  'rejected',
  'completed',
  'failed',
  'rolled_back'
);
```

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0001_extensions_and_shared_infra.sql lib/__tests__/task-automation-contract.test.ts
git commit -m "test(import): add contract tests for new enum values and canonical column names"
```

---

## Task 2: Rewrite `db/migrations/0018_import_system.sql`

**Files:**
- Rewrite: `db/migrations/0018_import_system.sql`

This is a complete ground-up rewrite. The old content is replaced entirely.

- [ ] **Step 1: Write the new migration**

Replace the entire content of `db/migrations/0018_import_system.sql` with:

```sql
-- =============================================================================
-- 0018_import_system.sql
-- AI-assisted import pipeline: mapping profiles, jobs, per-entity staging tables.
-- Depends on: 0001, 0002, 0004, 0005
-- =============================================================================

-- ---------------------------------------------------------------------------
-- import_mapping_profiles — reusable multi-entity field mapping configs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_mapping_profiles (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name            text NOT NULL,
  description     text,
  source_type     text,           -- 'blackbaud_re_nxt' | 'salesforce_npsp' | 'donorperfect' | 'custom_csv'

  -- Multi-entity mapping config: { "donors": { field_map: {...}, match_criteria: [...] }, "holdings": {...} }
  entity_mappings jsonb NOT NULL DEFAULT '{}',

  version         int NOT NULL DEFAULT 1,
  is_default      boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,

  created_by      uuid REFERENCES auth.users(id),

  UNIQUE (org_id, name)
);

CREATE INDEX idx_import_mapping_profiles_org_id ON import_mapping_profiles (org_id) WHERE is_active;

CREATE TRIGGER trg_import_mapping_profiles_updated_at
  BEFORE UPDATE ON import_mapping_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- import_jobs — one row per import attempt
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_jobs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  portfolio_id    uuid REFERENCES portfolios(id) ON DELETE SET NULL,

  name            text NOT NULL,
  source_type     text NOT NULL,   -- 'csv_export' | 'blackbaud_api' | 'direct_db'
  source_config   jsonb,           -- { storage_paths: { donors: '...', holdings: '...' } }

  mapping_profile_id uuid REFERENCES import_mapping_profiles(id) ON DELETE SET NULL,
  status          import_status_enum NOT NULL DEFAULT 'pending',

  -- Lifecycle counters
  total_records_extracted int NOT NULL DEFAULT 0,
  records_validated       int NOT NULL DEFAULT 0,
  records_loaded          int NOT NULL DEFAULT 0,
  records_failed          int NOT NULL DEFAULT 0,
  approved_rows           int NOT NULL DEFAULT 0,
  rejected_rows           int NOT NULL DEFAULT 0,
  error_rows              int NOT NULL DEFAULT 0,

  -- Heartbeat (set by worker every 30s while processing)
  last_heartbeat_at timestamptz,

  -- Timing
  started_at      timestamptz,
  completed_at    timestamptz,

  -- Error tracking
  error_message   text,
  error_details   jsonb,

  -- Reconciliation results (written after load phase)
  reconciliation_data jsonb,

  created_by      uuid NOT NULL REFERENCES auth.users(id),
  reviewed_by     uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_import_jobs_org_id  ON import_jobs (org_id);
CREATE INDEX idx_import_jobs_status  ON import_jobs (status);

CREATE TRIGGER trg_import_jobs_updated_at
  BEFORE UPDATE ON import_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Per-entity staging tables
-- All share the same base columns; entity-specific FK columns added per table.
-- ---------------------------------------------------------------------------

-- staging_import_donors
CREATE TABLE IF NOT EXISTS staging_import_donors (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  import_job_id   uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  row_number      int NOT NULL,
  raw_data        jsonb NOT NULL,
  transformed_data jsonb,
  validation_status text NOT NULL DEFAULT 'pending',
  action_taken    text NOT NULL DEFAULT 'pending',
  validation_errors jsonb,
  external_id     text,            -- donor ID in source system (for dedup)
  matched_existing_id uuid,        -- donors.id matched during dedup
  final_id        uuid             -- donors.id created or updated by load
);

CREATE INDEX idx_staging_import_donors_job_id ON staging_import_donors (import_job_id);
CREATE INDEX idx_staging_import_donors_org_id ON staging_import_donors (org_id);

-- staging_import_investees
CREATE TABLE IF NOT EXISTS staging_import_investees (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  import_job_id   uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  row_number      int NOT NULL,
  raw_data        jsonb NOT NULL,
  transformed_data jsonb,
  validation_status text NOT NULL DEFAULT 'pending',
  action_taken    text NOT NULL DEFAULT 'pending',
  validation_errors jsonb,
  matched_charity_id uuid,         -- charities.id resolved via EIN or name lookup
  matched_existing_id uuid,        -- investees.id matched during dedup
  final_id        uuid             -- investees.id created or updated by load
);

CREATE INDEX idx_staging_import_investees_job_id ON staging_import_investees (import_job_id);
CREATE INDEX idx_staging_import_investees_org_id ON staging_import_investees (org_id);

-- staging_import_holdings
CREATE TABLE IF NOT EXISTS staging_import_holdings (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  import_job_id   uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  row_number      int NOT NULL,
  raw_data        jsonb NOT NULL,
  transformed_data jsonb,
  validation_status text NOT NULL DEFAULT 'pending',
  action_taken    text NOT NULL DEFAULT 'pending',
  validation_errors jsonb,
  matched_existing_id uuid,        -- holdings.id matched during dedup
  final_id        uuid,            -- holdings.id created or updated by load
  ai_suggestion_applied jsonb      -- snapshot of the AI suggestion applied to this row
);

CREATE INDEX idx_staging_import_holdings_job_id ON staging_import_holdings (import_job_id);
CREATE INDEX idx_staging_import_holdings_org_id ON staging_import_holdings (org_id);

-- staging_import_contributions
CREATE TABLE IF NOT EXISTS staging_import_contributions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  import_job_id   uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  row_number      int NOT NULL,
  raw_data        jsonb NOT NULL,
  transformed_data jsonb,
  validation_status text NOT NULL DEFAULT 'pending',
  action_taken    text NOT NULL DEFAULT 'pending',
  validation_errors jsonb,
  matched_existing_id uuid,
  final_tax_contribution_id uuid,
  final_holding_contribution_id uuid
);

CREATE INDEX idx_staging_import_contributions_job_id ON staging_import_contributions (import_job_id);
CREATE INDEX idx_staging_import_contributions_org_id ON staging_import_contributions (org_id);

-- staging_import_metrics
CREATE TABLE IF NOT EXISTS staging_import_metrics (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  import_job_id   uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  row_number      int NOT NULL,
  raw_data        jsonb NOT NULL,
  transformed_data jsonb,
  validation_status text NOT NULL DEFAULT 'pending',
  action_taken    text NOT NULL DEFAULT 'pending',
  validation_errors jsonb,
  final_id        uuid             -- metric_facts.id created or updated by load
);

CREATE INDEX idx_staging_import_metrics_job_id ON staging_import_metrics (import_job_id);
CREATE INDEX idx_staging_import_metrics_org_id ON staging_import_metrics (org_id);

-- ---------------------------------------------------------------------------
-- Add FK back-references from earlier tables
-- ---------------------------------------------------------------------------

-- uploads.import_job_id (column defined in 0005)
ALTER TABLE uploads
  ADD CONSTRAINT fk_uploads_import_job_id
  FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE SET NULL;

-- staging_metric_facts.import_job_id (column defined in 0005)
ALTER TABLE staging_metric_facts
  ADD CONSTRAINT fk_staging_metric_facts_import_job_id
  FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE;

-- staging_import_rows.import_job_id (column defined in 0005)
ALTER TABLE staging_import_rows
  ADD CONSTRAINT fk_staging_import_rows_import_job_id
  FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE import_mapping_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_mapping_profiles: org members can view"
  ON import_mapping_profiles FOR SELECT
  USING (can_view_org(org_id));

CREATE POLICY "import_mapping_profiles: org admins can manage"
  ON import_mapping_profiles FOR ALL
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE POLICY "import_mapping_profiles: service role full access"
  ON import_mapping_profiles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_jobs: org admins can view"
  ON import_jobs FOR SELECT
  USING (is_org_admin(org_id));

CREATE POLICY "import_jobs: org admins can manage"
  ON import_jobs FOR ALL
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE POLICY "import_jobs: service role full access"
  ON import_jobs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Staging table RLS (admin-only; ETL worker uses service role)
ALTER TABLE staging_import_donors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staging_import_donors: org admins only"
  ON staging_import_donors FOR ALL
  USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id));
CREATE POLICY "staging_import_donors: service role full access"
  ON staging_import_donors FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE staging_import_investees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staging_import_investees: org admins only"
  ON staging_import_investees FOR ALL
  USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id));
CREATE POLICY "staging_import_investees: service role full access"
  ON staging_import_investees FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE staging_import_holdings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staging_import_holdings: org admins only"
  ON staging_import_holdings FOR ALL
  USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id));
CREATE POLICY "staging_import_holdings: service role full access"
  ON staging_import_holdings FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE staging_import_contributions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staging_import_contributions: org admins only"
  ON staging_import_contributions FOR ALL
  USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id));
CREATE POLICY "staging_import_contributions: service role full access"
  ON staging_import_contributions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE staging_import_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staging_import_metrics: org admins only"
  ON staging_import_metrics FOR ALL
  USING (is_org_admin(org_id)) WITH CHECK (is_org_admin(org_id));
CREATE POLICY "staging_import_metrics: service role full access"
  ON staging_import_metrics FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON import_mapping_profiles TO authenticated;
GRANT ALL ON import_mapping_profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON import_jobs TO authenticated;
GRANT ALL ON import_jobs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON staging_import_donors TO authenticated;
GRANT ALL ON staging_import_donors TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON staging_import_investees TO authenticated;
GRANT ALL ON staging_import_investees TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON staging_import_holdings TO authenticated;
GRANT ALL ON staging_import_holdings TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON staging_import_contributions TO authenticated;
GRANT ALL ON staging_import_contributions TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON staging_import_metrics TO authenticated;
GRANT ALL ON staging_import_metrics TO service_role;
```

- [ ] **Step 2: Add contract test for new staging table schema**

Add to `lib/__tests__/task-automation-contract.test.ts`:

```typescript
// ---------------------------------------------------------------------------
// 16. Per-entity staging tables exist in migrations
// ---------------------------------------------------------------------------
describe('Per-entity staging tables exist in active migrations', () => {
  const REQUIRED_STAGING_TABLES = [
    'staging_import_donors',
    'staging_import_investees',
    'staging_import_holdings',
    'staging_import_contributions',
    'staging_import_metrics',
  ];

  for (const table of REQUIRED_STAGING_TABLES) {
    it(`staging table "${table}" is defined in migrations`, () => {
      const pattern = new RegExp(`CREATE TABLE\\s+(IF NOT EXISTS\\s+)?\\w*\\.?${table}\\s*\\(`, 'i');
      expect(pattern.test(migrations)).toBe(true);
    });
  }

  it('staging_import_users is NOT in active migrations (users import deferred)', () => {
    const pattern = /CREATE TABLE\s+(IF NOT EXISTS\s+)?\w*\.?staging_import_users\s*\(/i;
    expect(pattern.test(migrations)).toBe(false);
  });

  it('import_jobs has name column in migrations', () => {
    expect(migrations).toMatch(/name\s+text\s+NOT NULL/);
  });

  it('import_jobs has source_type column (not source_system)', () => {
    expect(migrations).toContain('source_type');
  });

  it('import_jobs has last_heartbeat_at column', () => {
    expect(migrations).toContain('last_heartbeat_at');
  });

  it('import_mapping_profiles has entity_mappings column', () => {
    expect(migrations).toContain('entity_mappings');
  });

  it('import_mapping_profiles does not have stale field_mappings column', () => {
    // field_mappings only appears in 0005 for staging_import_rows (allowed),
    // but NOT in import_mapping_profiles definition
    const profileSection = migrations.split('import_mapping_profiles')[1]?.split('import_jobs')[0] ?? '';
    expect(profileSection).not.toContain('field_mappings');
  });
});
```

- [ ] **Step 3: Run contract tests**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx vitest run lib/__tests__/task-automation-contract.test.ts 2>&1 | tail -40
```

Expected: The new staging table tests pass. The stale-status tests in Task 1 still fail (those require app code changes).

- [ ] **Step 4: Commit**

```bash
git add db/migrations/0018_import_system.sql lib/__tests__/task-automation-contract.test.ts
git commit -m "feat(import): rewrite migration — canonical schema, per-entity staging tables, correct column names"
```

---

## Task 3: Update staging cleanup function

**Files:**
- Modify: `db/migrations/0031_staging_cleanup.sql`

- [ ] **Step 1: Update `cleanup_staging_pii` to purge per-entity tables**

Replace the entire content of `db/migrations/0031_staging_cleanup.sql` with:

```sql
-- Migration: Staging PII Cleanup
-- Description: Add function to purge staging rows from completed import jobs older than 30 days.
--   Called: (a) explicitly by admins via API, (b) automatically when a new import job commits.
-- Date: 2026-05-06

CREATE OR REPLACE FUNCTION public.cleanup_staging_pii(retention_days INT DEFAULT 30)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff TIMESTAMPTZ;
  total_deleted INTEGER := 0;
  deleted INTEGER;
BEGIN
  cutoff := NOW() - (retention_days || ' days')::INTERVAL;

  -- Generic staging rows (legacy)
  DELETE FROM public.staging_import_rows
    WHERE import_job_id IN (
      SELECT id FROM public.import_jobs
      WHERE status IN ('completed', 'failed', 'rolled_back')
        AND updated_at < cutoff
    );
  GET DIAGNOSTICS deleted = ROW_COUNT;
  total_deleted := total_deleted + deleted;

  -- Per-entity staging tables
  DELETE FROM public.staging_import_donors
    WHERE import_job_id IN (
      SELECT id FROM public.import_jobs
      WHERE status IN ('completed', 'failed', 'rolled_back')
        AND updated_at < cutoff
    );
  GET DIAGNOSTICS deleted = ROW_COUNT;
  total_deleted := total_deleted + deleted;

  DELETE FROM public.staging_import_investees
    WHERE import_job_id IN (
      SELECT id FROM public.import_jobs
      WHERE status IN ('completed', 'failed', 'rolled_back')
        AND updated_at < cutoff
    );
  GET DIAGNOSTICS deleted = ROW_COUNT;
  total_deleted := total_deleted + deleted;

  DELETE FROM public.staging_import_holdings
    WHERE import_job_id IN (
      SELECT id FROM public.import_jobs
      WHERE status IN ('completed', 'failed', 'rolled_back')
        AND updated_at < cutoff
    );
  GET DIAGNOSTICS deleted = ROW_COUNT;
  total_deleted := total_deleted + deleted;

  DELETE FROM public.staging_import_contributions
    WHERE import_job_id IN (
      SELECT id FROM public.import_jobs
      WHERE status IN ('completed', 'failed', 'rolled_back')
        AND updated_at < cutoff
    );
  GET DIAGNOSTICS deleted = ROW_COUNT;
  total_deleted := total_deleted + deleted;

  DELETE FROM public.staging_import_metrics
    WHERE import_job_id IN (
      SELECT id FROM public.import_jobs
      WHERE status IN ('completed', 'failed', 'rolled_back')
        AND updated_at < cutoff
    );
  GET DIAGNOSTICS deleted = ROW_COUNT;
  total_deleted := total_deleted + deleted;

  RETURN total_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_staging_pii(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_staging_pii(INT) TO service_role;
```

- [ ] **Step 2: Commit**

```bash
git add db/migrations/0031_staging_cleanup.sql
git commit -m "feat(import): cleanup_staging_pii purges all per-entity staging tables"
```

---

## Task 4: Update `lib/import/types.ts`

**Files:**
- Modify: `lib/import/types.ts`

- [ ] **Step 1: Replace the entire file**

```typescript
// lib/import/types.ts
// Shared types for the AI-Native Import System

export type EntityType = 'donors' | 'investees' | 'holdings' | 'contributions' | 'metrics';

export type ImportJobStatus =
  | 'pending'
  | 'processing'
  | 'needs_review'
  | 'approved'
  | 'committing'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'rolled_back';

export type ValidationStatus = 'pending' | 'valid' | 'invalid' | 'warning' | 'skipped';

export type ActionTaken =
  | 'create'
  | 'update'
  | 'skip'
  | 'error'
  | 'manual_review'
  | 'rolled_back'
  | 'pending';

export interface ImportJob {
  id: string;
  org_id: string;
  portfolio_id: string | null;
  name: string;
  source_type: 'blackbaud_api' | 'csv_export' | 'direct_db';
  source_config: Record<string, unknown> | null;
  mapping_profile_id: string | null;
  status: ImportJobStatus;
  total_records_extracted: number;
  records_validated: number;
  records_loaded: number;
  records_failed: number;
  approved_rows: number;
  rejected_rows: number;
  error_rows: number;
  last_heartbeat_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  error_details: Record<string, unknown> | null;
  reconciliation_data: Record<string, unknown> | null;
  created_by: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface FieldMappingConfig {
  source: string;
  type: 'string' | 'numeric' | 'date' | 'boolean' | 'enum';
  required?: boolean;
  confidence?: number;
  default?: string | number | boolean | null;
  transform?: 'normalize_ein' | 'slugify';
  values_map?: Record<string, string>;
}

export interface MatchCriteria {
  fields: string[];
  weight: number;
}

export interface EntityMappingConfig {
  source_entity?: string;
  field_map: Record<string, FieldMappingConfig>;
  match_criteria?: MatchCriteria[];
}

export interface MappingProfile {
  id: string;
  org_id: string;
  name: string;
  source_type: 'blackbaud_re_nxt' | 'salesforce_npsp' | 'donorperfect' | 'custom_csv';
  description: string | null;
  entity_mappings: Record<string, EntityMappingConfig>;
  version: number;
  is_default: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export const STAGING_TABLE_MAP: Record<EntityType, string> = {
  donors: 'staging_import_donors',
  investees: 'staging_import_investees',
  holdings: 'staging_import_holdings',
  contributions: 'staging_import_contributions',
  metrics: 'staging_import_metrics',
};
```

- [ ] **Step 2: Run typecheck to surface downstream breakage**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx tsc --noEmit 2>&1 | grep "lib/import\|app/api/admin/imports" | head -40
```

Expected: type errors in loader.ts, rollback.ts, job-queue.ts, and several routes — these are the files the next tasks fix.

- [ ] **Step 3: Commit**

```bash
git add lib/import/types.ts
git commit -m "feat(import): canonical TypeScript types aligned with new DB schema"
```

---

## Task 5: Update `lib/import/loader.ts`

**Files:**
- Modify: `lib/import/loader.ts`

`users` is removed from `LoadPhase`; `donors` is added. Load order: `investees` → `donors` → `holdings` → `contributions` → `metrics`. Counter column names change from `records_loaded`/`records_failed` (already correct in loader) — verify the job update uses the right column names.

- [ ] **Step 1: Update `LoadPhase` type and `LOAD_ORDER`**

Find and replace in `lib/import/loader.ts`:

```typescript
// Old:
export type LoadPhase = 'investees' | 'holdings' | 'users' | 'contributions' | 'metrics';
export const LOAD_ORDER: LoadPhase[] = ['investees', 'holdings', 'users', 'contributions', 'metrics'];

// New:
export type LoadPhase = 'donors' | 'investees' | 'holdings' | 'contributions' | 'metrics';
export const LOAD_ORDER: LoadPhase[] = ['investees', 'donors', 'holdings', 'contributions', 'metrics'];
```

- [ ] **Step 2: Update `getStagingTable` to remove `users`, add `donors`**

Find the `getStagingTable` function (around line 634) and update its map:

```typescript
function getStagingTable(phase: LoadPhase): string {
  const map: Record<LoadPhase, string> = {
    donors: 'staging_import_donors',
    investees: 'staging_import_investees',
    holdings: 'staging_import_holdings',
    contributions: 'staging_import_contributions',
    metrics: 'staging_import_metrics',
  };
  return map[phase];
}
```

- [ ] **Step 3: Update `getProductionTable` to remove `users`, add `donors`**

Find the `getProductionTable` function (around line 645) and update its map:

```typescript
function getProductionTable(phase: LoadPhase): string {
  const map: Record<LoadPhase, string> = {
    donors: 'donors',
    investees: 'investees',
    holdings: 'holdings',
    contributions: 'contributions_received',
    metrics: 'metric_facts',
  };
  return map[phase];
}
```

- [ ] **Step 4: Remove the `loadUsers` function and its `case 'users':` branch**

Search for `case 'users':` in loader.ts and delete that entire case branch. Also delete the `loadUsers` / `loadUserPhase` function if it exists as a named function.

- [ ] **Step 5: Add a `loadDonors` case**

The contributions phase already deduplicates/creates donors. The donor-specific load phase should:

Find the switch/dispatch block that calls the per-phase load function and add a `donors` case. Follow the same pattern as the `investees` case — read from `staging_import_donors`, upsert into `donors` by `(org_id, external_id)` for dedup:

```typescript
case 'donors': {
  const { data: rows, error } = await supabase
    .from('staging_import_donors')
    .select('id, import_job_id, transformed_data, validation_status, matched_existing_id, external_id')
    .eq('import_job_id', importJobId)
    .in('validation_status', ['valid', 'warning']);

  if (error) throw new Error(`Failed to fetch donor staging rows: ${error.message}`);

  for (const row of rows ?? []) {
    try {
      const data = (row.transformed_data ?? {}) as Record<string, unknown>;
      const existingId = row.matched_existing_id as string | null;

      if (existingId && options?.upsertMode === 'upsert') {
        const { error: updateErr } = await supabase
          .from('donors')
          .update({ ...data, updated_at: new Date().toISOString() })
          .eq('id', existingId);
        if (updateErr) throw new Error(updateErr.message);
        await supabase.from('staging_import_donors').update({ action_taken: 'update', final_id: existingId }).eq('id', row.id);
        phaseResult.updated++;
      } else {
        const { data: inserted, error: insertErr } = await supabase
          .from('donors')
          .insert({ org_id: /* read from job */ data.org_id, ...data })
          .select('id')
          .single();
        if (insertErr) throw new Error(insertErr.message);
        await supabase.from('staging_import_donors').update({ action_taken: 'create', final_id: inserted.id }).eq('id', row.id);
        phaseResult.inserted++;
      }
    } catch (rowErr: any) {
      phaseResult.failed++;
      phaseResult.errors.push({ rowId: row.id, message: rowErr.message });
    }
  }
  break;
}
```

> **Note:** The exact shape of the load switch depends on the actual loader implementation. Match the existing pattern used for `holdings` exactly — just substitute `staging_import_donors` / `donors` / `final_id`.

- [ ] **Step 6: Fix counter column update**

Search loader.ts for any update to `import_jobs` that writes counter values. Make sure it uses the new column names:

```typescript
// Correct column names for the job progress update:
await supabase
  .from('import_jobs')
  .update({
    records_loaded: (currentJob.records_loaded ?? 0) + result.inserted + result.updated,
    records_failed: (currentJob.records_failed ?? 0) + result.failed,
  })
  .eq('id', importJobId);
```

These column names match the new schema (`records_loaded`, `records_failed`). If the loader currently uses other names, fix them here.

- [ ] **Step 7: Run typecheck**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx tsc --noEmit 2>&1 | grep "lib/import/loader" | head -20
```

Expected: No errors from loader.ts.

- [ ] **Step 8: Commit**

```bash
git add lib/import/loader.ts
git commit -m "feat(import): add donors load phase, remove users phase, fix counter column names"
```

---

## Task 6: Update `lib/import/job-queue.ts`

**Files:**
- Modify: `lib/import/job-queue.ts`

Replace all stale status/column references.

- [ ] **Step 1: Fix worker status transitions**

In `lib/import/job-queue.ts`, make these replacements:

```typescript
// Old (line ~45):
.update({ status: 'running', started_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString() })

// New:
.update({ status: 'processing', started_at: new Date().toISOString(), last_heartbeat_at: new Date().toISOString() })
```

```typescript
// Old (line ~54):
.eq('status', 'running'); // only update if still running

// New:
.eq('status', 'processing'); // only update if still processing
```

```typescript
// Old (lines ~104-105):
status: 'paused',
pause_reason: 'Extraction and validation complete. Review errors before loading.',

// New:
status: 'needs_review',
error_message: null,
```

- [ ] **Step 2: Run typecheck**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx tsc --noEmit 2>&1 | grep "lib/import/job-queue" | head -20
```

Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add lib/import/job-queue.ts
git commit -m "fix(import): worker uses processing/needs_review statuses, removes pause_reason"
```

---

## Task 7: Update `lib/import/rollback.ts`

**Files:**
- Modify: `lib/import/rollback.ts`

Remove `users`, fix `paused` → `needs_review`, remove `pause_reason`.

- [ ] **Step 1: Update `PHASE_TABLES` — remove `users`, add `donors`**

```typescript
const PHASE_TABLES: Record<LoadPhase, string[]> = {
  donors: ['donors'],
  investees: ['investees'],
  holdings: ['holdings'],
  contributions: ['tax_contributions', 'holding_contributions'],
  metrics: ['metric_facts'],
};
```

- [ ] **Step 2: Update `STAGING_TABLES` — remove `users`, add `donors`**

```typescript
const STAGING_TABLES: Record<LoadPhase, string> = {
  donors: 'staging_import_donors',
  investees: 'staging_import_investees',
  holdings: 'staging_import_holdings',
  contributions: 'staging_import_contributions',
  metrics: 'staging_import_metrics',
};
```

- [ ] **Step 3: Remove the `users` staging-reset block**

Find and delete the block that resets `staging_import_users` (around lines 203-211 of the original rollback.ts). Also delete the `else if (scope === 'users')` branch.

- [ ] **Step 4: Fix partial rollback status + column**

Find the partial rollback status update (around line 242 of the original):

```typescript
// Old:
.update({ status: 'paused', pause_reason: `Partial rollback: ${scope} reverted.` })

// New:
.update({
  status: 'needs_review',
  error_message: `Partial rollback: ${scope} reverted. Review and re-approve affected rows.`,
})
```

- [ ] **Step 5: Fix full rollback status update**

Find the full rollback job update (around line 213):

```typescript
// Old:
status: 'rolled_back',
records_loaded: 0,
records_failed: 0,
pause_reason: null,

// New:
status: 'rolled_back',
records_loaded: 0,
records_failed: 0,
error_message: null,
```

- [ ] **Step 6: Run typecheck**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx tsc --noEmit 2>&1 | grep "lib/import/rollback" | head -20
```

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add lib/import/rollback.ts
git commit -m "fix(import): rollback removes users phase, uses needs_review/rolled_back, removes pause_reason"
```

---

## Task 8: Update `app/api/admin/imports/[id]/commit/route.ts`

**Files:**
- Modify: `app/api/admin/imports/[id]/commit/route.ts`
- Modify: `app/api/admin/imports/__tests__/commit.test.ts`

The commit route is now the sole production-load path. It must:
- Only accept `approved` status (no `needs_review` shortcut).
- Transition through `committing` while the load runs (not `processing`).

- [ ] **Step 1: Update the test first**

Replace the entire content of `app/api/admin/imports/__tests__/commit.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

describe('import commit route', () => {
  const src = readFileSync(
    'app/api/admin/imports/[id]/commit/route.ts',
    'utf8'
  );

  it('calls loadStagingToProduction', () => {
    expect(src).toContain('loadStagingToProduction');
  });

  it('imports loadStagingToProduction from loader', () => {
    expect(src).toContain("from '@/lib/import/loader'");
  });

  it('only marks completed after loading', () => {
    const loadIdx = src.indexOf('loadStagingToProduction');
    const statusIdx = src.indexOf("status: 'completed'");
    expect(loadIdx).toBeGreaterThan(0);
    expect(loadIdx).toBeLessThan(statusIdx);
  });

  it('only accepts approved status — no needs_review shortcut', () => {
    expect(src).toContain("'approved'");
    expect(src).not.toContain("'needs_review'");
    expect(src).not.toContain("'mapped'");
    expect(src).not.toContain("'validated'");
  });

  it('transitions to committing while load runs', () => {
    expect(src).toContain("'committing'");
  });

  it('does not use stale statuses or columns', () => {
    expect(src).not.toContain("'paused'");
    expect(src).not.toContain("'running'");
    expect(src).not.toContain('pause_reason');
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx vitest run "app/api/admin/imports/__tests__/commit.test.ts" 2>&1 | tail -20
```

Expected: Fails on `committing` assertion and `needs_review` assertion.

- [ ] **Step 3: Update the commit route**

Replace the entire content of `app/api/admin/imports/[id]/commit/route.ts`:

```typescript
// app/api/admin/imports/[id]/commit/route.ts
// POST: load staging data into production tables for an approved job.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase';
import { loadStagingToProduction } from '@/lib/import/loader';
import type { ImportJob } from '@/lib/import/types';
import { requireAdmin } from '@/lib/admin-auth';
import { completeGeneratedTasks } from '@/lib/tasks/automation/task-writer';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAdmin();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createAdminClient();

  const { data: job, error: jobError } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
  }

  if (job.status !== 'approved') {
    return NextResponse.json(
      {
        error: `Cannot commit a job with status '${job.status}'. Job must be approved first.`,
      },
      { status: 422 }
    );
  }

  await supabase
    .from('import_jobs')
    .update({ status: 'committing' })
    .eq('id', id);

  let loadResults;
  try {
    loadResults = await loadStagingToProduction(supabase, id, { upsertMode: 'upsert' });
  } catch (loadErr: any) {
    await supabase
      .from('import_jobs')
      .update({
        status: 'failed',
        error_message: loadErr.message,
        error_details: {
          previous_status: job.status,
          failed_at: new Date().toISOString(),
        },
      })
      .eq('id', id);
    return NextResponse.json(
      { error: `Load failed: ${loadErr.message}` },
      { status: 500 }
    );
  }

  const totalInserted = loadResults.reduce((s, r) => s + r.inserted + r.updated, 0);
  const totalFailed = loadResults.reduce((s, r) => s + r.failed, 0);

  const { data: updated, error: updateError } = await supabase
    .from('import_jobs')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      reviewed_by: userId,
      error_message: null,
      error_details: {
        load_summary: {
          total_inserted: totalInserted,
          total_failed: totalFailed,
          phases: loadResults,
        },
      },
    })
    .eq('id', id)
    .select('*')
    .single();

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  completeGeneratedTasks(supabase, job.org_id, `import_job:${id}:approval`, 'Import job committed successfully').catch(() => {});

  supabase.rpc('cleanup_staging_pii', { retention_days: 30 }).then(() => {}, () => {});

  return NextResponse.json(
    {
      job: updated as ImportJob,
      load_summary: {
        total_inserted: totalInserted,
        total_failed: totalFailed,
        phases: loadResults,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx vitest run "app/api/admin/imports/__tests__/commit.test.ts" 2>&1 | tail -15
```

Expected: All tests PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/api/admin/imports/[id]/commit/route.ts" app/api/admin/imports/__tests__/commit.test.ts
git commit -m "feat(import): commit route requires approved status, transitions through committing"
```

---

## Task 9: Delete the stale `/load` route

**Files:**
- Delete: `app/api/admin/imports/[id]/load/route.ts`

The `/load` route pre-dates the commit route and uses `paused`/`running` statuses that no longer exist in the DB enum. The commit route fully replaces it.

- [ ] **Step 1: Delete the route file**

```bash
rm "/Users/teddyhickenlooper/Desktop/benevolence-product/app/api/admin/imports/[id]/load/route.ts"
```

- [ ] **Step 2: Verify no other file imports from the load route**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && grep -r "admin/imports.*load" app/ lib/ --include="*.ts" --include="*.tsx" | grep -v ".test."
```

Expected: No results (or only innocuous route references in UI that call the API endpoint, not import the file).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(import): delete stale /load route — commit route is the sole production-load path"
```

---

## Task 10: Fix `/resume`, `/rollback`, and `/reconciliation` routes

**Files:**
- Modify: `app/api/admin/imports/[id]/resume/route.ts`
- Modify: `app/api/admin/imports/[id]/rollback/route.ts`
- Modify: `app/api/admin/imports/[id]/reconciliation/route.ts`

- [ ] **Step 1: Fix `resume/route.ts`**

In `app/api/admin/imports/[id]/resume/route.ts`, make two changes:

```typescript
// Old:
if (job.status !== 'paused') {
  return NextResponse.json(
    { error: `Cannot resume a job with status '${job.status}'` },
    { status: 422 }
  );
}

const { data: updated, error } = await supabase
  .from('import_jobs')
  .update({ status: 'processing', pause_reason: null })

// New:
if (job.status !== 'needs_review') {
  return NextResponse.json(
    { error: `Cannot resume a job with status '${job.status}'. Job must be in needs_review.` },
    { status: 422 }
  );
}

const { data: updated, error } = await supabase
  .from('import_jobs')
  .update({ status: 'processing', error_message: null })
```

- [ ] **Step 2: Fix `rollback/route.ts`**

```typescript
// Old:
const VALID_STATUSES = ['completed', 'paused', 'failed'];
const VALID_SCOPES: RollbackScope[] = ['full', 'investees', 'holdings', 'users', 'contributions', 'metrics'];

// New:
const VALID_STATUSES = ['completed', 'needs_review', 'failed'];
const VALID_SCOPES: RollbackScope[] = ['full', 'donors', 'investees', 'holdings', 'contributions', 'metrics'];
```

Also update the error message:

```typescript
// Old:
{ error: `Job must be in completed, paused, or failed status to rollback. Current: ${job.status}` },

// New:
{ error: `Job must be in completed, needs_review, or failed status to rollback. Current: ${job.status}` },
```

- [ ] **Step 3: Fix `reconciliation/route.ts`**

The POST endpoint currently changes job status to `paused` if reconciliation fails. Reconciliation is now a read-only diagnostic — status is managed by commit/rollback only. Remove the status mutation.

In `app/api/admin/imports/[id]/reconciliation/route.ts`, find the status update block at the end of the POST handler:

```typescript
// Delete these lines entirely:
const newStatus = report.overallSuccess ? 'completed' : 'paused';
const pauseReason = report.overallSuccess
  ? null
  : 'Reconciliation failed. Review discrepancies.';

const { error: updateErr } = await supabase
  .from('import_jobs')
  .update({
    reconciliation_data: reconciliationData,
    status: newStatus,
    ...(report.overallSuccess ? { completed_at: new Date().toISOString(), pause_reason: null } : { pause_reason: pauseReason }),
  })
  .eq('id', id);

if (updateErr) {
  console.error('[reconciliation POST] Failed to update import job status:', updateErr);
  return NextResponse.json(
    { error: 'Reconciliation completed but job status could not be saved.' },
    { status: 500, headers: { 'Cache-Control': 'no-store' } }
  );
}
```

Replace with just the reconciliation data store (no status change):

```typescript
const { error: updateErr } = await supabase
  .from('import_jobs')
  .update({ reconciliation_data: reconciliationData })
  .eq('id', id);

if (updateErr) {
  console.error('[reconciliation POST] Failed to cache reconciliation data:', updateErr);
}
```

- [ ] **Step 4: Run typecheck on all three routes**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx tsc --noEmit 2>&1 | grep "admin/imports" | head -20
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add "app/api/admin/imports/[id]/resume/route.ts" "app/api/admin/imports/[id]/rollback/route.ts" "app/api/admin/imports/[id]/reconciliation/route.ts"
git commit -m "fix(import): resume/rollback/reconciliation routes use canonical status names, remove pause_reason"
```

---

## Task 11: Update the create route

**Files:**
- Modify: `app/api/admin/imports/route.ts`

- [ ] **Step 1: Remove `users.csv`, add `donors.csv`**

In `app/api/admin/imports/route.ts`, find the `entityFileMap` and update it:

```typescript
// Old:
const entityFileMap: Record<string, string> = {
  'funds.csv': 'holdings',
  'constituents.csv': 'investees',
  'gifts.csv': 'contributions',
  'custom_fields.csv': 'metrics',
  'users.csv': 'users',
};

// New:
const entityFileMap: Record<string, string> = {
  'funds.csv': 'holdings',
  'constituents.csv': 'investees',
  'donors.csv': 'donors',
  'gifts.csv': 'contributions',
  'custom_fields.csv': 'metrics',
};
```

- [ ] **Step 2: Require `org_id`**

```typescript
// Old:
if (!name) {
  return NextResponse.json({ error: 'name is required' }, { status: 400 });
}

// New:
if (!name) {
  return NextResponse.json({ error: 'name is required' }, { status: 400 });
}
if (!orgId) {
  return NextResponse.json({ error: 'org_id is required' }, { status: 400 });
}
```

- [ ] **Step 3: Run typecheck**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx tsc --noEmit 2>&1 | grep "app/api/admin/imports/route" | head -10
```

Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add app/api/admin/imports/route.ts
git commit -m "feat(import): create route removes users entity, adds donors, requires org_id"
```

---

## Task 12: Update `lib/tasks/automation/producers/imports.ts`

**Files:**
- Modify: `lib/tasks/automation/producers/imports.ts`

Three changes: use `name` instead of `entity_type` for job labels; add `rolled_back` to cancel and terminal sets; update the DB query to select `name` instead of `entity_type`.

- [ ] **Step 1: Update `TERMINAL_STATUSES` and `CANCEL_STATUSES`**

```typescript
// Old:
const TERMINAL_STATUSES = ['completed', 'rejected', 'failed'];
const CANCEL_STATUSES = ['failed', 'rejected'];

// New:
const TERMINAL_STATUSES = ['completed', 'rejected', 'failed', 'rolled_back'];
const CANCEL_STATUSES = ['failed', 'rejected', 'rolled_back'];
```

- [ ] **Step 2: Update the DB query**

```typescript
// Old select string:
'id, org_id, entity_type, status, total_rows, processed_rows, approved_rows, rejected_rows, error_rows, error_message, reviewed_by, created_at'

// New select string:
'id, org_id, name, status, approved_rows, rejected_rows, error_rows, error_message, reviewed_by, created_at'
```

Also update the `.not('status', 'in', ...)` filter to exclude all terminal statuses:

```typescript
.not('status', 'in', `(${TERMINAL_STATUSES.map(s => `'${s}'`).join(',')})`)
```

Wait — Supabase's `.not('status', 'in', ...)` takes an array, not a raw SQL string. Check the current pattern and match it. The existing code uses:
```typescript
.not('status', 'in', '(completed)')
```

This should be updated to exclude all terminal statuses. The correct PostgREST form is:
```typescript
.not('status', 'in', `(${TERMINAL_STATUSES.join(',')})`)
```

- [ ] **Step 3: Update the job label computation**

```typescript
// Old:
const entityType = (job.entity_type as string | null) ?? jobId;
const jobLabel = entityType !== jobId ? `${entityType} import` : jobId;

// New:
const jobName = (job.name as string | null) ?? jobId;
const jobLabel = jobName;
```

- [ ] **Step 4: Run typecheck**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx tsc --noEmit 2>&1 | grep "producers/imports" | head -10
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add lib/tasks/automation/producers/imports.ts
git commit -m "feat(import): producer uses name column, cancels tasks for rolled_back jobs"
```

---

## Task 13: Update `producers.imports.test.ts`

**Files:**
- Modify: `lib/tasks/automation/__tests__/producers.imports.test.ts`

All mock job fixtures use `entity_type` — replace with `name`. Add a test for `rolled_back` cancellation.

- [ ] **Step 1: Replace `entity_type` with `name` in all mock fixtures**

Find every occurrence of `entity_type:` in the mock job objects and replace with `name:`. Example:

```typescript
// Old fixture:
{
  id: 'job-1',
  org_id: 'org-1',
  entity_type: 'holding',
  status: 'needs_review',
  total_rows: 10,
  processed_rows: 10,
  approved_rows: 8,
  rejected_rows: 0,
  error_rows: 2,
  error_message: null,
  reviewed_by: null,
  created_at: new Date().toISOString(),
}

// New fixture:
{
  id: 'job-1',
  org_id: 'org-1',
  name: 'Holdings import Q1',
  status: 'needs_review',
  approved_rows: 8,
  rejected_rows: 0,
  error_rows: 2,
  error_message: null,
  reviewed_by: null,
  created_at: new Date().toISOString(),
}
```

Apply the same pattern to all other fixture objects (job-2 through job-9): drop `entity_type`, `total_rows`, `processed_rows`; add `name`.

- [ ] **Step 2: Add `rolled_back` cancellation test**

Add this test to the `importReviewProducer` describe block:

```typescript
it('cancels tasks for rolled_back jobs', async () => {
  _mockJobs = [
    {
      id: 'job-rb',
      org_id: 'org-1',
      name: 'Holdings import — rolled back',
      status: 'rolled_back',
      approved_rows: 0,
      rejected_rows: 0,
      error_rows: 0,
      error_message: null,
      reviewed_by: null,
      created_at: new Date().toISOString(),
    },
  ];
  const results = await importReviewProducer({ orgId: 'org-1' });
  // rolled_back is a cancel status — no new tasks created
  expect(Array.isArray(results)).toBe(true);
  if (results.length > 0) {
    expect(results[0].created).toBe(0);
    expect(results[0].updated).toBe(0);
  }
});
```

- [ ] **Step 3: Run the imports producer test**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx vitest run "lib/tasks/automation/__tests__/producers.imports.test.ts" 2>&1 | tail -20
```

Expected: All tests PASS.

- [ ] **Step 4: Commit**

```bash
git add "lib/tasks/automation/__tests__/producers.imports.test.ts"
git commit -m "test(import): update producer fixtures to canonical column names, add rolled_back test"
```

---

## Task 14: Final test run and typecheck

- [ ] **Step 1: Run full test suite**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx vitest run 2>&1 | tail -40
```

Expected: All tests PASS. If any fail, read the failure message and fix the specific issue before proceeding.

- [ ] **Step 2: Run full typecheck**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx tsc --noEmit 2>&1
```

Expected: Zero errors. If errors remain, fix them before committing.

- [ ] **Step 3: Run just the contract suite to verify all 16 sections pass**

```bash
cd /Users/teddyhickenlooper/Desktop/benevolence-product && npx vitest run lib/__tests__/task-automation-contract.test.ts 2>&1 | tail -40
```

Expected: All tests PASS.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "chore(import): final import consolidation — all tests green, zero type errors"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Covered |
|-------------|---------|
| `import_status_enum` extended with `committing`, `rolled_back` | Task 1 |
| `import_mapping_profiles` uses `entity_mappings`, not `field_mappings` | Task 2 |
| `import_jobs` has `name`, `source_type`, `last_heartbeat_at`, canonical counters | Task 2 |
| Per-entity staging tables in active migrations | Task 2 |
| `cleanup_staging_pii` covers per-entity tables | Task 3 |
| TypeScript types match DB schema exactly | Task 4 |
| `users` removed from all entity maps; `donors` added | Tasks 4, 5, 6, 7, 11 |
| Worker uses `processing`/`needs_review`, no `pause_reason` | Task 6 |
| Rollback uses `needs_review`, no `pause_reason`, `rolled_back` in enum | Task 7 |
| Commit route: `approved`-only gate, `committing` transition | Task 8 |
| `/load` route deleted | Task 9 |
| Resume/rollback/reconciliation use canonical status names | Task 10 |
| Create route: `donors.csv` replaces `users.csv`, `org_id` required | Task 11 |
| Import producer: `name` column, `rolled_back` cancellation | Task 12 |
| Tests updated for all above | Tasks 1, 2, 8, 13 |

**Investees decision:** Kept in v1. Tables are defined (Task 2), loader has a phase, rollback handles them. If `investees` production table doesn't exist in the schema when you run migrations, the loader will error on load — but that's a separate investee-table migration concern, not an import consolidation concern.

**No placeholders found.**

**Type consistency:** `LoadPhase` in `loader.ts` and `rollback.ts` both match the `EntityType` in `types.ts`. `STAGING_TABLE_MAP` values match the table names created in `0018`.
