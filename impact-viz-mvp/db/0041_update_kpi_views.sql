-- ============================================================================
-- Migration 0041: Update KPI Views to Use portfolio_metric_targets
-- ============================================================================
-- Purpose: Replace kpi_definitions references with portfolio_metric_targets
--
-- Views updated:
--   - v_portfolio_kpi_series (from 0003_kpi_aggregation.sql)
--   - v_portfolio_kpi_latest (from 0038_v_portfolio_kpi_latest.sql)
--
-- Key changes:
--   - Remove kpi_def_id (no longer exists)
--   - LEFT JOIN portfolio_metric_targets for targets/display_name
--   - All metrics with data now visible (not filtered by definitions)
--
-- Dependencies: Requires 0039 & 0040 (table + data)
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. Update v_portfolio_kpi_series
-- ============================================================================
-- Purpose: Aggregate metric_facts to portfolio level for ALL time periods
-- OLD: Joined kpi_definitions (optional), filtered by kpi_def_id
-- NEW: Show all metrics with data, join targets for optional overlay

DROP VIEW IF EXISTS public.v_portfolio_kpi_series CASCADE;

CREATE OR REPLACE VIEW public.v_portfolio_kpi_series AS
SELECT
  h.portfolio_id,
  mf.metric_code,
  m.name AS metric_name,
  mf.period_end,
  SUM(mf.value) AS value,
  MAX(mf.unit) AS unit,
  -- Optional target overlay
  pmt.target_value,
  pmt.target_date,
  COALESCE(pmt.display_name, m.name) AS display_name
FROM public.metric_facts mf
JOIN public.holdings h ON mf.holding_id = h.id
JOIN public.metrics m ON mf.metric_code = m.code
LEFT JOIN public.portfolio_metric_targets pmt
  ON pmt.portfolio_id = h.portfolio_id
  AND pmt.metric_code = mf.metric_code
WHERE h.portfolio_id IS NOT NULL
  AND mf.metric_code IS NOT NULL
GROUP BY
  h.portfolio_id,
  mf.metric_code,
  m.name,
  mf.period_end,
  pmt.target_value,
  pmt.target_date,
  pmt.display_name;

-- ============================================================================
-- 2. Update v_portfolio_kpi_latest
-- ============================================================================
-- Purpose: Get LATEST period value for each metric per portfolio
-- OLD: Used kpi_def_id as key
-- NEW: Use (portfolio_id, metric_code) as key

DROP VIEW IF EXISTS public.v_portfolio_kpi_latest CASCADE;

CREATE OR REPLACE VIEW public.v_portfolio_kpi_latest AS
WITH latest_per_metric AS (
  SELECT DISTINCT ON (portfolio_id, metric_code)
    portfolio_id,
    metric_code,
    metric_name,
    value,
    unit,
    period_end,
    target_value,
    target_date,
    display_name
  FROM public.v_portfolio_kpi_series
  ORDER BY portfolio_id, metric_code, period_end DESC
)
SELECT
  portfolio_id,
  metric_code,
  metric_name,
  display_name,
  value,
  unit,
  period_end,
  NULL::date AS period_start,  -- Not tracked in aggregations
  target_value,
  target_date,
  -- Progress calculation
  CASE
    WHEN target_value IS NOT NULL AND target_value != 0
    THEN (value / target_value * 100)
    ELSE NULL
  END AS progress_percentage
FROM latest_per_metric;

-- Grant permissions
GRANT SELECT ON public.v_portfolio_kpi_series TO authenticated;
GRANT SELECT ON public.v_portfolio_kpi_series TO anon;
GRANT SELECT ON public.v_portfolio_kpi_latest TO authenticated;
GRANT SELECT ON public.v_portfolio_kpi_latest TO anon;

COMMIT;

-- ============================================================================
-- BREAKING CHANGES
-- ============================================================================
-- Fields removed from views:
--   - kpi_def_id: No longer exists (was UUID from kpi_definitions)
--
-- Fields added to views:
--   - metric_name: from metrics.name (always present)
--   - target_value: from portfolio_metric_targets (nullable)
--   - target_date: from portfolio_metric_targets (nullable)
--   - progress_percentage: calculated (nullable)
--
-- Behavior changes:
--   - OLD: Only metrics with kpi_definitions entry were visible
--   - NEW: ALL metrics with data in metric_facts are visible
--   - Targets are optional overlay (can be NULL)
--
-- API Route Updates Needed:
--   - /api/portfolio/[id]/kpis/route.ts - Remove kpi_def_id references
--   - /api/portfolio/[id]/kpis/[kpiId]/route.ts - Change param to metric_code
--   - /api/portfolio/[id]/letter/route.ts - Remove kpi_def_id filtering
--   - /api/portfolio/[id]/summary/route.ts - Remove kpi_def_id filtering
--
-- Frontend Component Updates Needed:
--   - components/KpiSection.tsx - Remove kpi_def_id, use metric_code as key
--   - Dashboard queries - Use metric_code instead of kpi_def_id
-- ============================================================================

-- Verification query (run manually)
-- SELECT
--   portfolio_id,
--   metric_code,
--   display_name,
--   value,
--   unit,
--   target_value,
--   progress_percentage
-- FROM v_portfolio_kpi_latest
-- LIMIT 10;
