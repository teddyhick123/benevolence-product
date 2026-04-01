-- Migration: AI-Native Import System
-- Description: Complete schema for AI-assisted data migration from Blackbaud/Salesforce to Benevolence.
--   Includes staging tables, job tracking, AI suggestions/feedback, and full audit log.
-- Date: 2026-03-31

-- ============================================================
-- 1. import_mapping_profiles
-- ============================================================

CREATE TABLE import_mapping_profiles (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT        NOT NULL,
  source_system     TEXT        NOT NULL CHECK (source_system IN ('blackbaud_re_nxt', 'salesforce_npsp', 'donorperfect', 'custom_csv')),
  description       TEXT,
  entity_mappings   JSONB       NOT NULL DEFAULT '{}',
  version           INT         DEFAULT 1,
  is_default        BOOLEAN     DEFAULT false,
  created_by        UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE import_mapping_profiles IS 'Reusable field-mapping profiles that describe how to translate source system entities to Benevolence entities.';
COMMENT ON COLUMN import_mapping_profiles.source_system IS 'The external system this profile maps from (e.g. blackbaud_re_nxt).';
COMMENT ON COLUMN import_mapping_profiles.entity_mappings IS 'JSONB describing per-entity field maps, transforms, match criteria, and confidence scores.';
COMMENT ON COLUMN import_mapping_profiles.is_default IS 'If true this profile is suggested automatically when the matching source_system is selected.';
COMMENT ON COLUMN import_mapping_profiles.version IS 'Monotonically increasing integer; bump when entity_mappings change substantially.';

-- ============================================================
-- 2. import_jobs
-- ============================================================

CREATE TABLE import_jobs (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id               UUID        REFERENCES portfolios(id) ON DELETE SET NULL,
  name                       TEXT        NOT NULL,
  source_type                TEXT        NOT NULL CHECK (source_type IN ('blackbaud_api', 'csv_export', 'direct_db')),
  source_config              JSONB,
  mapping_profile_id         UUID        REFERENCES import_mapping_profiles(id) ON DELETE SET NULL,
  status                     TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'paused', 'completed', 'failed', 'rolled_back')),
  total_records_extracted    INT         DEFAULT 0,
  records_validated          INT         DEFAULT 0,
  records_loaded             INT         DEFAULT 0,
  records_failed             INT         DEFAULT 0,
  started_at                 TIMESTAMPTZ,
  completed_at               TIMESTAMPTZ,
  estimated_completion       TIMESTAMPTZ,
  pause_reason               TEXT,
  reconciliation_data        JSONB,
  notes                      TEXT,
  created_by                 UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                 TIMESTAMPTZ DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE import_jobs IS 'Top-level record for each import run. Tracks lifecycle, progress counters, and links to the mapping profile used.';
COMMENT ON COLUMN import_jobs.source_type IS 'How the raw data was sourced: API pull, CSV export upload, or direct DB connection.';
COMMENT ON COLUMN import_jobs.source_config IS 'Connection parameters, file references, or API credentials (secrets should be redacted before storage).';
COMMENT ON COLUMN import_jobs.status IS 'Current lifecycle state. pending → running → completed|failed|paused; failed jobs may be rolled_back.';
COMMENT ON COLUMN import_jobs.reconciliation_data IS 'Snapshot of before/after record counts and checksums used during rollback verification.';
COMMENT ON COLUMN import_jobs.pause_reason IS 'Human-readable explanation stored when status transitions to paused.';

-- ============================================================
-- 3. staging_import_holdings
-- ============================================================

