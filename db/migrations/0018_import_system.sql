-- =============================================================================
-- 0018_import_system.sql
-- AI-assisted import pipeline: jobs, mapping profiles, field maps.
-- Also adds FK back-references from earlier tables (uploads, staging).
-- Depends on: 0001, 0002, 0004, 0005
-- =============================================================================

-- ---------------------------------------------------------------------------
-- import_mapping_profiles — reusable field mapping configs
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_mapping_profiles (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name            text NOT NULL,
  description     text,
  source_system   text,           -- 'blackbaud', 'quickbooks', 'csv_generic', etc.
  entity_type     text NOT NULL,  -- 'holding', 'donor', 'grant', 'contribution', etc.

  -- Field mapping: { "source_column": "target_field", ... }
  field_mappings  jsonb NOT NULL DEFAULT '{}',

  -- Transformation rules applied to fields
  transform_rules jsonb NOT NULL DEFAULT '{}',

  -- Validation rules
  validation_rules jsonb NOT NULL DEFAULT '{}',

  is_default      boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,

  UNIQUE (org_id, name)
);

CREATE INDEX idx_import_mapping_profiles_org_id ON import_mapping_profiles (org_id) WHERE is_active;

CREATE TRIGGER trg_import_mapping_profiles_updated_at
  BEFORE UPDATE ON import_mapping_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- import_jobs — one job per file import attempt
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS import_jobs (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  portfolio_id    uuid REFERENCES portfolios(id) ON DELETE SET NULL,

  upload_id       uuid REFERENCES uploads(id) ON DELETE SET NULL,
  mapping_profile_id uuid REFERENCES import_mapping_profiles(id) ON DELETE SET NULL,

  entity_type     text NOT NULL,  -- 'holding', 'donor', 'grant', 'contribution', etc.
  source_system   text,
  status          import_status_enum NOT NULL DEFAULT 'pending',

  -- Progress
  total_rows      int,
  processed_rows  int NOT NULL DEFAULT 0,
  approved_rows   int NOT NULL DEFAULT 0,
  rejected_rows   int NOT NULL DEFAULT 0,
  error_rows      int NOT NULL DEFAULT 0,

  -- AI analysis results
  ai_field_suggestions    jsonb,  -- suggested field mappings from Claude
  ai_data_quality_report  jsonb,  -- data quality issues found

  -- Timing
  started_at      timestamptz,
  completed_at    timestamptz,

  -- Error tracking
  error_message   text,
  error_details   jsonb,

  created_by      uuid NOT NULL REFERENCES auth.users(id),
  reviewed_by     uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_import_jobs_org_id   ON import_jobs (org_id);
CREATE INDEX idx_import_jobs_status   ON import_jobs (status);
CREATE INDEX idx_import_jobs_upload   ON import_jobs (upload_id) WHERE upload_id IS NOT NULL;

CREATE TRIGGER trg_import_jobs_updated_at
  BEFORE UPDATE ON import_jobs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Add FK back-references from earlier tables
-- ---------------------------------------------------------------------------

-- uploads.import_job_id
ALTER TABLE uploads
  ADD CONSTRAINT fk_uploads_import_job_id
  FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE SET NULL;

-- staging_metric_facts.import_job_id
ALTER TABLE staging_metric_facts
  ADD CONSTRAINT fk_staging_metric_facts_import_job_id
  FOREIGN KEY (import_job_id) REFERENCES import_jobs(id) ON DELETE CASCADE;

-- staging_import_rows.import_job_id
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

ALTER TABLE import_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "import_jobs: org admins can view"
  ON import_jobs FOR SELECT
  USING (is_org_admin(org_id));
CREATE POLICY "import_jobs: org admins can manage"
  ON import_jobs FOR ALL
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));
