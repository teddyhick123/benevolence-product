-- Migration 0057: Fix get_top_kpis_per_holding — remove dangling kpi_definitions JOIN
-- kpi_definitions was dropped in 0042; rewrite to use v_portfolio_kpi_latest instead

DROP FUNCTION IF EXISTS public.get_top_kpis_per_holding(UUID[], INTEGER);

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
    SELECT DISTINCT ON (mf.holding_id, mf.metric_code)
      mf.holding_id,
      mf.metric_code,
      mf.value,
      mf.unit,
      mf.period_end
    FROM public.metric_facts mf
    WHERE mf.holding_id = ANY(p_holding_ids)
      AND mf.value IS NOT NULL
    ORDER BY mf.holding_id, mf.metric_code, mf.period_end DESC
  ),
  enriched AS (
    SELECT
      lf.holding_id,
      lf.metric_code,
      COALESCE(pmt.display_name, lf.metric_code) AS display_name,
      lf.value,
      lf.unit,
      lf.period_end,
      COALESCE(pmt.order_index, 999999) AS order_index,
      pmt.description,
      ROW_NUMBER() OVER (
        PARTITION BY lf.holding_id
        ORDER BY COALESCE(pmt.order_index, 999999) ASC, lf.value DESC
      ) AS rank
    FROM latest_facts lf
    LEFT JOIN public.portfolio_metric_targets pmt
      ON pmt.metric_code = lf.metric_code
      AND pmt.portfolio_id IN (
        SELECT h.portfolio_id
        FROM public.holdings h
        WHERE h.id = lf.holding_id
      )
  )
  SELECT
    e.holding_id,
    e.metric_code,
    e.display_name,
    e.value,
    e.unit,
    e.period_end,
    e.order_index,
    e.description
  FROM enriched e
  WHERE e.rank <= p_limit
  ORDER BY e.holding_id, e.rank;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_kpis_per_holding(UUID[], INTEGER) TO authenticated;

COMMENT ON FUNCTION public.get_top_kpis_per_holding(UUID[], INTEGER) IS
'Fetches top N KPIs for each holding using portfolio_metric_targets (replaces kpi_definitions removed in 0042).';