CREATE TABLE staging_import_holdings (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id        UUID        NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number           INT         NOT NULL,
  raw_data             JSONB       NOT NULL,
  validation_status    TEXT        DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid', 'warning', 'skipped')),
  validation_errors    JSONB,
  transformed_data     JSONB,
  action_taken         TEXT        DEFAULT 'pending' CHECK (action_taken IN ('create', 'update', 'skip', 'error', 'manual_review', 'rolled_back', 'pending')),
  ai_suggestion_applied JSONB,
  matched_existing_id  UUID        REFERENCES holdings(id) ON DELETE SET NULL,
  final_id             UUID        REFERENCES holdings(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE staging_import_holdings IS 'Staging area for holding records extracted from source systems, pending validation and load.';
COMMENT ON COLUMN staging_import_holdings.raw_data IS 'Verbatim source row as JSONB — never mutated after initial load.';
COMMENT ON COLUMN staging_import_holdings.transformed_data IS 'Post-mapping, post-transform data ready to upsert into holdings.';
COMMENT ON COLUMN staging_import_holdings.matched_existing_id IS 'holdings.id matched by the import engine during deduplication.';
COMMENT ON COLUMN staging_import_holdings.final_id IS 'holdings.id of the record actually created or updated; set after successful load.';
COMMENT ON COLUMN staging_import_holdings.ai_suggestion_applied IS 'Snapshot of the AI suggestion that was applied to this row, if any.';

-- ============================================================
-- 4. staging_import_investees
-- ============================================================

CREATE TABLE staging_import_investees (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id             UUID        NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number                INT         NOT NULL,
  raw_data                  JSONB       NOT NULL,
  validation_status         TEXT        DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid', 'warning', 'skipped')),
  validation_errors         JSONB,
  transformed_data          JSONB,
  action_taken              TEXT        DEFAULT 'pending' CHECK (action_taken IN ('create', 'update', 'skip', 'error', 'manual_review', 'rolled_back', 'pending')),
  ai_suggestion_applied     JSONB,
  matched_existing_id       UUID        REFERENCES investees(id) ON DELETE SET NULL,
  matched_charity_id        UUID        REFERENCES charities(id) ON DELETE SET NULL,
  final_id                  UUID        REFERENCES investees(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE staging_import_investees IS 'Staging area for investee/constituent records from source systems.';
COMMENT ON COLUMN staging_import_investees.matched_charity_id IS 'charities.id resolved via EIN or name lookup during enrichment.';
COMMENT ON COLUMN staging_import_investees.matched_existing_id IS 'investees.id matched during deduplication (by EIN or name+country).';
COMMENT ON COLUMN staging_import_investees.final_id IS 'investees.id created or updated by the load step.';

-- ============================================================
-- 5. staging_import_contributions
-- ============================================================

CREATE TABLE staging_import_contributions (
  id                              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id                   UUID        NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number                      INT         NOT NULL,
  raw_data                        JSONB       NOT NULL,
  validation_status               TEXT        DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid', 'warning', 'skipped')),
  validation_errors               JSONB,
  transformed_data                JSONB,
  action_taken                    TEXT        DEFAULT 'pending' CHECK (action_taken IN ('create', 'update', 'skip', 'error', 'manual_review', 'rolled_back', 'pending')),
  ai_suggestion_applied           JSONB,
  matched_existing_id             UUID,
  final_tax_contribution_id       UUID        REFERENCES tax_contributions(id) ON DELETE SET NULL,
  final_holding_contribution_id   UUID        REFERENCES holding_contributions(id) ON DELETE SET NULL,
  created_at                      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE staging_import_contributions IS 'Staging area for gift/contribution records. A single source row may resolve to a tax_contribution or holding_contribution.';
COMMENT ON COLUMN staging_import_contributions.matched_existing_id IS 'UUID of a candidate existing contribution record (table not constrained as it may be tax or holding).';
COMMENT ON COLUMN staging_import_contributions.final_tax_contribution_id IS 'Set when the loaded record is a tax_contributions row.';
COMMENT ON COLUMN staging_import_contributions.final_holding_contribution_id IS 'Set when the loaded record is a holding_contributions row.';

-- ============================================================
-- 6. staging_import_metrics
-- ============================================================

CREATE TABLE staging_import_metrics (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id        UUID        NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number           INT         NOT NULL,
  raw_data             JSONB       NOT NULL,
  validation_status    TEXT        DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid', 'warning', 'skipped')),
  validation_errors    JSONB,
  transformed_data     JSONB,
  action_taken         TEXT        DEFAULT 'pending' CHECK (action_taken IN ('create', 'update', 'skip', 'error', 'manual_review', 'rolled_back', 'pending')),
  ai_suggestion_applied JSONB,
  matched_existing_id  UUID        REFERENCES metric_facts(id) ON DELETE SET NULL,
  final_id             UUID        REFERENCES metric_facts(id) ON DELETE SET NULL,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE staging_import_metrics IS 'Staging area for custom field / metric_fact records from source systems.';
COMMENT ON COLUMN staging_import_metrics.matched_existing_id IS 'metric_facts.id matched by (holding_id, metric_code, period_start) during deduplication.';
COMMENT ON COLUMN staging_import_metrics.final_id IS 'metric_facts.id created or updated by the load step.';

-- ============================================================
-- 7. staging_import_users
-- ============================================================

CREATE TABLE staging_import_users (
  id                           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id                UUID        NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  row_number                   INT         NOT NULL,
  raw_data                     JSONB       NOT NULL,
  validation_status            TEXT        DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'invalid', 'warning', 'skipped')),
  validation_errors            JSONB,
  transformed_data             JSONB,
  action_taken                 TEXT        DEFAULT 'pending' CHECK (action_taken IN ('create', 'update', 'skip', 'error', 'manual_review', 'rolled_back', 'pending')),
  ai_suggestion_applied        JSONB,
  matched_existing_user_id     UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  matched_existing_profile_id  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  final_profile_id             UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at                   TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE staging_import_users IS 'Staging area for user/contact records that may map to auth.users + profiles.';
COMMENT ON COLUMN staging_import_users.matched_existing_user_id IS 'auth.users.id matched by email during deduplication.';
COMMENT ON COLUMN staging_import_users.matched_existing_profile_id IS 'profiles.id matched via user_id FK during deduplication.';
COMMENT ON COLUMN staging_import_users.final_profile_id IS 'profiles.id of the record created or updated by the load step.';

-- ============================================================
-- 8. import_ai_suggestions
-- ============================================================

CREATE TABLE import_ai_suggestions (
  id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id         UUID        NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  staging_table         TEXT        NOT NULL,
  staging_row_id        UUID        NOT NULL,
  suggestion_type       TEXT        NOT NULL CHECK (suggestion_type IN ('fix_field', 'skip_row', 'merge_records', 'adjust_mapping', 'warning', 'best_guess', 'enrich_charity')),
  confidence            FLOAT       NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  explanation           TEXT        NOT NULL,
  proposed_action       JSONB,
  affected_fields       JSONB,
  estimated_impact      TEXT        CHECK (estimated_impact IN ('high', 'medium', 'low')),
  bulk_applicable       BOOLEAN     DEFAULT false,
  bulk_pattern          JSONB,
  estimated_rows_affected INT,
  status                TEXT        DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'auto_applied', 'dismissed')),
  applied_at            TIMESTAMPTZ,
  applied_by            UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE import_ai_suggestions IS 'AI-generated suggestions for resolving validation errors, ambiguous matches, or data quality issues within an import job.';
COMMENT ON COLUMN import_ai_suggestions.staging_table IS 'Name of the staging table this suggestion targets (e.g. staging_import_holdings).';
COMMENT ON COLUMN import_ai_suggestions.staging_row_id IS 'Primary key of the specific staging row this suggestion addresses.';
COMMENT ON COLUMN import_ai_suggestions.confidence IS 'Model confidence score in [0,1]; used to decide auto-apply vs. human review thresholds.';
COMMENT ON COLUMN import_ai_suggestions.bulk_applicable IS 'True when the same fix pattern applies to multiple rows; see bulk_pattern and estimated_rows_affected.';
COMMENT ON COLUMN import_ai_suggestions.bulk_pattern IS 'JSONB filter/pattern description used to identify all rows the bulk suggestion applies to.';
COMMENT ON COLUMN import_ai_suggestions.proposed_action IS 'Structured description of the change the AI recommends (field patches, skip flags, merge targets, etc.).';
COMMENT ON COLUMN import_ai_suggestions.affected_fields IS 'Array of field names that the suggested action would modify.';

-- ============================================================
-- 9. import_ai_feedback
-- ============================================================

CREATE TABLE import_ai_feedback (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  suggestion_id       UUID        NOT NULL REFERENCES import_ai_suggestions(id) ON DELETE CASCADE,
  user_id             UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_taken        TEXT        NOT NULL CHECK (action_taken IN ('apply', 'dismiss', 'modify', 'bulk_apply')),
  modified_suggestion JSONB,
  learned             BOOLEAN     DEFAULT true,
  notes               TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE import_ai_feedback IS 'Records user responses to AI suggestions; used to improve future suggestion quality via RLHF-style feedback loops.';
COMMENT ON COLUMN import_ai_feedback.action_taken IS 'How the user acted on the suggestion: apply as-is, dismiss, modify before apply, or bulk-apply.';
COMMENT ON COLUMN import_ai_feedback.modified_suggestion IS 'If the user chose "modify", this stores the adjusted suggestion JSONB as actually applied.';
COMMENT ON COLUMN import_ai_feedback.learned IS 'Flag indicating whether this feedback should be fed back into the fine-tuning/prompt pipeline.';

-- ============================================================
-- 10. import_audit_log
-- ============================================================

CREATE TABLE import_audit_log (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id   UUID        NOT NULL REFERENCES import_jobs(id) ON DELETE CASCADE,
  table_name      TEXT        NOT NULL,
  operation       TEXT        NOT NULL CHECK (operation IN ('insert', 'update', 'skip', 'error', 'rollback')),
  record_id       UUID        NOT NULL,
  staging_table   TEXT,
  staging_row_id  UUID,
  data_snapshot   JSONB,
  error_message   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE import_audit_log IS 'Immutable audit trail of every DML operation performed (or attempted) against production tables during an import job. Supports full rollback analysis.';
COMMENT ON COLUMN import_audit_log.table_name IS 'Target production table (e.g. holdings, investees, tax_contributions).';
COMMENT ON COLUMN import_audit_log.operation IS 'DML operation type; rollback entries represent reversal of a prior insert/update.';
COMMENT ON COLUMN import_audit_log.record_id IS 'PK of the production record affected.';
COMMENT ON COLUMN import_audit_log.data_snapshot IS 'JSON snapshot of the row state at time of operation (before for update/rollback, after for insert).';
COMMENT ON COLUMN import_audit_log.staging_row_id IS 'FK back to the staging row that drove this operation, for traceability.';

-- ============================================================
-- INDEXES
-- ============================================================

-- import_jobs
CREATE INDEX idx_import_jobs_portfolio_id  ON import_jobs (portfolio_id);
CREATE INDEX idx_import_jobs_status        ON import_jobs (status);
CREATE INDEX idx_import_jobs_created_at    ON import_jobs (created_at DESC);

-- staging_import_holdings
CREATE INDEX idx_sih_import_job_id         ON staging_import_holdings (import_job_id);
CREATE INDEX idx_sih_status_action         ON staging_import_holdings (validation_status, action_taken);

-- staging_import_investees
CREATE INDEX idx_sii_import_job_id         ON staging_import_investees (import_job_id);
CREATE INDEX idx_sii_status_action         ON staging_import_investees (validation_status, action_taken);

-- staging_import_contributions
CREATE INDEX idx_sic_import_job_id         ON staging_import_contributions (import_job_id);
CREATE INDEX idx_sic_status_action         ON staging_import_contributions (validation_status, action_taken);

-- staging_import_metrics
CREATE INDEX idx_sim_import_job_id         ON staging_import_metrics (import_job_id);
CREATE INDEX idx_sim_status_action         ON staging_import_metrics (validation_status, action_taken);

-- staging_import_users
CREATE INDEX idx_siu_import_job_id         ON staging_import_users (import_job_id);
CREATE INDEX idx_siu_status_action         ON staging_import_users (validation_status, action_taken);

-- import_ai_suggestions
CREATE INDEX idx_ias_job_status            ON import_ai_suggestions (import_job_id, status);
CREATE INDEX idx_ias_suggestion_type       ON import_ai_suggestions (suggestion_type);

-- import_ai_feedback
CREATE INDEX idx_iaf_suggestion_id         ON import_ai_feedback (suggestion_id);
CREATE INDEX idx_iaf_user_id               ON import_ai_feedback (user_id);

-- import_audit_log
CREATE INDEX idx_ial_import_job_id         ON import_audit_log (import_job_id);
CREATE INDEX idx_ial_table_record          ON import_audit_log (table_name, record_id);

-- ============================================================
-- TRIGGERS (updated_at)
-- ============================================================

CREATE TRIGGER trg_import_mapping_profiles_updated_at
  BEFORE UPDATE ON import_mapping_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER trg_import_jobs_updated_at
  BEFORE UPDATE ON import_jobs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE import_mapping_profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_jobs                ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging_import_holdings    ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging_import_investees   ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging_import_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging_import_metrics     ENABLE ROW LEVEL SECURITY;
ALTER TABLE staging_import_users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_ai_suggestions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_ai_feedback         ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_audit_log           ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------
-- import_mapping_profiles
-- ----------------------------------------------------------

CREATE POLICY "service_role_full_access_import_mapping_profiles"
  ON import_mapping_profiles
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_select_import_mapping_profiles"
  ON import_mapping_profiles
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin_full_access_import_mapping_profiles"
  ON import_mapping_profiles
  FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admins))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admins));

-- ----------------------------------------------------------
-- import_jobs
-- ----------------------------------------------------------

CREATE POLICY "service_role_full_access_import_jobs"
  ON import_jobs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_select_import_jobs"
  ON import_jobs
  FOR SELECT
  TO authenticated
  USING (
    portfolio_id IS NULL
    OR EXISTS (
      SELECT 1 FROM portfolio_members pm
      WHERE pm.portfolio_id = import_jobs.portfolio_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "admin_full_access_import_jobs"
  ON import_jobs
  FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admins))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admins));

