/**
 * Database Function: Get Top KPIs Per Holding
 *
 * Purpose: Fetch the top N KPIs for each holding to display in map popover
 *
 * Used by: /api/portfolio/[id]/map endpoint to enrich map points with KPI data
 *
 * Features:
 * - Fetches latest KPI values for each holding
 * - Joins kpi_definitions for display names and metadata
 * - Ordered by order_index (user-defined priority) then by value DESC
 * - Configurable limit per holding
 */

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.get_top_kpis_per_holding(UUID[], INTEGER);

-- Create the function
CREATE OR REPLACE FUNCTION public.get_top_kpis_per_holding(
  p_holding_ids UUID[],
  p_limit INTEGER DEFAULT 3
)
RETURNS TABLE (
  holding_id UUID,
  metric_code TEXT,
  display_name TEXT,
  value DOUBLE PRECISION,
  unit TEXT,
  period_end TIMESTAMPTZ,
  order_index INTEGER,
  description TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH latest_facts AS (
    -- Get the most recent metric_fact for each (holding_id, metric_code) pair
    SELECT DISTINCT ON (mf.holding_id, mf.metric_code)
      mf.holding_id,
      mf.metric_code,
      mf.value,
      mf.period_end
    FROM public.metric_facts mf
    WHERE mf.holding_id = ANY(p_holding_ids)
      AND mf.value IS NOT NULL
    ORDER BY mf.holding_id, mf.metric_code, mf.period_end DESC
  ),
  ranked_kpis AS (
    -- Join with kpi_definitions and rank by priority
    SELECT
      lf.holding_id,
      lf.metric_code,
      COALESCE(kd.display_name, lf.metric_code) AS display_name,
      lf.value,
      kd.unit,
      lf.period_end,
      COALESCE(kd.order_index, 999999) AS order_index,
      kd.description,
      ROW_NUMBER() OVER (
        PARTITION BY lf.holding_id
        ORDER BY COALESCE(kd.order_index, 999999) ASC, lf.value DESC
      ) AS rank
    FROM latest_facts lf
    LEFT JOIN public.kpi_definitions kd
      ON lf.metric_code = kd.metric_code
      AND kd.portfolio_id IN (
        SELECT h.portfolio_id
        FROM public.holdings h
        WHERE h.id = lf.holding_id
      )
  )
  SELECT
    rk.holding_id,
    rk.metric_code,
    rk.display_name,
    rk.value,
    rk.unit,
    rk.period_end,
    rk.order_index,
    rk.description
  FROM ranked_kpis rk
  WHERE rk.rank <= p_limit
  ORDER BY rk.holding_id, rk.rank;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_top_kpis_per_holding(UUID[], INTEGER) TO authenticated;

-- Add comment
COMMENT ON FUNCTION public.get_top_kpis_per_holding(UUID[], INTEGER) IS
'Fetches top N KPIs for each holding, ordered by user-defined priority (order_index) then value. Used for map popover display.';
