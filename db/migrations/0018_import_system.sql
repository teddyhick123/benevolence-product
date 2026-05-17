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