-- ----------------------------------------------------------
-- staging_import_holdings
-- ----------------------------------------------------------

CREATE POLICY "service_role_full_access_staging_import_holdings"
  ON staging_import_holdings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_select_staging_import_holdings"
  ON staging_import_holdings
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM import_jobs j
      WHERE j.id = staging_import_holdings.import_job_id
        AND (
          j.portfolio_id IS NULL
          OR EXISTS (
            SELECT 1 FROM portfolio_members pm
            WHERE pm.portfolio_id = j.portfolio_id
              AND pm.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "admin_full_access_staging_import_holdings"
  ON staging_import_holdings
  FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admins))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admins));

-- ----------------------------------------------------------
-- staging_import_investees
-- ----------------------------------------------------------

CREATE POLICY "service_role_full_access_staging_import_investees"
  ON staging_import_investees
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_select_staging_import_investees"
  ON staging_import_investees
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM import_jobs j
      WHERE j.id = staging_import_investees.import_job_id
        AND (
          j.portfolio_id IS NULL
          OR EXISTS (
            SELECT 1 FROM portfolio_members pm
            WHERE pm.portfolio_id = j.portfolio_id
              AND pm.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "admin_full_access_staging_import_investees"
  ON staging_import_investees
  FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admins))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admins));

-- ----------------------------------------------------------
-- staging_import_contributions
-- ----------------------------------------------------------

