-- =============================================================================
-- 0040_holdings_org_alignment.sql
-- Align org-owned holdings, org data submission, and upload compatibility.
-- Depends on: 0005, 0006, 0008, 0013
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Global metric catalog compatibility
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metrics (
  code        text PRIMARY KEY,
  name        text NOT NULL,
  unit        text,
  description text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO metrics (code, name, unit, description) VALUES
  ('people_served', 'People Served', 'people', 'Number of people served'),
  ('jobs_created', 'Jobs Created', 'jobs', 'Number of jobs created'),
  ('meals_provided', 'Meals Provided', 'meals', 'Number of meals provided'),
  ('students_educated', 'Students Educated', 'students', 'Number of students educated'),
  ('carbon_reduced', 'Carbon Reduced', 'tons CO2e', 'Carbon emissions reduced or avoided')
ON CONFLICT (code) DO NOTHING;

DROP TRIGGER IF EXISTS trg_metrics_updated_at ON metrics;
CREATE TRIGGER trg_metrics_updated_at
  BEFORE UPDATE ON metrics
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "metrics: authenticated can view"
  ON metrics FOR SELECT TO authenticated
  USING (true);
CREATE POLICY "metrics: service role can manage"
  ON metrics FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- uploads compatibility for org report uploads
-- ---------------------------------------------------------------------------
ALTER TABLE uploads
  ADD COLUMN IF NOT EXISTS holding_id uuid REFERENCES holdings(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_ext text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS ai_mode boolean NOT NULL DEFAULT false;

UPDATE uploads
SET file_name = COALESCE(file_name, filename),
    file_ext = COALESCE(file_ext, NULLIF(split_part(filename, '.', array_length(string_to_array(filename, '.'), 1)), ''))
WHERE file_name IS NULL
   OR file_ext IS NULL;

CREATE INDEX IF NOT EXISTS idx_uploads_holding_id
  ON uploads (holding_id)
  WHERE holding_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_uploads_org_created
  ON uploads (org_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- staging_metric_facts compatibility for org-submitted impact data
-- ---------------------------------------------------------------------------
ALTER TABLE staging_metric_facts
  ADD COLUMN IF NOT EXISTS metric_code text,
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS verification_level text,
  ADD COLUMN IF NOT EXISTS data_quality_score numeric(5,4),
  ADD COLUMN IF NOT EXISTS submitted_by_org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS raw jsonb;

UPDATE staging_metric_facts
SET metric_code = COALESCE(metric_code, metric_name)
WHERE metric_code IS NULL AND metric_name IS NOT NULL;

INSERT INTO metrics (code, name, unit)
SELECT DISTINCT metric_code, initcap(replace(metric_code, '_', ' ')), unit
FROM staging_metric_facts
WHERE metric_code IS NOT NULL
ON CONFLICT (code) DO NOTHING;

ALTER TABLE staging_metric_facts
  ADD CONSTRAINT staging_metric_facts_metric_code_fk
  FOREIGN KEY (metric_code) REFERENCES metrics(code)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_staging_metric_facts_submitted_org
  ON staging_metric_facts (submitted_by_org_id, approved, created_at DESC)
  WHERE submitted_by_org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_staging_metric_facts_metric_code
  ON staging_metric_facts (metric_code)
  WHERE metric_code IS NOT NULL;

DROP POLICY IF EXISTS "staging_metric_facts: org members via upload" ON staging_metric_facts;
CREATE POLICY "staging_metric_facts: org members can view submitted facts"
  ON staging_metric_facts FOR SELECT
  USING (
    (
      upload_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM uploads u
        WHERE u.id = staging_metric_facts.upload_id
          AND can_view_org(u.org_id)
      )
    )
    OR (
      submitted_by_org_id IS NOT NULL
      AND can_view_org(submitted_by_org_id)
    )
  );
CREATE POLICY "staging_metric_facts: org members can submit facts"
  ON staging_metric_facts FOR INSERT
  WITH CHECK (
    (
      upload_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM uploads u
        WHERE u.id = staging_metric_facts.upload_id
          AND can_edit_org(u.org_id)
      )
    )
    OR (
      submitted_by_org_id IS NOT NULL
      AND can_edit_org(submitted_by_org_id)
    )
  );
CREATE POLICY "staging_metric_facts: service role can manage"
  ON staging_metric_facts FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- metric_facts compatibility for org provenance and metric_code joins
-- ---------------------------------------------------------------------------
ALTER TABLE metric_facts
  ADD COLUMN IF NOT EXISTS metric_code text,
  ADD COLUMN IF NOT EXISTS submitted_by_org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE metric_facts
SET metric_code = COALESCE(metric_code, metric_name)
WHERE metric_code IS NULL AND metric_name IS NOT NULL;

INSERT INTO metrics (code, name, unit)
SELECT DISTINCT metric_code, initcap(replace(metric_code, '_', ' ')), unit
FROM metric_facts
WHERE metric_code IS NOT NULL
ON CONFLICT (code) DO NOTHING;

ALTER TABLE metric_facts
  ADD CONSTRAINT metric_facts_metric_code_fk
  FOREIGN KEY (metric_code) REFERENCES metrics(code)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_metric_facts_submitted_org
  ON metric_facts (submitted_by_org_id, updated_at DESC)
  WHERE submitted_by_org_id IS NOT NULL;

DROP TRIGGER IF EXISTS trg_metric_facts_updated_at ON metric_facts;
CREATE TRIGGER trg_metric_facts_updated_at
  BEFORE UPDATE ON metric_facts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Compliance/tax export compatibility
-- ---------------------------------------------------------------------------
ALTER TABLE tax_contributions
  ADD COLUMN IF NOT EXISTS recipient_type text;
