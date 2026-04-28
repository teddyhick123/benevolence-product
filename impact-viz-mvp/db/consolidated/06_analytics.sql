-- ============================================================================
-- ANALYTICS MODULE
-- ============================================================================
-- Description: Projections, benchmarking, and risk analysis
-- Tables: benchmark_data, metric_projections_cache, portfolio_risk_snapshots,
--         analytics_insights
-- Views: v_latest_risk_snapshot, v_active_insights, v_benchmark_lookup
-- ============================================================================

-- ============================================================================
-- 1. BENCHMARK DATA TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.benchmark_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  benchmark_type TEXT NOT NULL CHECK (benchmark_type IN ('sector', 'size_band', 'geography', 'asset_class', 'custom')),
  benchmark_name TEXT NOT NULL,
  benchmark_key TEXT NOT NULL,
  metric_code TEXT NOT NULL,
  metric_value NUMERIC NOT NULL,
  unit TEXT,
  percentile_25 NUMERIC,
  percentile_50 NUMERIC,
  percentile_75 NUMERIC,
  sample_size INTEGER,
  std_deviation NUMERIC,
  period_start DATE,
  period_end DATE,
  data_year INTEGER NOT NULL,
  data_source TEXT,
  confidence_level TEXT CHECK (confidence_level IN ('high', 'medium', 'low')),
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (benchmark_type, benchmark_key, metric_code, data_year)
);

CREATE INDEX IF NOT EXISTS idx_benchmark_data_type_key ON public.benchmark_data(benchmark_type, benchmark_key);
CREATE INDEX IF NOT EXISTS idx_benchmark_data_metric ON public.benchmark_data(metric_code);
CREATE INDEX IF NOT EXISTS idx_benchmark_data_year ON public.benchmark_data(data_year DESC);

COMMENT ON TABLE public.benchmark_data IS 'Industry and sector benchmark data for peer comparisons';