CREATE POLICY "service_role_full_access_staging_import_contributions"
  ON staging_import_contributions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_select_staging_import_contributions"
  ON staging_import_contributions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM import_jobs j
      WHERE j.id = staging_import_contributions.import_job_id
        AND (
          j.portfolio_id IS NULL
          OR EXISTS (
            SELECT 1 FROM portfolio_members pm
            WHERE pm.portfolio_id = j.portfolio_id
              AND pm.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "admin_full_access_staging_import_contributions"
  ON staging_import_contributions
  FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admins))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admins));

-- ----------------------------------------------------------
-- staging_import_metrics
-- ----------------------------------------------------------

CREATE POLICY "service_role_full_access_staging_import_metrics"
  ON staging_import_metrics
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_select_staging_import_metrics"
  ON staging_import_metrics
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM import_jobs j
      WHERE j.id = staging_import_metrics.import_job_id
        AND (
          j.portfolio_id IS NULL
          OR EXISTS (
            SELECT 1 FROM portfolio_members pm
            WHERE pm.portfolio_id = j.portfolio_id
              AND pm.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "admin_full_access_staging_import_metrics"
  ON staging_import_metrics
  FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admins))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admins));

-- ----------------------------------------------------------
-- staging_import_users
-- ----------------------------------------------------------

