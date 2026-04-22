-- ============================================================================
-- Migration 0038: Create v_portfolio_kpi_latest View
-- ============================================================================
-- Purpose: Provide latest KPI values per portfolio for API endpoints
-- Dependencies: Requires v_portfolio_kpi_series (from 0003_kpi_aggregation.sql)
-- Used by:
--   - /api/portfolio/[id]/kpis (GET, POST)
--   - /api/portfolio/[id]/kpis/[kpiId] (PATCH)
--   - /api/portfolio/[id]/summary (GET)
--   - /api/portfolio/[id]/letter (GET)
--   - /api/portfolio/[id]/letter/generate (POST)
-- ============================================================================

-- Drop view if it exists (in case this was previously created and dropped)
DROP VIEW IF EXISTS public.v_portfolio_kpi_latest;

-- Create view that returns the latest KPI value for each kpi_definition
CREATE OR REPLACE VIEW public.v_portfolio_kpi_latest AS
WITH latest_per_kpi AS (
  SELECT DISTINCT ON (portfolio_id, kpi_def_id)
    portfolio_id,
    kpi_def_id,
    metric_code,
    value,
    unit,
    period_end
  FROM public.v_portfolio_kpi_series
  WHERE kpi_def_id IS NOT NULL
  ORDER BY portfolio_id, kpi_def_id, period_end DESC
)
SELECT
  lpk.portfolio_id,
  lpk.kpi_def_id,
  lpk.metric_code,
  kd.display_name,
  lpk.value,
  lpk.unit,
  lpk.period_end,
  -- Note: period_start not available in v_portfolio_kpi_series aggregation
  -- API routes that need period_start should query metric_facts directly
  NULL::date as period_start
FROM latest_per_kpi lpk
LEFT JOIN public.kpi_definitions kd ON kd.id = lpk.kpi_def_id;

-- Create index on underlying v_portfolio_kpi_series for performance
-- (If it doesn't already exist - this is safe to run multiple times)
-- Note: Views can't have indexes directly, but the underlying table can
CREATE INDEX IF NOT EXISTS idx_metric_facts_holding_code_period
  ON public.metric_facts(holding_id, metric_code, period_end DESC);

-- Grant permissions
GRANT SELECT ON public.v_portfolio_kpi_latest TO authenticated;
GRANT SELECT ON public.v_portfolio_kpi_latest TO anon;

-- Verification query (comment out for production):
-- SELECT * FROM v_portfolio_kpi_latest LIMIT 5;

-- ============================================================================
-- NOTES
-- ============================================================================
-- This view provides a "flattened" latest value per KPI definition.
--
-- Key design decisions:
-- 1. Uses DISTINCT ON to get latest period_end per (portfolio_id, kpi_def_id)
-- 2. Joins back to kpi_definitions to include display_name (needed by summary endpoint)
-- 3. Returns NULL for period_start since v_portfolio_kpi_series doesn't track it
-- 4. Only includes KPIs with defined kpi_def_id (filters out metrics without definitions)
--
-- Performance considerations:
-- - View is lightweight (no aggregation, just filtering + join)
-- - DISTINCT ON is efficient with proper indexes
-- - Index on metric_facts(holding_id, metric_code, period_end DESC) helps underlying queries
-- ============================================================================
