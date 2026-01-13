-- ============================================================================
-- Migration 0040: Migrate Data from kpi_definitions to portfolio_metric_targets
-- ============================================================================
-- Purpose: Copy existing KPI definitions to new table structure
--
-- Safety: Non-destructive - original table remains intact
-- Dependencies: Requires 0039_portfolio_metric_targets.sql
-- ============================================================================

BEGIN;

-- Migrate existing kpi_definitions to portfolio_metric_targets
INSERT INTO public.portfolio_metric_targets (
  portfolio_id,
  metric_code,
  target_value,
  target_date,
  display_name,
  notes,
  created_at,
  updated_at
)
SELECT
  portfolio_id,
  metric_code,
  target_value,
  target_date,
  display_name,
  description AS notes,  -- Map description → notes
  created_at,
  created_at AS updated_at  -- No updated_at in old table
FROM public.kpi_definitions
WHERE metric_code IS NOT NULL  -- Skip any invalid entries
ON CONFLICT (portfolio_id, metric_code) DO UPDATE SET
  -- If duplicate exists (shouldn't happen), keep the newer target
  target_value = EXCLUDED.target_value,
  target_date = EXCLUDED.target_date,
  display_name = EXCLUDED.display_name,
  notes = EXCLUDED.notes,
  updated_at = NOW();

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (Run manually to verify migration)
-- ============================================================================

-- Check row counts match
-- SELECT
--   (SELECT COUNT(*) FROM kpi_definitions WHERE metric_code IS NOT NULL) AS old_count,
--   (SELECT COUNT(*) FROM portfolio_metric_targets) AS new_count;

-- Compare sample data
-- SELECT
--   'OLD' as source, portfolio_id, metric_code, display_name, target_value, target_date
-- FROM kpi_definitions
-- WHERE metric_code IS NOT NULL
-- LIMIT 5
-- UNION ALL
-- SELECT
--   'NEW' as source, portfolio_id, metric_code, display_name, target_value, target_date
-- FROM portfolio_metric_targets
-- LIMIT 5;

-- Check for any missing migrations
-- SELECT kd.id, kd.portfolio_id, kd.metric_code
-- FROM kpi_definitions kd
-- LEFT JOIN portfolio_metric_targets pmt
--   ON kd.portfolio_id = pmt.portfolio_id
--   AND kd.metric_code = pmt.metric_code
-- WHERE kd.metric_code IS NOT NULL
--   AND pmt.id IS NULL;

-- ============================================================================
-- NOTES
-- ============================================================================
-- Fields dropped in migration:
--   - order_index: No longer needed (UI can sort by name/code)
--   - calculation: Was unused in codebase
--   - unit: Use metrics.unit instead (from metrics table)
--
-- Fields renamed:
--   - description → notes (clearer purpose)
--
-- If migration fails:
--   - Check for NULL metric_codes in kpi_definitions
--   - Check for orphaned metric_codes (not in metrics table)
--   - Run: SELECT * FROM kpi_definitions WHERE metric_code IS NULL;
--   - Run: SELECT * FROM kpi_definitions WHERE metric_code NOT IN (SELECT code FROM metrics);
-- ============================================================================