CREATE POLICY "service_role_full_access_staging_import_users"
  ON staging_import_users
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_select_staging_import_users"
  ON staging_import_users
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM import_jobs j
      WHERE j.id = staging_import_users.import_job_id
        AND (
          j.portfolio_id IS NULL
          OR EXISTS (
            SELECT 1 FROM portfolio_members pm
            WHERE pm.portfolio_id = j.portfolio_id
              AND pm.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "admin_full_access_staging_import_users"
  ON staging_import_users
  FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admins))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admins));

-- ----------------------------------------------------------
-- import_ai_suggestions
-- ----------------------------------------------------------

CREATE POLICY "service_role_full_access_import_ai_suggestions"
  ON import_ai_suggestions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_select_import_ai_suggestions"
  ON import_ai_suggestions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM import_jobs j
      WHERE j.id = import_ai_suggestions.import_job_id
        AND (
          j.portfolio_id IS NULL
          OR EXISTS (
            SELECT 1 FROM portfolio_members pm
            WHERE pm.portfolio_id = j.portfolio_id
              AND pm.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "admin_full_access_import_ai_suggestions"
  ON import_ai_suggestions
  FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admins))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admins));

-- ----------------------------------------------------------
-- import_ai_feedback
-- ----------------------------------------------------------

CREATE POLICY "service_role_full_access_import_ai_feedback"
  ON import_ai_feedback
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_select_import_ai_feedback"
  ON import_ai_feedback
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM import_ai_suggestions s
      JOIN import_jobs j ON j.id = s.import_job_id
      WHERE s.id = import_ai_feedback.suggestion_id
        AND (
          j.portfolio_id IS NULL
          OR EXISTS (
            SELECT 1 FROM portfolio_members pm
            WHERE pm.portfolio_id = j.portfolio_id
              AND pm.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "admin_full_access_import_ai_feedback"
  ON import_ai_feedback
  FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admins))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admins));

