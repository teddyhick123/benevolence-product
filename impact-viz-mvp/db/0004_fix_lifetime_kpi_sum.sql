-- Fix get_portfolio_latest_kpis_sum to sum ALL metric values across ALL time periods
-- This gives the total lifetime impact for each metric across the entire portfolio

CREATE OR REPLACE FUNCTION public.get_portfolio_latest_kpis_sum(p_portfolio_id uuid)
RETURNS TABLE (
  metric_code text,
  total_value numeric,
  latest_period text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT
    mf.metric_code,
    SUM(mf.value) as total_value,
    to_char(MAX(mf.period_end), 'YYYY-MM-DD') as latest_period
  FROM metric_facts mf
  JOIN holdings h ON h.id = mf.holding_id
  WHERE h.portfolio_id = p_portfolio_id
    AND mf.metric_code IS NOT NULL
    AND mf.value IS NOT NULL
  GROUP BY mf.metric_code
  ORDER BY mf.metric_code;
$$;