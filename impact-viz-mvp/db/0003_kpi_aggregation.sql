-- Create view to get portfolio-level KPI series with proper aggregation
CREATE OR REPLACE VIEW public.v_portfolio_kpi_series AS
SELECT
  h.portfolio_id,
  kd.id as kpi_def_id,
  mf.metric_code,
  mf.period_end,
  SUM(mf.value) as value,
  MAX(mf.unit) as unit
FROM public.metric_facts mf
JOIN public.holdings h ON mf.holding_id = h.id
LEFT JOIN public.kpi_definitions kd ON kd.metric_code = mf.metric_code AND kd.portfolio_id = h.portfolio_id
WHERE h.portfolio_id IS NOT NULL
GROUP BY h.portfolio_id, kd.id, mf.metric_code, mf.period_end;

-- Create RPC function to get sum of latest KPIs for a portfolio
CREATE OR REPLACE FUNCTION public.get_portfolio_latest_kpis_sum(p_portfolio_id uuid)
RETURNS TABLE (
  metric_code text,
  total_value numeric,
  latest_period date
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH latest_per_holding AS (
    SELECT DISTINCT ON (h.id, mf.metric_code)
      h.id as holding_id,
      h.portfolio_id,
      mf.metric_code,
      mf.value,
      mf.period_end
    FROM public.metric_facts mf
    JOIN public.holdings h ON mf.holding_id = h.id
    WHERE h.portfolio_id = p_portfolio_id
      AND mf.metric_code IS NOT NULL
      AND mf.value IS NOT NULL
    ORDER BY h.id, mf.metric_code, mf.period_end DESC
  )
  SELECT
    lph.metric_code,
    SUM(lph.value) as total_value,
    MAX(lph.period_end) as latest_period
  FROM latest_per_holding lph
  GROUP BY lph.metric_code;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.get_portfolio_latest_kpis_sum(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_portfolio_latest_kpis_sum(uuid) TO anon;