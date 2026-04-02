-- Migration 0056: Reconciler helper functions
-- Provides server-side aggregation to avoid loading all JSONB blobs into JS

CREATE OR REPLACE FUNCTION sum_contribution_amounts(p_import_job_id UUID)
RETURNS TABLE(total NUMERIC) AS $$
  SELECT COALESCE(SUM((transformed_data->>'amount_usd')::numeric), 0) AS total
  FROM staging_import_contributions
  WHERE import_job_id = p_import_job_id
    AND validation_status IN ('valid', 'warning');
$$ LANGUAGE sql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION sum_contribution_amounts(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION sum_contribution_amounts(UUID) TO service_role;
