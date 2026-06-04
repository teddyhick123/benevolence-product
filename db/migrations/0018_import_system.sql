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
  final_contribution_id uuid       -- contributions_received.id created or updated by load
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
-- import_audit_log — immutable production write log used for rollback
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_audit_log (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  import_job_id   uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  table_name      text NOT NULL,
  operation       text NOT NULL CHECK (operation IN ('insert', 'update', 'skip', 'error', 'rollback')),
  record_id       uuid NOT NULL,
  staging_table   text,
  staging_row_id  uuid,
  data_snapshot   jsonb,
  error_message   text
);

CREATE INDEX idx_import_audit_log_job_id ON import_audit_log (import_job_id, created_at DESC);
CREATE INDEX idx_import_audit_log_table_record ON import_audit_log (table_name, record_id);

-- ---------------------------------------------------------------------------
-- import_ai_suggestions — per-field AI suggestions during import review
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_ai_suggestions (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  import_job_id     uuid NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  staging_table     text NOT NULL,   -- e.g. 'staging_import_holdings'
  staging_row_id    uuid NOT NULL,
  field             text NOT NULL,

  suggestion_type   text NOT NULL
                    CHECK (suggestion_type IN (
                      'fill_missing', 'fix_format', 'fix_value',
                      'map_enum', 'deduplicate', 'other'
                    )),
  confidence        numeric(4,3) CHECK (confidence BETWEEN 0 AND 1),
  explanation       text,
  proposed_value    text,
  auto_fixable      boolean NOT NULL DEFAULT false,
  bulk_applicable   boolean NOT NULL DEFAULT false,
  bulk_condition    jsonb,

  status            text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'accepted', 'rejected', 'applied')),

  UNIQUE (staging_row_id, field)
);

CREATE INDEX idx_import_ai_suggestions_job_id ON import_ai_suggestions (import_job_id);
CREATE INDEX idx_import_ai_suggestions_status ON import_ai_suggestions (import_job_id, status);

CREATE TRIGGER trg_import_ai_suggestions_updated_at
  BEFORE UPDATE ON import_ai_suggestions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- mark_stale_import_jobs() — fail jobs stuck in active states >30 min
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_stale_import_jobs(
  p_stale_threshold_minutes integer DEFAULT 30
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE import_jobs
  SET
    status = 'failed',
    updated_at = now(),
    error_message = COALESCE(
      error_message,
      'Job marked failed by mark_stale_import_jobs: no activity for '
        || p_stale_threshold_minutes || ' minutes'
    )
  WHERE status IN ('pending', 'processing', 'committing')
    AND updated_at < (now() - (p_stale_threshold_minutes || ' minutes')::interval);

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$;

GRANT EXECUTE ON FUNCTION mark_stale_import_jobs(integer) TO service_role;

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

ALTER TABLE import_ai_suggestions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_ai_suggestions: org admins can manage"
  ON import_ai_suggestions FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM import_jobs ij
      WHERE ij.id = import_job_id
        AND is_org_admin(ij.org_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM import_jobs ij
      WHERE ij.id = import_job_id
        AND is_org_admin(ij.org_id)
    )
  );

CREATE POLICY "import_ai_suggestions: service role full access"
  ON import_ai_suggestions FOR ALL TO service_role
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

ALTER TABLE import_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "import_audit_log: org admins can view"
  ON import_audit_log FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM import_jobs j
      WHERE j.id = import_audit_log.import_job_id
        AND is_org_admin(j.org_id)
    )
  );
CREATE POLICY "import_audit_log: service role full access"
  ON import_audit_log FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON import_mapping_profiles TO authenticated;
GRANT ALL ON import_mapping_profiles TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON import_jobs TO authenticated;
GRANT ALL ON import_jobs TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON import_ai_suggestions TO authenticated;
GRANT ALL ON import_ai_suggestions TO service_role;

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

GRANT SELECT ON import_audit_log TO authenticated;
GRANT ALL ON import_audit_log TO service_role;

-- ---------------------------------------------------------------------------
-- imports storage bucket — private bucket for import file uploads.
-- Wrapped for local databases that do not install Supabase Storage.
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = 'storage') THEN
    INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    VALUES (
      'imports',
      'imports',
      false,
      52428800,
      ARRAY[
        'text/csv',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/json',
        'text/plain'
      ]
    )
    ON CONFLICT (id) DO NOTHING;

    DROP POLICY IF EXISTS "imports bucket: org admins can upload" ON storage.objects;
    CREATE POLICY "imports bucket: org admins can upload"
      ON storage.objects FOR INSERT TO authenticated
      WITH CHECK (
        bucket_id = 'imports'
        AND public.is_org_admin((storage.foldername(name))[1]::uuid)
      );

    DROP POLICY IF EXISTS "imports bucket: org admins can read" ON storage.objects;
    CREATE POLICY "imports bucket: org admins can read"
      ON storage.objects FOR SELECT TO authenticated
      USING (
        bucket_id = 'imports'
        AND public.is_org_admin((storage.foldername(name))[1]::uuid)
      );

    DROP POLICY IF EXISTS "imports bucket: org admins can delete" ON storage.objects;
    CREATE POLICY "imports bucket: org admins can delete"
      ON storage.objects FOR DELETE TO authenticated
      USING (
        bucket_id = 'imports'
        AND public.is_org_admin((storage.foldername(name))[1]::uuid)
      );

    DROP POLICY IF EXISTS "imports bucket: service role full access" ON storage.objects;
    CREATE POLICY "imports bucket: service role full access"
      ON storage.objects FOR ALL TO service_role
      USING (bucket_id = 'imports')
      WITH CHECK (bucket_id = 'imports');
  END IF;
END;
$$;