-- ----------------------------------------------------------
-- import_audit_log
-- ----------------------------------------------------------

CREATE POLICY "service_role_full_access_import_audit_log"
  ON import_audit_log
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "authenticated_select_import_audit_log"
  ON import_audit_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM import_jobs j
      WHERE j.id = import_audit_log.import_job_id
        AND (
          j.portfolio_id IS NULL
          OR EXISTS (
            SELECT 1 FROM portfolio_members pm
            WHERE pm.portfolio_id = j.portfolio_id
              AND pm.user_id = auth.uid()
          )
        )
    )
  );

CREATE POLICY "admin_full_access_import_audit_log"
  ON import_audit_log
  FOR ALL
  TO authenticated
  USING (auth.uid() IN (SELECT user_id FROM admins))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM admins));

-- ============================================================
-- GRANTS
-- ============================================================

GRANT SELECT ON import_mapping_profiles     TO authenticated;
GRANT ALL    ON import_mapping_profiles     TO service_role;

GRANT SELECT ON import_jobs                 TO authenticated;
GRANT ALL    ON import_jobs                 TO service_role;

GRANT SELECT ON staging_import_holdings     TO authenticated;
GRANT ALL    ON staging_import_holdings     TO service_role;

GRANT SELECT ON staging_import_investees    TO authenticated;
GRANT ALL    ON staging_import_investees    TO service_role;

