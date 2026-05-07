-- =============================================================================
-- 0035_analytics_module.sql
-- Analytics module: benchmarks, metric projections, portfolio risk snapshots,
-- and AI-generated insights.
-- Depends on: 0004, 0006, 0008
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
-- Views
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_latest_risk_snapshot AS
SELECT DISTINCT ON (portfolio_id) *
FROM public.portfolio_risk_snapshots
ORDER BY portfolio_id, snapshot_date DESC;

CREATE OR REPLACE VIEW public.v_active_insights AS
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

CREATE OR REPLACE VIEW public.v_benchmark_lookup AS
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
  FROM public.holdings WHERE portfolio_id = p_portfolio_id;
  IF v_total = 0 THEN RETURN 0; END IF;
  FOR r IN SELECT funds_allocated FROM public.holdings
           WHERE portfolio_id = p_portfolio_id AND funds_allocated > 0
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
