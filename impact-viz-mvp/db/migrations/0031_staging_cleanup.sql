-- Migration: Staging PII Cleanup
-- Description: Add function to purge staging rows from completed import jobs older than 30 days.
--   Called: (a) explicitly by admins via API, (b) automatically when a new import job commits.
-- Date: 2026-05-06

-- Function: purge staging rows where the parent job finished > retention_days ago.
-- Returns the number of rows deleted across all staging tables.
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

  -- Delete from each staging table where the parent job is terminal and old
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

  DELETE FROM public.staging_import_investees
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

  DELETE FROM public.staging_import_users
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

-- Only service_role can call this function (called from admin API routes only)
REVOKE ALL ON FUNCTION public.cleanup_staging_pii(INT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_staging_pii(INT) TO service_role;