-- ============================================================================
-- 2. METRIC PROJECTIONS CACHE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.metric_projections_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  holding_id UUID REFERENCES public.holdings(id) ON DELETE CASCADE,
  metric_code TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('linear', 'exponential', 'moving_average', 'monte_carlo')),
  periods_ahead INTEGER NOT NULL,
  historical_data_points INTEGER NOT NULL,
  trend_direction TEXT CHECK (trend_direction IN ('increasing', 'decreasing', 'stable', 'volatile')),
  slope_per_period NUMERIC,
  r_squared NUMERIC,
  projections JSONB NOT NULL DEFAULT '[]'::jsonb,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_stale BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_projections_cache_portfolio ON public.metric_projections_cache(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_projections_cache_holding ON public.metric_projections_cache(holding_id) WHERE holding_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projections_cache_metric ON public.metric_projections_cache(metric_code);
CREATE INDEX IF NOT EXISTS idx_projections_cache_expires ON public.metric_projections_cache(expires_at) WHERE NOT is_stale;

COMMENT ON TABLE public.metric_projections_cache IS 'Cached metric projections for quick retrieval';

-- ============================================================================
-- 3. PORTFOLIO RISK SNAPSHOTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.portfolio_risk_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  total_holdings INTEGER NOT NULL,
  total_allocation NUMERIC NOT NULL,
  concentration_top3_percent NUMERIC,
  concentration_top3_holdings JSONB DEFAULT '[]'::jsonb,
  concentration_risk_level TEXT CHECK (concentration_risk_level IN ('low', 'medium', 'high', 'critical')),
  herfindahl_index NUMERIC,
  sector_distribution JSONB DEFAULT '{}'::jsonb,
  sector_count INTEGER,
  largest_sector_percent NUMERIC,
  sector_risk_level TEXT CHECK (sector_risk_level IN ('low', 'medium', 'high', 'critical')),
  geography_distribution JSONB DEFAULT '{}'::jsonb,
  geography_count INTEGER,
  largest_geography_percent NUMERIC,
  geography_risk_level TEXT CHECK (geography_risk_level IN ('low', 'medium', 'high', 'critical')),
  asset_type_distribution JSONB DEFAULT '{}'::jsonb,
  asset_type_count INTEGER,
  overall_risk_score NUMERIC,
  overall_risk_level TEXT CHECK (overall_risk_level IN ('low', 'medium', 'high', 'critical')),
  risk_factors JSONB DEFAULT '[]'::jsonb,
  recommendations JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (portfolio_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_risk_snapshots_portfolio ON public.portfolio_risk_snapshots(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_risk_snapshots_date ON public.portfolio_risk_snapshots(snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_risk_snapshots_risk_level ON public.portfolio_risk_snapshots(overall_risk_level);

COMMENT ON TABLE public.portfolio_risk_snapshots IS 'Historical snapshots of portfolio risk analysis';
COMMENT ON COLUMN public.portfolio_risk_snapshots.herfindahl_index IS 'HHI (0-10000), higher = more concentrated';

-- ============================================================================
-- 4. ANALYTICS INSIGHTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.analytics_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  holding_id UUID REFERENCES public.holdings(id) ON DELETE SET NULL,
  insight_type TEXT NOT NULL CHECK (insight_type IN (
    'trend_alert', 'anomaly', 'opportunity', 'risk_warning',
    'performance_highlight', 'benchmark_comparison', 'recommendation'
  )),
  category TEXT NOT NULL CHECK (category IN (
    'performance', 'risk', 'diversification', 'efficiency',
    'impact', 'financial', 'operational'
  )),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')),
  metric_code TEXT,
  metric_value NUMERIC,
  comparison_value NUMERIC,
  change_percent NUMERIC,
  data_context JSONB DEFAULT '{}'::jsonb,
  suggested_actions JSONB DEFAULT '[]'::jsonb,
  action_taken BOOLEAN DEFAULT false,
  action_taken_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true,
  dismissed_at TIMESTAMPTZ,
  dismissed_by UUID REFERENCES auth.users(id),
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_insights_portfolio ON public.analytics_insights(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_analytics_insights_holding ON public.analytics_insights(holding_id) WHERE holding_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_analytics_insights_type ON public.analytics_insights(insight_type);
CREATE INDEX IF NOT EXISTS idx_analytics_insights_active ON public.analytics_insights(portfolio_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_analytics_insights_severity ON public.analytics_insights(severity) WHERE is_active = true;

COMMENT ON TABLE public.analytics_insights IS 'AI-generated insights and recommendations';

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Latest risk snapshot per portfolio
CREATE OR REPLACE VIEW public.v_latest_risk_snapshot AS
SELECT DISTINCT ON (portfolio_id) *
FROM public.portfolio_risk_snapshots
ORDER BY portfolio_id, snapshot_date DESC;

COMMENT ON VIEW public.v_latest_risk_snapshot IS 'Latest risk snapshot per portfolio';

-- Active insights
CREATE OR REPLACE VIEW public.v_active_insights AS
SELECT
  ai.*,
  h.name as holding_name,
  h.sector as holding_sector
FROM public.analytics_insights ai
LEFT JOIN public.holdings h ON ai.holding_id = h.id
WHERE ai.is_active = true
  AND (ai.expires_at IS NULL OR ai.expires_at > NOW())
ORDER BY
  CASE ai.severity
    WHEN 'critical' THEN 1
    WHEN 'high' THEN 2
    WHEN 'medium' THEN 3
    WHEN 'low' THEN 4
    ELSE 5
  END,
  ai.created_at DESC;

COMMENT ON VIEW public.v_active_insights IS 'Active insights sorted by severity';

-- Benchmark lookup
CREATE OR REPLACE VIEW public.v_benchmark_lookup AS
SELECT
  benchmark_type,
  benchmark_key,
  metric_code,
  data_year,
  metric_value,
  percentile_25,
  percentile_50,
  percentile_75,
  sample_size,
  data_source,
  confidence_level
FROM public.benchmark_data
WHERE data_year = EXTRACT(YEAR FROM CURRENT_DATE)
   OR data_year = EXTRACT(YEAR FROM CURRENT_DATE) - 1
ORDER BY benchmark_type, benchmark_key, metric_code, data_year DESC;

COMMENT ON VIEW public.v_benchmark_lookup IS 'Current and prior year benchmarks';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Calculate Herfindahl-Hirschman Index
CREATE OR REPLACE FUNCTION public.calculate_hhi(p_portfolio_id UUID)
RETURNS NUMERIC AS $$
DECLARE
  v_total NUMERIC;
  v_hhi NUMERIC := 0;
  v_share NUMERIC;
  r RECORD;
BEGIN
  SELECT COALESCE(SUM(funds_allocated), 0) INTO v_total
  FROM public.holdings WHERE portfolio_id = p_portfolio_id;

  IF v_total = 0 THEN RETURN 0; END IF;

  FOR r IN SELECT funds_allocated FROM public.holdings
           WHERE portfolio_id = p_portfolio_id AND funds_allocated > 0
  LOOP
    v_share := (r.funds_allocated / v_total) * 100;
    v_hhi := v_hhi + (v_share * v_share);
  END LOOP;

  RETURN ROUND(v_hhi, 2);
END;
$$ LANGUAGE plpgsql STABLE;

-- Get risk level from HHI
CREATE OR REPLACE FUNCTION public.get_concentration_risk_level(p_hhi NUMERIC)
RETURNS TEXT AS $$
BEGIN
  IF p_hhi >= 2500 THEN RETURN 'critical';
  ELSIF p_hhi >= 1500 THEN RETURN 'high';
  ELSIF p_hhi >= 1000 THEN RETURN 'medium';
  ELSE RETURN 'low';
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Calculate donor age (for analytics)
CREATE OR REPLACE FUNCTION public.calculate_donor_age(p_birth_date DATE)
RETURNS INTEGER AS $$
BEGIN
  IF p_birth_date IS NULL THEN RETURN NULL; END IF;
  RETURN EXTRACT(YEAR FROM AGE(p_birth_date))::INTEGER;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Generate risk snapshot
CREATE OR REPLACE FUNCTION public.generate_risk_snapshot(p_portfolio_id UUID)
RETURNS UUID AS $$
DECLARE
  v_snapshot_id UUID;
  v_total_holdings INTEGER;
  v_total_allocation NUMERIC;
  v_hhi NUMERIC;
  v_top3 JSONB;
  v_top3_percent NUMERIC;
  v_sector_dist JSONB;
  v_geo_dist JSONB;
  v_asset_dist JSONB;
  v_largest_sector_pct NUMERIC;
  v_largest_geo_pct NUMERIC;
  v_overall_score NUMERIC := 0;
  v_risk_factors JSONB := '[]'::jsonb;
BEGIN
  SELECT COUNT(*), COALESCE(SUM(funds_allocated), 0)
  INTO v_total_holdings, v_total_allocation
  FROM public.holdings WHERE portfolio_id = p_portfolio_id;

  IF v_total_holdings = 0 THEN RETURN NULL; END IF;

  v_hhi := public.calculate_hhi(p_portfolio_id);

  -- Top 3 holdings
  SELECT jsonb_agg(jsonb_build_object(
    'name', name,
    'allocation', funds_allocated,
    'percent', ROUND((funds_allocated / NULLIF(v_total_allocation, 0)) * 100, 2)
  ))
  INTO v_top3
  FROM (SELECT name, funds_allocated FROM public.holdings
        WHERE portfolio_id = p_portfolio_id ORDER BY funds_allocated DESC NULLS LAST LIMIT 3) t;

  SELECT COALESCE(SUM(funds_allocated), 0) / NULLIF(v_total_allocation, 0) * 100
  INTO v_top3_percent
  FROM (SELECT funds_allocated FROM public.holdings
        WHERE portfolio_id = p_portfolio_id ORDER BY funds_allocated DESC NULLS LAST LIMIT 3) t;

  -- Sector distribution
  SELECT jsonb_object_agg(
    COALESCE(sector, 'Unknown'),
    jsonb_build_object('amount', total, 'percent', ROUND((total / NULLIF(v_total_allocation, 0)) * 100, 2), 'count', cnt)
  )
  INTO v_sector_dist
  FROM (SELECT sector, SUM(funds_allocated) as total, COUNT(*) as cnt
        FROM public.holdings WHERE portfolio_id = p_portfolio_id GROUP BY sector) t;

  SELECT MAX(COALESCE((v::jsonb->>'percent')::numeric, 0)) INTO v_largest_sector_pct
  FROM jsonb_each(v_sector_dist) AS x(k, v);

  -- Geography distribution
  SELECT jsonb_object_agg(
    COALESCE(country, 'Unknown'),
    jsonb_build_object('amount', total, 'percent', ROUND((total / NULLIF(v_total_allocation, 0)) * 100, 2), 'count', cnt)
  )
  INTO v_geo_dist
  FROM (SELECT country, SUM(funds_allocated) as total, COUNT(*) as cnt
        FROM public.holdings WHERE portfolio_id = p_portfolio_id GROUP BY country) t;

  SELECT MAX(COALESCE((v::jsonb->>'percent')::numeric, 0)) INTO v_largest_geo_pct
  FROM jsonb_each(v_geo_dist) AS x(k, v);

  -- Asset type distribution
  SELECT jsonb_object_agg(
    COALESCE(asset_type::text, 'Unknown'),
    jsonb_build_object('amount', total, 'percent', ROUND((total / NULLIF(v_total_allocation, 0)) * 100, 2), 'count', cnt)
  )
  INTO v_asset_dist
  FROM (SELECT asset_type, SUM(funds_allocated) as total, COUNT(*) as cnt
        FROM public.holdings WHERE portfolio_id = p_portfolio_id GROUP BY asset_type) t;

  -- Calculate risk score
  IF v_hhi >= 2500 THEN v_overall_score := v_overall_score + 40; v_risk_factors := v_risk_factors || '"High concentration in few holdings"';
  ELSIF v_hhi >= 1500 THEN v_overall_score := v_overall_score + 25; v_risk_factors := v_risk_factors || '"Moderate concentration risk"';
  ELSIF v_hhi >= 1000 THEN v_overall_score := v_overall_score + 15; END IF;

  IF v_largest_sector_pct >= 70 THEN v_overall_score := v_overall_score + 30; v_risk_factors := v_risk_factors || '"Heavy sector concentration"';
  ELSIF v_largest_sector_pct >= 50 THEN v_overall_score := v_overall_score + 20; v_risk_factors := v_risk_factors || '"Sector concentration above 50%"';
  ELSIF v_largest_sector_pct >= 35 THEN v_overall_score := v_overall_score + 10; END IF;

  IF v_largest_geo_pct >= 80 THEN v_overall_score := v_overall_score + 30; v_risk_factors := v_risk_factors || '"High geographic concentration"';
  ELSIF v_largest_geo_pct >= 60 THEN v_overall_score := v_overall_score + 15; END IF;

  -- Insert/update snapshot
  INSERT INTO public.portfolio_risk_snapshots (
    portfolio_id, snapshot_date, total_holdings, total_allocation,
    concentration_top3_percent, concentration_top3_holdings, concentration_risk_level, herfindahl_index,
    sector_distribution, sector_count, largest_sector_percent, sector_risk_level,
    geography_distribution, geography_count, largest_geography_percent, geography_risk_level,
    asset_type_distribution, asset_type_count,
    overall_risk_score, overall_risk_level, risk_factors
  ) VALUES (
    p_portfolio_id, CURRENT_DATE, v_total_holdings, v_total_allocation,
    v_top3_percent, COALESCE(v_top3, '[]'::jsonb), public.get_concentration_risk_level(v_hhi), v_hhi,
    COALESCE(v_sector_dist, '{}'::jsonb), (SELECT COUNT(DISTINCT sector) FROM public.holdings WHERE portfolio_id = p_portfolio_id),
    v_largest_sector_pct, CASE WHEN v_largest_sector_pct >= 70 THEN 'high' WHEN v_largest_sector_pct >= 50 THEN 'medium' ELSE 'low' END,
    COALESCE(v_geo_dist, '{}'::jsonb), (SELECT COUNT(DISTINCT country) FROM public.holdings WHERE portfolio_id = p_portfolio_id),
    v_largest_geo_pct, CASE WHEN v_largest_geo_pct >= 80 THEN 'high' WHEN v_largest_geo_pct >= 60 THEN 'medium' ELSE 'low' END,
    COALESCE(v_asset_dist, '{}'::jsonb), (SELECT COUNT(DISTINCT asset_type) FROM public.holdings WHERE portfolio_id = p_portfolio_id),
    v_overall_score, CASE WHEN v_overall_score >= 70 THEN 'critical' WHEN v_overall_score >= 50 THEN 'high' WHEN v_overall_score >= 30 THEN 'medium' ELSE 'low' END,
    v_risk_factors
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
    risk_factors = EXCLUDED.risk_factors
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$ LANGUAGE plpgsql;

-- Grant execute
GRANT EXECUTE ON FUNCTION public.calculate_hhi(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_concentration_risk_level(NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_donor_age(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_risk_snapshot(UUID) TO authenticated;

-- Updated_at trigger
DROP TRIGGER IF EXISTS trg_analytics_insights_updated_at ON public.analytics_insights;
CREATE TRIGGER trg_analytics_insights_updated_at
  BEFORE UPDATE ON public.analytics_insights
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.benchmark_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_projections_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_risk_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_insights ENABLE ROW LEVEL SECURITY;

-- Benchmark data is public read
DROP POLICY IF EXISTS "benchmark_data_read" ON public.benchmark_data;
CREATE POLICY "benchmark_data_read" ON public.benchmark_data
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "benchmark_data_service" ON public.benchmark_data;
CREATE POLICY "benchmark_data_service" ON public.benchmark_data
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Projections cache
DROP POLICY IF EXISTS "projections_read" ON public.metric_projections_cache;
CREATE POLICY "projections_read" ON public.metric_projections_cache
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

DROP POLICY IF EXISTS "projections_write" ON public.metric_projections_cache;
CREATE POLICY "projections_write" ON public.metric_projections_cache
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "projections_service" ON public.metric_projections_cache;
CREATE POLICY "projections_service" ON public.metric_projections_cache
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Risk snapshots
DROP POLICY IF EXISTS "risk_snapshots_read" ON public.portfolio_risk_snapshots;
CREATE POLICY "risk_snapshots_read" ON public.portfolio_risk_snapshots
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

DROP POLICY IF EXISTS "risk_snapshots_write" ON public.portfolio_risk_snapshots;
CREATE POLICY "risk_snapshots_write" ON public.portfolio_risk_snapshots
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "risk_snapshots_service" ON public.portfolio_risk_snapshots;
CREATE POLICY "risk_snapshots_service" ON public.portfolio_risk_snapshots
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Analytics insights
DROP POLICY IF EXISTS "insights_read" ON public.analytics_insights;
CREATE POLICY "insights_read" ON public.analytics_insights
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

DROP POLICY IF EXISTS "insights_write" ON public.analytics_insights;
CREATE POLICY "insights_write" ON public.analytics_insights
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "insights_service" ON public.analytics_insights;
CREATE POLICY "insights_service" ON public.analytics_insights
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT ON public.benchmark_data TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metric_projections_cache TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_risk_snapshots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.analytics_insights TO authenticated;

GRANT ALL ON public.benchmark_data TO service_role;
GRANT ALL ON public.metric_projections_cache TO service_role;
GRANT ALL ON public.portfolio_risk_snapshots TO service_role;
GRANT ALL ON public.analytics_insights TO service_role;

-- Views
GRANT SELECT ON public.v_latest_risk_snapshot TO authenticated;
GRANT SELECT ON public.v_active_insights TO authenticated;
GRANT SELECT ON public.v_benchmark_lookup TO authenticated;