GRANT SELECT ON staging_import_contributions TO authenticated;
GRANT ALL    ON staging_import_contributions TO service_role;

GRANT SELECT ON staging_import_metrics      TO authenticated;
GRANT ALL    ON staging_import_metrics      TO service_role;

GRANT SELECT ON staging_import_users        TO authenticated;
GRANT ALL    ON staging_import_users        TO service_role;

GRANT SELECT ON import_ai_suggestions       TO authenticated;
GRANT ALL    ON import_ai_suggestions       TO service_role;

GRANT SELECT ON import_ai_feedback          TO authenticated;
GRANT ALL    ON import_ai_feedback          TO service_role;

GRANT SELECT ON import_audit_log            TO authenticated;
GRANT ALL    ON import_audit_log            TO service_role;

-- ============================================================
-- DEFAULT DATA
-- ============================================================

INSERT INTO import_mapping_profiles (
  name,
  source_system,
  description,
  is_default,
  entity_mappings
) VALUES (
  'Blackbaud RE NXT Standard',
  'blackbaud_re_nxt',
  'Default field mappings for Blackbaud Raiser''s Edge NXT CSV exports. Covers Constituents, Funds, Gifts, and Custom Fields.',
  true,
  '{"investees": {"source_entity": "Constituents", "field_map": {"display_name": {"source": "Name", "type": "string", "required": true, "confidence": 0.95}, "ein": {"source": "EIN", "type": "string", "transform": "normalize_ein", "confidence": 0.90}, "sector": {"source": "Classification", "type": "string", "confidence": 0.75}, "country": {"source": "Country", "type": "string", "default": "United States", "confidence": 0.85}}, "match_criteria": [{"fields": ["ein"], "weight": 2}, {"fields": ["display_name", "country"], "weight": 1}]}, "holdings": {"source_entity": "Funds", "field_map": {"name": {"source": "Fund Name", "type": "string", "required": true, "confidence": 0.95}, "custodian": {"source": "Custodian", "type": "string", "confidence": 0.85}, "funds_allocated": {"source": "Market Value", "type": "numeric", "confidence": 0.90}, "as_of": {"source": "As Of Date", "type": "date", "confidence": 0.88}}, "match_criteria": [{"fields": ["name", "portfolio_id"], "weight": 2}]}, "contributions": {"source_entity": "Gifts", "field_map": {"recipient_name": {"source": "Recipient Name", "type": "string", "required": true, "confidence": 0.93}, "recipient_ein": {"source": "EIN", "type": "string", "transform": "normalize_ein", "confidence": 0.88}, "contribution_date": {"source": "Gift Date", "type": "date", "required": true, "confidence": 0.95}, "amount_usd": {"source": "Amount", "type": "numeric", "required": true, "confidence": 0.97}, "contribution_type": {"source": "Gift Type", "type": "enum", "values_map": {"Cash": "cash", "Check": "check", "Stock": "stock", "Wire Transfer": "wire", "Cryptocurrency": "crypto", "Real Estate": "real_estate"}, "confidence": 0.90}}, "match_criteria": [{"fields": ["portfolio_id", "contribution_date", "amount_usd", "recipient_name"], "weight": 2}]}, "metrics": {"source_entity": "CustomFields", "field_map": {"metric_code": {"source": "Field Name", "type": "string", "transform": "slugify", "confidence": 0.70}, "value": {"source": "Field Value", "type": "numeric", "confidence": 0.85}, "period_start": {"source": "Date", "type": "date", "confidence": 0.80}}, "match_criteria": [{"fields": ["holding_id", "metric_code", "period_start"], "weight": 2}]}}'::jsonb
);
