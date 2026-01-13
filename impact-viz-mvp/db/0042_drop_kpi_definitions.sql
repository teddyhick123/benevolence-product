-- ============================================================================
-- Migration 0042: Drop kpi_definitions Table
-- ============================================================================
-- Purpose: Remove deprecated kpi_definitions table after migration
--
-- DANGER: This is a DESTRUCTIVE migration
-- Only run after:
--   1. 0039 - portfolio_metric_targets created
--   2. 0040 - data migrated
--   3. 0041 - views updated
--   4. API routes updated to use new structure
--
-- Rollback: If issues found, restore from backup before running
-- ============================================================================

BEGIN;

-- ============================================================================
-- Safety checks before dropping
-- ============================================================================

-- Verify portfolio_metric_targets has data
DO $$
DECLARE
  target_count INTEGER;
  old_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO target_count FROM public.portfolio_metric_targets;
  SELECT COUNT(*) INTO old_count FROM public.kpi_definitions WHERE metric_code IS NOT NULL;

  IF target_count = 0 AND old_count > 0 THEN
    RAISE EXCEPTION 'SAFETY CHECK FAILED: portfolio_metric_targets is empty but kpi_definitions has % rows. Run migration 0040 first.', old_count;
  END IF;

  IF target_count < old_count THEN
    RAISE WARNING 'portfolio_metric_targets has % rows but kpi_definitions has %. Some data may not have migrated.', target_count, old_count;
  END IF;

  RAISE NOTICE '✓ Safety check passed: portfolio_metric_targets has % rows (kpi_definitions had %)', target_count, old_count;
END $$;

-- ============================================================================
-- Drop dependent objects first
-- ============================================================================

-- Drop foreign key constraint from kpi_definitions if it exists
ALTER TABLE IF EXISTS public.kpi_definitions
  DROP CONSTRAINT IF EXISTS kpi_definitions_portfolio_id_fkey;

ALTER TABLE IF EXISTS public.kpi_definitions
  DROP CONSTRAINT IF EXISTS kpi_definitions_metric_code_fkey;

-- Drop any indexes on kpi_definitions
DROP INDEX IF EXISTS public.idx_kpi_definitions_portfolio;
DROP INDEX IF EXISTS public.idx_kpi_definitions_metric_code;

-- ============================================================================
-- Drop the table
-- ============================================================================

DROP TABLE IF EXISTS public.kpi_definitions CASCADE;

RAISE NOTICE '✓ Dropped kpi_definitions table';

-- ============================================================================
-- Update get_portfolio_latest_kpis_sum function
-- ============================================================================
-- This function was created in 0003_kpi_aggregation.sql
-- Update it to work without kpi_definitions

DROP FUNCTION IF EXISTS public.get_portfolio_latest_kpis_sum(uuid);

CREATE OR REPLACE FUNCTION public.get_portfolio_latest_kpis_sum(p_portfolio_id uuid)
RETURNS TABLE (
  metric_code text,
  metric_name text,
  total_value numeric,
  latest_period date,
  unit text,
  target_value numeric,
  target_date date,
  progress_percentage numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH latest_per_holding AS (
    SELECT DISTINCT ON (h.id, mf.metric_code)
      h.id AS holding_id,
      h.portfolio_id,
      mf.metric_code,
      mf.value,
      mf.period_end,
      mf.unit
    FROM public.metric_facts mf
    JOIN public.holdings h ON mf.holding_id = h.id
    WHERE h.portfolio_id = p_portfolio_id
      AND mf.metric_code IS NOT NULL
      AND mf.value IS NOT NULL
    ORDER BY h.id, mf.metric_code, mf.period_end DESC
  )
  SELECT
    lph.metric_code,
    m.name AS metric_name,
    SUM(lph.value) AS total_value,
    MAX(lph.period_end) AS latest_period,
    MAX(lph.unit) AS unit,
    pmt.target_value,
    pmt.target_date,
    CASE
      WHEN pmt.target_value IS NOT NULL AND pmt.target_value != 0
      THEN (SUM(lph.value) / pmt.target_value * 100)
      ELSE NULL
    END AS progress_percentage
  FROM latest_per_holding lph
  JOIN public.metrics m ON m.code = lph.metric_code
  LEFT JOIN public.portfolio_metric_targets pmt
    ON pmt.portfolio_id = lph.portfolio_id
    AND pmt.metric_code = lph.metric_code
  GROUP BY lph.metric_code, m.name, pmt.target_value, pmt.target_date;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_portfolio_latest_kpis_sum(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_portfolio_latest_kpis_sum(uuid) TO anon;

RAISE NOTICE '✓ Updated get_portfolio_latest_kpis_sum function';

COMMIT;

-- ============================================================================
-- POST-MIGRATION VERIFICATION
-- ============================================================================
-- Run these queries manually to verify migration success:

-- 1. Verify table is gone
-- SELECT COUNT(*) FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'kpi_definitions';
-- Expected: 0

-- 2. Verify views work
-- SELECT * FROM v_portfolio_kpi_latest LIMIT 5;
-- Expected: Returns rows without errors

-- 3. Verify function works
-- SELECT * FROM get_portfolio_latest_kpis_sum('your-portfolio-id-here');
-- Expected: Returns metrics with targets

-- 4. Check for broken references
-- SELECT n.nspname, c.relname
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- WHERE c.relname LIKE '%kpi_definition%';
-- Expected: Empty (no remaining references)

-- ============================================================================
-- ROLLBACK PLAN
-- ============================================================================
-- If issues found after this migration:
--
-- 1. Restore database from backup (BEFORE this migration)
-- 2. Fix API routes to work with portfolio_metric_targets
-- 3. Re-run migrations 0039-0042 in sequence
--
-- DO NOT try to recreate kpi_definitions - it's been replaced by design
-- ============================================================================
