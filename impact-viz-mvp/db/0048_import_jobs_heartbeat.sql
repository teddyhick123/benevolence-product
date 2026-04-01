-- Migration: Import Job Heartbeat & Stale Detection
-- Description: Adds last_heartbeat_at for worker liveness tracking and a
--   DB function to detect/reap stale jobs stuck in 'running' state.
-- Date: 2026-03-31

-- Add heartbeat timestamp to import_jobs
ALTER TABLE import_jobs
  ADD COLUMN IF NOT EXISTS last_heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS stale_timeout_minutes INT NOT NULL DEFAULT 30;

COMMENT ON COLUMN import_jobs.last_heartbeat_at IS 'Updated every 30s by active worker. NULL = never started or pre-heartbeat job.';
COMMENT ON COLUMN import_jobs.stale_timeout_minutes IS 'Minutes without heartbeat before job is considered stale. Default 30.';

-- Index for efficient stale job queries
CREATE INDEX IF NOT EXISTS idx_import_jobs_heartbeat
  ON import_jobs(last_heartbeat_at, status)
  WHERE status = 'running';

-- Function: mark_stale_import_jobs()
-- Finds jobs stuck in 'running' with no heartbeat update for stale_timeout_minutes
-- and marks them 'failed'. Returns count of jobs reaped.
CREATE OR REPLACE FUNCTION mark_stale_import_jobs()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  reaped_count INTEGER;
BEGIN
  UPDATE import_jobs
  SET
    status = 'failed',
    notes = COALESCE(notes || E'\n', '') ||
      'Auto-failed by stale job watchdog at ' || NOW()::TEXT ||
      '. Worker heartbeat timed out after ' || stale_timeout_minutes || ' minutes.',
    completed_at = NOW(),
    updated_at = NOW()
  WHERE
    status = 'running'
    AND (
      -- Heartbeat present but too old
      (last_heartbeat_at IS NOT NULL
        AND last_heartbeat_at < NOW() - (stale_timeout_minutes || ' minutes')::INTERVAL)
      OR
      -- No heartbeat at all but started more than stale_timeout_minutes ago
      (last_heartbeat_at IS NULL
        AND started_at IS NOT NULL
        AND started_at < NOW() - (stale_timeout_minutes || ' minutes')::INTERVAL)
    );

  GET DIAGNOSTICS reaped_count = ROW_COUNT;
  RETURN reaped_count;
END;
$$;

COMMENT ON FUNCTION mark_stale_import_jobs IS
  'Marks running import jobs as failed if their worker heartbeat has timed out. Safe to call repeatedly.';

GRANT EXECUTE ON FUNCTION mark_stale_import_jobs TO service_role;
