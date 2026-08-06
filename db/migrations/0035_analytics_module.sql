-- =============================================================================
-- 0035_analytics_module.sql
-- Analytics module: benchmarks, metric projections, portfolio risk snapshots,
-- and AI-generated insights.
-- Depends on: 0004, 0006, 0008, 0010
-- =============================================================================

-- ---------------------------------------------------------------------------
-- benchmark_data
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.benchmark_data (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_type   TEXT NOT NULL CHECK (benchmark_type IN ('sector', 'size_band', 'geography', 'asset_class', 'custom')),
  benchmark_name   TEXT NOT NULL,
  benchmark_key    TEXT NOT NULL,
  metric_code      TEXT NOT NULL,
  metric_value     NUMERIC NOT NULL,
  unit             TEXT,
  percentile_25    NUMERIC,
  percentile_50    NUMERIC,
  percentile_75    NUMERIC,
  sample_size      INTEGER,
  std_deviation    NUMERIC,
  period_start     DATE,
  period_end       DATE,
  data_year        INTEGER NOT NULL,
  data_source      TEXT,
  confidence_level TEXT CHECK (confidence_level IN ('high', 'medium', 'low')),
  last_updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (benchmark_type, benchmark_key, metric_code, data_year)
);

CREATE INDEX IF NOT EXISTS idx_benchmark_data_type_key ON public.benchmark_data(benchmark_type, benchmark_key);
CREATE INDEX IF NOT EXISTS idx_benchmark_data_metric   ON public.benchmark_data(metric_code);
CREATE INDEX IF NOT EXISTS idx_benchmark_data_year     ON public.benchmark_data(data_year DESC);

