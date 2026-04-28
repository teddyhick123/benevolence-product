-- =============================================================================
-- 0005_uploads_and_staging.sql
-- File uploads, storage bucket policy, and generic staging infrastructure.
-- Depends on: 0001, 0002, 0004
-- =============================================================================

-- ---------------------------------------------------------------------------
-- uploads
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS uploads (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  portfolio_id    uuid REFERENCES portfolios(id) ON DELETE SET NULL,
  uploaded_by     uuid NOT NULL REFERENCES auth.users(id),

  filename        text NOT NULL,
  original_name   text NOT NULL,
  storage_path    text NOT NULL,  -- Supabase Storage object path
  bucket          text NOT NULL DEFAULT 'uploads',
  mime_type       text,
  size_bytes      bigint,

  -- Import linkage (set when file is consumed by import pipeline)
  import_job_id   uuid,           -- FK added in 0020_import_system.sql

  deleted_at      timestamptz,
  deleted_by      uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_uploads_org_id        ON uploads (org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_uploads_portfolio_id  ON uploads (portfolio_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_uploads_uploaded_by   ON uploads (uploaded_by) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_uploads_updated_at
  BEFORE UPDATE ON uploads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: uploads
-- ---------------------------------------------------------------------------
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uploads: org members can view"
  ON uploads FOR SELECT
  USING (can_view_org(org_id) AND deleted_at IS NULL);

CREATE POLICY "uploads: org members can insert"
  ON uploads FOR INSERT
  WITH CHECK (can_edit_org(org_id));

CREATE POLICY "uploads: uploaders and admins can soft-delete"
  ON uploads FOR UPDATE
  USING (
    (uploaded_by = auth.uid() OR is_org_admin(org_id))
    AND deleted_at IS NULL
  )
  WITH CHECK (uploaded_by = auth.uid() OR is_org_admin(org_id));

-- ---------------------------------------------------------------------------
-- Supabase Storage bucket: uploads
-- (Run via Supabase dashboard or service role — cannot be in a migration
--  unless using the management API. Documented here for reference.)
--
-- INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
-- VALUES (
--   'uploads', 'uploads', false,
--   52428800,  -- 50 MB per file
--   ARRAY['text/csv','application/vnd.ms-excel',
--         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
--         'application/pdf','image/png','image/jpeg']
-- ) ON CONFLICT (id) DO NOTHING;
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- Staging tables for AI-assisted import
-- ---------------------------------------------------------------------------

-- Generic metric staging (row-per-KPI-observation from CSV uploads)
CREATE TABLE IF NOT EXISTS staging_metric_facts (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  upload_id       uuid REFERENCES uploads(id) ON DELETE CASCADE,
  import_job_id   uuid,           -- FK added in 0020

  holding_id      uuid,           -- resolved after matching
  metric_name     text,
  period_start    date,
  period_end      date,
  value           numeric,
  unit            text,
  source_row      jsonb,          -- raw CSV row for traceability
  review_status   import_status_enum NOT NULL DEFAULT 'pending',
  review_notes    text
);

CREATE INDEX idx_staging_metric_facts_upload_id    ON staging_metric_facts (upload_id);
CREATE INDEX idx_staging_metric_facts_holding_id   ON staging_metric_facts (holding_id);
CREATE INDEX idx_staging_metric_facts_status       ON staging_metric_facts (review_status);

-- Generic import staging rows (one row per source record from any import)
CREATE TABLE IF NOT EXISTS staging_import_rows (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  import_job_id   uuid NOT NULL,  -- FK added in 0020
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  source_type     text NOT NULL,  -- 'holding', 'donor', 'grant', 'contribution', etc.
  source_row      jsonb NOT NULL, -- raw parsed row
  mapped_row      jsonb,          -- after field mapping
  validation_errors jsonb,
  review_status   import_status_enum NOT NULL DEFAULT 'pending',
  reviewed_by     uuid REFERENCES auth.users(id),
  reviewed_at     timestamptz,
  review_notes    text,
  target_record_id uuid           -- set after import creates the target record
);

CREATE INDEX idx_staging_import_rows_job_id ON staging_import_rows (import_job_id);
CREATE INDEX idx_staging_import_rows_org_id ON staging_import_rows (org_id);
CREATE INDEX idx_staging_import_rows_status ON staging_import_rows (review_status);

-- RLS: staging tables
ALTER TABLE staging_metric_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staging_metric_facts: org members via upload"
  ON staging_metric_facts FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM uploads u
      WHERE u.id = staging_metric_facts.upload_id
        AND can_view_org(u.org_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM uploads u
      WHERE u.id = staging_metric_facts.upload_id
        AND can_edit_org(u.org_id)
    )
  );

ALTER TABLE staging_import_rows ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staging_import_rows: org admins only"
  ON staging_import_rows FOR ALL
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));