-- ---------------------------------------------------------------------------
-- metric_projections_cache
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.metric_projections_cache (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id            UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  holding_id              UUID REFERENCES public.holdings(id) ON DELETE CASCADE,
  metric_code             TEXT NOT NULL,
  method                  TEXT NOT NULL CHECK (method IN ('linear', 'exponential', 'moving_average', 'monte_carlo')),
  periods_ahead           INTEGER NOT NULL,
  historical_data_points  INTEGER NOT NULL,
  trend_direction         TEXT CHECK (trend_direction IN ('increasing', 'decreasing', 'stable', 'volatile')),
  slope_per_period        NUMERIC,
  r_squared               NUMERIC,
  projections             JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at              TIMESTAMPTZ NOT NULL,
  is_stale                BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projections_cache_portfolio ON public.metric_projections_cache(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_projections_cache_holding   ON public.metric_projections_cache(holding_id) WHERE holding_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projections_cache_metric    ON public.metric_projections_cache(metric_code);
CREATE INDEX IF NOT EXISTS idx_projections_cache_expires   ON public.metric_projections_cache(expires_at) WHERE NOT is_stale;

-- ---------------------------------------------------------------------------
-- portfolio_risk_snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.portfolio_risk_snapshots (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id               UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  snapshot_date              DATE NOT NULL DEFAULT CURRENT_DATE,
  total_holdings             INTEGER NOT NULL,
  total_allocation           NUMERIC NOT NULL,
  concentration_top3_percent NUMERIC,
  concentration_top3_holdings JSONB NOT NULL DEFAULT '[]'::jsonb,
  concentration_risk_level   TEXT CHECK (concentration_risk_level IN ('low', 'medium', 'high', 'critical')),
  herfindahl_index           NUMERIC,
  sector_distribution        JSONB NOT NULL DEFAULT '{}'::jsonb,
  sector_count               INTEGER,
  largest_sector_percent     NUMERIC,
  sector_risk_level          TEXT CHECK (sector_risk_level IN ('low', 'medium', 'high', 'critical')),
  geography_distribution     JSONB NOT NULL DEFAULT '{}'::jsonb,
  geography_count            INTEGER,
  largest_geography_percent  NUMERIC,
  geography_risk_level       TEXT CHECK (geography_risk_level IN ('low', 'medium', 'high', 'critical')),
  asset_type_distribution    JSONB NOT NULL DEFAULT '{}'::jsonb,
  asset_type_count           INTEGER,
  overall_risk_score         NUMERIC,
  overall_risk_level         TEXT CHECK (overall_risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_factors               JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations            JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portfolio_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_risk_snapshots_portfolio   ON public.portfolio_risk_snapshots(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_risk_snapshots_date        ON public.portfolio_risk_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_risk_snapshots_risk_level  ON public.portfolio_risk_snapshots(overall_risk_level);

-- ---------------------------------------------------------------------------
-- analytics_insights
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.analytics_insights (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id     UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  holding_id       UUID REFERENCES public.holdings(id) ON DELETE SET NULL,
  insight_type     TEXT NOT NULL CHECK (insight_type IN (
                     'trend_alert', 'anomaly', 'opportunity', 'risk_warning',
                     'performance_highlight', 'benchmark_comparison', 'recommendation')),
  category         TEXT NOT NULL CHECK (category IN (
                     'performance', 'risk', 'diversification', 'efficiency',
                     'impact', 'financial', 'operational')),
  title            TEXT NOT NULL,
  description      TEXT NOT NULL,
  severity         TEXT CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  metric_code      TEXT,
  metric_value     NUMERIC,
  comparison_value NUMERIC,
  change_percent   NUMERIC,
  data_context     JSONB NOT NULL DEFAULT '{}'::jsonb,
  suggested_actions JSONB NOT NULL DEFAULT '[]'::jsonb,
  action_taken     BOOLEAN NOT NULL DEFAULT false,
  action_taken_at  TIMESTAMPTZ,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  dismissed_at     TIMESTAMPTZ,
  dismissed_by     UUID REFERENCES auth.users(id),
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_insights_portfolio ON public.analytics_insights(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_analytics_insights_holding   ON public.analytics_insights(holding_id) WHERE holding_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_insights_type      ON public.analytics_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_analytics_insights_active    ON public.analytics_insights(portfolio_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_analytics_insights_severity  ON public.analytics_insights(severity) WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- generated_financial_analyses — AI-generated financial analysis snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.generated_financial_analyses (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  holding_id          UUID REFERENCES public.holdings(id) ON DELETE CASCADE,
  charity_id          UUID REFERENCES public.charities(id) ON DELETE SET NULL,
  generated_by        UUID REFERENCES auth.users(id),

  analysis_content    JSONB NOT NULL DEFAULT '{}',
  financial_snapshot  JSONB NOT NULL DEFAULT '{}',
  generated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  version             INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_gen_fin_analyses_holding_id ON public.generated_financial_analyses(holding_id);
CREATE INDEX IF NOT EXISTS idx_gen_fin_analyses_charity_id ON public.generated_financial_analyses(charity_id);
CREATE INDEX IF NOT EXISTS idx_gen_fin_analyses_version ON public.generated_financial_analyses(holding_id, version DESC);

-- ---------------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_investment_performance
  WITH (security_invoker = true)
AS
SELECT
  h.portfolio_id,
  h.id AS holding_id,
  h.name,
  h.asset_type,
  h.status,
  h.funds_allocated AS cost_basis,
  COALESCE(h.current_value, h.fmv, h.funds_allocated) AS current_nav,
  CASE
    WHEN h.funds_allocated > 0
    THEN ROUND((COALESCE(h.current_value, h.fmv, h.funds_allocated) / h.funds_allocated)::numeric, 4)
    ELSE NULL
  END AS moic,
  CASE
    WHEN h.funds_allocated > 0
    THEN ROUND(((COALESCE(h.current_value, h.fmv, h.funds_allocated) - h.funds_allocated) / h.funds_allocated * 100)::numeric, 2)
    ELSE NULL
  END AS return_pct,
  h.sector,
  h.country,
  h.created_at AS invested_at,
  h.ein
FROM public.holdings h
WHERE h.deleted_at IS NULL;

GRANT SELECT ON public.v_investment_performance TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_portfolio_investment_summary
  WITH (security_invoker = true)
AS
SELECT
  h.portfolio_id,
  COUNT(*) AS total_holdings,
  COUNT(*) FILTER (WHERE h.status = 'active') AS active_holdings,
  COALESCE(SUM(h.funds_allocated), 0) AS total_cost_basis,
  COALESCE(SUM(COALESCE(h.current_value, h.fmv, h.funds_allocated)), 0) AS total_nav,
  CASE
    WHEN SUM(h.funds_allocated) > 0
    THEN ROUND((SUM(COALESCE(h.current_value, h.fmv, h.funds_allocated)) / SUM(h.funds_allocated))::numeric, 4)
    ELSE NULL
  END AS portfolio_moic,
  CASE
    WHEN SUM(h.funds_allocated) > 0
    THEN ROUND(((SUM(COALESCE(h.current_value, h.fmv, h.funds_allocated)) - SUM(h.funds_allocated)) / SUM(h.funds_allocated) * 100)::numeric, 2)
    ELSE NULL
  END AS portfolio_return_pct,
  COUNT(DISTINCT h.sector) FILTER (WHERE h.sector IS NOT NULL) AS sector_count,
  COUNT(DISTINCT h.country) FILTER (WHERE h.country IS NOT NULL) AS country_count
FROM public.holdings h
WHERE h.deleted_at IS NULL
GROUP BY h.portfolio_id;

GRANT SELECT ON public.v_portfolio_investment_summary TO authenticated, service_role;

CREATE OR REPLACE VIEW public.v_latest_risk_snapshot
  WITH (security_invoker = true)
AS
SELECT DISTINCT ON (portfolio_id) *
FROM public.portfolio_risk_snapshots
ORDER BY portfolio_id, snapshot_date DESC;

CREATE OR REPLACE VIEW public.v_active_insights
  WITH (security_invoker = true)
AS
SELECT
  ai.*,
  h.name   AS holding_name,
  h.sector AS holding_sector
FROM public.analytics_insights ai
LEFT JOIN public.holdings h ON ai.holding_id = h.id
WHERE ai.is_active = true
  AND (ai.expires_at IS NULL OR ai.expires_at > NOW())
ORDER BY
  CASE ai.severity
    WHEN 'critical' THEN 1
    WHEN 'high'     THEN 2
    WHEN 'medium'   THEN 3
    WHEN 'low'      THEN 4
    ELSE 5
  END,
  ai.created_at DESC;

CREATE OR REPLACE VIEW public.v_benchmark_lookup
  WITH (security_invoker = true)
AS
SELECT
  benchmark_type, benchmark_key, metric_code, data_year,
  metric_value, percentile_25, percentile_50, percentile_75,
  sample_size, data_source, confidence_level
FROM public.benchmark_data
WHERE data_year IN (
  EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
  EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER - 1
)
ORDER BY benchmark_type, benchmark_key, metric_code, data_year DESC;

-- ---------------------------------------------------------------------------
-- Helper functions
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.calculate_hhi(p_portfolio_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_total NUMERIC;
  v_hhi   NUMERIC := 0;
  r       RECORD;
BEGIN
  SELECT COALESCE(SUM(funds_allocated), 0) INTO v_total
  FROM public.holdings
  WHERE portfolio_id = p_portfolio_id AND deleted_at IS NULL;
  IF v_total = 0 THEN RETURN 0; END IF;
  FOR r IN SELECT funds_allocated FROM public.holdings
           WHERE portfolio_id = p_portfolio_id
             AND deleted_at IS NULL
             AND funds_allocated > 0
  LOOP
    v_hhi := v_hhi + POWER((r.funds_allocated / v_total) * 100, 2);
  END LOOP;
  RETURN ROUND(v_hhi, 2);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_concentration_risk_level(p_hhi NUMERIC)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF p_hhi >= 2500 THEN RETURN 'critical';
  ELSIF p_hhi >= 1500 THEN RETURN 'high';
  ELSIF p_hhi >= 1000 THEN RETURN 'medium';
  ELSE RETURN 'low';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.calculate_hhi(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_concentration_risk_level(NUMERIC) TO authenticated;

-- Generate and persist one deterministic risk snapshot per portfolio/day.
-- The permission check and upsert are one database operation so callers cannot
-- race a separate authorization or existence check.
CREATE OR REPLACE FUNCTION public.generate_risk_snapshot(p_portfolio_id UUID)
RETURNS UUID
LANGUAGE plpgsql
VOLATILE
SET search_path = public
AS $$
DECLARE
  v_snapshot_id UUID;
  v_total_holdings INTEGER;
  v_total_allocation NUMERIC;
  v_top3_percent NUMERIC := 0;
  v_top3 JSONB := '[]'::jsonb;
  v_hhi NUMERIC := 0;
  v_concentration_level TEXT;
  v_sector_distribution JSONB := '[]'::jsonb;
  v_sector_count INTEGER := 0;
  v_largest_sector_percent NUMERIC := 0;
  v_sector_level TEXT;
  v_geography_distribution JSONB := '[]'::jsonb;
  v_geography_count INTEGER := 0;
  v_largest_geography_percent NUMERIC := 0;
  v_geography_level TEXT;
  v_asset_type_distribution JSONB := '[]'::jsonb;
  v_asset_type_count INTEGER := 0;
  v_overall_score NUMERIC;
  v_overall_level TEXT;
  v_risk_factors JSONB := '[]'::jsonb;
  v_recommendations JSONB := '[]'::jsonb;
BEGIN
  IF COALESCE(auth.role(), '') <> 'service_role'
     AND NOT public.can_edit_portfolio(p_portfolio_id) THEN
    RAISE EXCEPTION 'not authorized to generate a risk snapshot for portfolio %', p_portfolio_id
      USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(*)::INTEGER, COALESCE(SUM(COALESCE(funds_allocated, 0)), 0)
    INTO v_total_holdings, v_total_allocation
  FROM public.holdings
  WHERE portfolio_id = p_portfolio_id
    AND deleted_at IS NULL;

  WITH ranked AS (
    SELECT id, name, COALESCE(funds_allocated, 0) AS allocation
    FROM public.holdings
    WHERE portfolio_id = p_portfolio_id AND deleted_at IS NULL
    ORDER BY COALESCE(funds_allocated, 0) DESC, id
    LIMIT 3
  )
  SELECT
    COALESCE(ROUND(SUM(allocation) / NULLIF(v_total_allocation, 0) * 100, 2), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', id,
      'name', name,
      'allocation', allocation,
      'percent', COALESCE(ROUND(allocation / NULLIF(v_total_allocation, 0) * 100, 2), 0)
    ) ORDER BY allocation DESC, id), '[]'::jsonb)
  INTO v_top3_percent, v_top3
  FROM ranked;

  v_hhi := public.calculate_hhi(p_portfolio_id);
  v_concentration_level := public.get_concentration_risk_level(v_hhi);

  WITH grouped AS (
    SELECT COALESCE(sector, 'Unknown') AS label,
           COUNT(*)::INTEGER AS holding_count,
           SUM(COALESCE(funds_allocated, 0)) AS allocation
    FROM public.holdings
    WHERE portfolio_id = p_portfolio_id AND deleted_at IS NULL
    GROUP BY COALESCE(sector, 'Unknown')
  ), enriched AS (
    SELECT *, COALESCE(ROUND(allocation / NULLIF(v_total_allocation, 0) * 100, 2), 0) AS percent
    FROM grouped
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'sector', label, 'count', holding_count, 'amount', allocation, 'percent', percent
    ) ORDER BY allocation DESC, label), '[]'::jsonb),
    COUNT(*)::INTEGER,
    COALESCE(MAX(percent), 0)
  INTO v_sector_distribution, v_sector_count, v_largest_sector_percent
  FROM enriched;

  v_sector_level := CASE
    WHEN v_largest_sector_percent > 85 THEN 'critical'
    WHEN v_largest_sector_percent > 70 THEN 'high'
    WHEN v_largest_sector_percent > 50 THEN 'medium'
    ELSE 'low'
  END;

  WITH grouped AS (
    SELECT COALESCE(country, 'Unknown') AS label,
           COUNT(*)::INTEGER AS holding_count,
           SUM(COALESCE(funds_allocated, 0)) AS allocation
    FROM public.holdings
    WHERE portfolio_id = p_portfolio_id AND deleted_at IS NULL
    GROUP BY COALESCE(country, 'Unknown')
  ), enriched AS (
    SELECT *, COALESCE(ROUND(allocation / NULLIF(v_total_allocation, 0) * 100, 2), 0) AS percent
    FROM grouped
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'geography', label, 'count', holding_count, 'amount', allocation, 'percent', percent
    ) ORDER BY allocation DESC, label), '[]'::jsonb),
    COUNT(*)::INTEGER,
    COALESCE(MAX(percent), 0)
  INTO v_geography_distribution, v_geography_count, v_largest_geography_percent
  FROM enriched;

  v_geography_level := CASE
    WHEN v_largest_geography_percent > 90 THEN 'critical'
    WHEN v_largest_geography_percent > 80 THEN 'high'
    WHEN v_largest_geography_percent > 60 THEN 'medium'
    ELSE 'low'
  END;

  WITH grouped AS (
    SELECT asset_type::TEXT AS label,
           COUNT(*)::INTEGER AS holding_count,
           SUM(COALESCE(funds_allocated, 0)) AS allocation
    FROM public.holdings
    WHERE portfolio_id = p_portfolio_id AND deleted_at IS NULL
    GROUP BY asset_type
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'asset_type', label,
      'count', holding_count,
      'amount', allocation,
      'percent', COALESCE(ROUND(allocation / NULLIF(v_total_allocation, 0) * 100, 2), 0)
    ) ORDER BY allocation DESC, label), '[]'::jsonb),
    COUNT(*)::INTEGER
  INTO v_asset_type_distribution, v_asset_type_count
  FROM grouped;

  v_overall_score := ROUND((
    CASE v_concentration_level WHEN 'critical' THEN 100 WHEN 'high' THEN 75 WHEN 'medium' THEN 50 ELSE 25 END +
    CASE v_sector_level WHEN 'critical' THEN 100 WHEN 'high' THEN 75 WHEN 'medium' THEN 50 ELSE 25 END +
    CASE v_geography_level WHEN 'critical' THEN 100 WHEN 'high' THEN 75 WHEN 'medium' THEN 50 ELSE 25 END
  )::NUMERIC / 3, 2);
  v_overall_level := CASE
    WHEN v_overall_score >= 87.5 THEN 'critical'
    WHEN v_overall_score >= 62.5 THEN 'high'
    WHEN v_overall_score >= 37.5 THEN 'medium'
    ELSE 'low'
  END;

  IF v_concentration_level IN ('high', 'critical') THEN
    v_risk_factors := v_risk_factors || jsonb_build_array('Portfolio value is concentrated in a small number of holdings');
    v_recommendations := v_recommendations || jsonb_build_array('Review concentration limits and diversification options');
  END IF;
  IF v_sector_level IN ('high', 'critical') THEN
    v_risk_factors := v_risk_factors || jsonb_build_array('Portfolio value is concentrated in one sector');
    v_recommendations := v_recommendations || jsonb_build_array('Consider diversifying exposure across sectors');
  END IF;
  IF v_geography_level IN ('high', 'critical') THEN
    v_risk_factors := v_risk_factors || jsonb_build_array('Portfolio value is concentrated in one geography');
    v_recommendations := v_recommendations || jsonb_build_array('Review geographic diversification');
  END IF;

  INSERT INTO public.portfolio_risk_snapshots (
    portfolio_id, snapshot_date, total_holdings, total_allocation,
    concentration_top3_percent, concentration_top3_holdings,
    concentration_risk_level, herfindahl_index,
    sector_distribution, sector_count, largest_sector_percent, sector_risk_level,
    geography_distribution, geography_count, largest_geography_percent, geography_risk_level,
    asset_type_distribution, asset_type_count,
    overall_risk_score, overall_risk_level, risk_factors, recommendations
  ) VALUES (
    p_portfolio_id, CURRENT_DATE, v_total_holdings, v_total_allocation,
    v_top3_percent, v_top3, v_concentration_level, v_hhi,
    v_sector_distribution, v_sector_count, v_largest_sector_percent, v_sector_level,
    v_geography_distribution, v_geography_count, v_largest_geography_percent, v_geography_level,
    v_asset_type_distribution, v_asset_type_count,
    v_overall_score, v_overall_level, v_risk_factors, v_recommendations
  )
  ON CONFLICT (portfolio_id, snapshot_date) DO UPDATE SET
    total_holdings = EXCLUDED.total_holdings,
    total_allocation = EXCLUDED.total_allocation,
    concentration_top3_percent = EXCLUDED.concentration_top3_percent,
    concentration_top3_holdings = EXCLUDED.concentration_top3_holdings,
    concentration_risk_level = EXCLUDED.concentration_risk_level,
    herfindahl_index = EXCLUDED.herfindahl_index,
    sector_distribution = EXCLUDED.sector_distribution,
    sector_count = EXCLUDED.sector_count,
    largest_sector_percent = EXCLUDED.largest_sector_percent,
    sector_risk_level = EXCLUDED.sector_risk_level,
    geography_distribution = EXCLUDED.geography_distribution,
    geography_count = EXCLUDED.geography_count,
    largest_geography_percent = EXCLUDED.largest_geography_percent,
    geography_risk_level = EXCLUDED.geography_risk_level,
    asset_type_distribution = EXCLUDED.asset_type_distribution,
    asset_type_count = EXCLUDED.asset_type_count,
    overall_risk_score = EXCLUDED.overall_risk_score,
    overall_risk_level = EXCLUDED.overall_risk_level,
    risk_factors = EXCLUDED.risk_factors,
    recommendations = EXCLUDED.recommendations
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_risk_snapshot(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.generate_risk_snapshot(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER trg_analytics_insights_updated_at
  BEFORE UPDATE ON public.analytics_insights
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.benchmark_data            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_projections_cache  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_risk_snapshots  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_insights        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_financial_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "benchmark_data_read" ON public.benchmark_data
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "benchmark_data_service" ON public.benchmark_data
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "projections_read" ON public.metric_projections_cache
  FOR SELECT TO authenticated USING (public.can_view_portfolio(portfolio_id));
CREATE POLICY "projections_write" ON public.metric_projections_cache
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));
CREATE POLICY "projections_service" ON public.metric_projections_cache
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "risk_snapshots_read" ON public.portfolio_risk_snapshots
  FOR SELECT TO authenticated USING (public.can_view_portfolio(portfolio_id));
CREATE POLICY "risk_snapshots_write" ON public.portfolio_risk_snapshots
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));
CREATE POLICY "risk_snapshots_service" ON public.portfolio_risk_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "insights_read" ON public.analytics_insights
  FOR SELECT TO authenticated USING (public.can_view_portfolio(portfolio_id));
CREATE POLICY "insights_write" ON public.analytics_insights
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));
CREATE POLICY "insights_service" ON public.analytics_insights
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "generated_financial_analyses_read" ON public.generated_financial_analyses
  FOR SELECT TO authenticated
  USING (
    holding_id IS NULL
    OR public.can_view_portfolio((SELECT portfolio_id FROM public.holdings WHERE id = holding_id))
  );
CREATE POLICY "generated_financial_analyses_write" ON public.generated_financial_analyses
  FOR ALL TO authenticated
  USING (
    holding_id IS NOT NULL
    AND public.can_edit_portfolio((SELECT portfolio_id FROM public.holdings WHERE id = holding_id))
  )
  WITH CHECK (
    holding_id IS NOT NULL
    AND public.can_edit_portfolio((SELECT portfolio_id FROM public.holdings WHERE id = holding_id))
  );
CREATE POLICY "generated_financial_analyses_service" ON public.generated_financial_analyses
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_financial_analyses TO authenticated;
GRANT ALL ON public.generated_financial_analyses TO service_role;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT ON public.benchmark_data TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metric_projections_cache TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_risk_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_insights TO authenticated;

GRANT ALL ON public.benchmark_data           TO service_role;
GRANT ALL ON public.metric_projections_cache TO service_role;
GRANT ALL ON public.portfolio_risk_snapshots TO service_role;
GRANT ALL ON public.analytics_insights       TO service_role;

GRANT SELECT ON public.v_latest_risk_snapshot TO authenticated;
GRANT SELECT ON public.v_active_insights      TO authenticated;
GRANT SELECT ON public.v_benchmark_lookup     TO authenticated;
