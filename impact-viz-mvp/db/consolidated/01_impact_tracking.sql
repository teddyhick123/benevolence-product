-- ============================================================================
-- IMPACT TRACKING MODULE
-- ============================================================================
-- Description: KPIs, metrics, trends, and visualizations
-- Tables: metrics, metric_facts, staging_metric_facts, portfolio_metric_targets,
--         holding_valuations, holding_transactions, holding_contributions,
--         holding_locations
-- Views: v_portfolio_kpi_latest, v_portfolio_kpi_series, v_holdings
-- ============================================================================

-- ============================================================================
-- 1. METRICS TABLE (Metric Definitions)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.metrics (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  unit TEXT,
  directionality TEXT CHECK (directionality IN ('higher_is_better', 'lower_is_better')),
  aggregation_function TEXT,  -- sum, avg, max, min
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.metrics IS 'Metric definitions (e.g., "Jobs Created", "CO2 Reduced")';
COMMENT ON COLUMN public.metrics.directionality IS 'Whether higher or lower values are better for this metric';

-- ============================================================================
-- 2. METRIC FACTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.metric_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  investee_id UUID,  -- Legacy, optional
  holding_id UUID REFERENCES public.holdings(id) ON DELETE CASCADE,
  metric_code TEXT REFERENCES public.metrics(code),
  period_start DATE,
  period_end DATE,
  value NUMERIC,
  unit TEXT,
  source TEXT,
  verification_level TEXT,
  data_quality_score NUMERIC,
  submitted_by_org_id UUID REFERENCES public.organizations(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_metric_facts_holding ON public.metric_facts(holding_id);
CREATE INDEX IF NOT EXISTS idx_metric_facts_metric ON public.metric_facts(metric_code);
CREATE INDEX IF NOT EXISTS idx_metric_facts_period ON public.metric_facts(period_end DESC);
CREATE INDEX IF NOT EXISTS idx_metric_facts_org_id ON public.metric_facts(submitted_by_org_id);

COMMENT ON TABLE public.metric_facts IS 'Actual metric values with timestamps';
COMMENT ON COLUMN public.metric_facts.submitted_by_org_id IS 'Organization that submitted this metric (for tracking data provenance)';

-- ============================================================================
-- 3. STAGING METRIC FACTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.staging_metric_facts (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  upload_id UUID REFERENCES public.uploads(id) ON DELETE CASCADE,
  as_of_date DATE,
  portfolio_code TEXT,
  holding_id TEXT,
  holding_name TEXT,
  sector TEXT,
  country TEXT,
  metric_name TEXT,
  metric_value NUMERIC,
  currency TEXT,
  raw JSONB,
  submitted_by_org_id UUID REFERENCES public.organizations(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staging_metric_facts_upload ON public.staging_metric_facts(upload_id);
CREATE INDEX IF NOT EXISTS idx_staging_metric_facts_org_id ON public.staging_metric_facts(submitted_by_org_id);

COMMENT ON TABLE public.staging_metric_facts IS 'Pending metrics awaiting approval/processing';

-- ============================================================================
-- 4. PORTFOLIO METRIC TARGETS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.portfolio_metric_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  metric_code TEXT NOT NULL REFERENCES public.metrics(code),
  target_value NUMERIC NOT NULL,
  target_date DATE,
  baseline_value NUMERIC,
  baseline_date DATE,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(portfolio_id, metric_code)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_metric_targets_portfolio ON public.portfolio_metric_targets(portfolio_id);

COMMENT ON TABLE public.portfolio_metric_targets IS 'Target values for metrics at portfolio level';

-- ============================================================================
-- 5. HOLDING VALUATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.holding_valuations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id UUID NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  value NUMERIC NOT NULL,
  currency TEXT DEFAULT 'USD',
  valuation_method TEXT,  -- cost, market, nav, third_party
  source TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holding_valuations_holding ON public.holding_valuations(holding_id);
CREATE INDEX IF NOT EXISTS idx_holding_valuations_date ON public.holding_valuations(as_of_date DESC);

COMMENT ON TABLE public.holding_valuations IS 'Financial valuations over time';

-- ============================================================================
-- 6. HOLDING TRANSACTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.holding_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id UUID NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'contribution', 'disbursement', 'grant_payment', 'investment',
    'distribution', 'fee', 'dividend', 'capital_call', 'other'
  )),
  amount NUMERIC NOT NULL,
  currency TEXT DEFAULT 'USD',
  description TEXT,
  reference TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holding_transactions_holding ON public.holding_transactions(holding_id);
CREATE INDEX IF NOT EXISTS idx_holding_transactions_date ON public.holding_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_holding_transactions_type ON public.holding_transactions(transaction_type);

COMMENT ON TABLE public.holding_transactions IS 'Cash flows (grants, investments, distributions)';

-- ============================================================================
-- 7. HOLDING CONTRIBUTIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.holding_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  holding_id UUID NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  contributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  memo TEXT,
  source TEXT,
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holding_contributions_portfolio ON public.holding_contributions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_holding_contributions_holding ON public.holding_contributions(holding_id);
CREATE INDEX IF NOT EXISTS idx_holding_contributions_date ON public.holding_contributions(contributed_at DESC);

COMMENT ON TABLE public.holding_contributions IS 'Funding contributions to holdings';

-- ============================================================================
-- 8. HOLDING LOCATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.holding_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  holding_id UUID REFERENCES public.holdings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  tags TEXT[] DEFAULT '{}',
  status TEXT,
  as_of DATE,
  amount_usd NUMERIC,
  lon DOUBLE PRECISION NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holding_locations_portfolio ON public.holding_locations(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_holding_locations_holding ON public.holding_locations(holding_id);

COMMENT ON TABLE public.holding_locations IS 'Geolocation data for map views';

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Latest KPI values per portfolio (sum across holdings)
CREATE OR REPLACE VIEW public.v_portfolio_kpi_latest AS
WITH latest_facts AS (
  SELECT DISTINCT ON (mf.holding_id, mf.metric_code)
    h.portfolio_id,
    mf.holding_id,
    mf.metric_code,
    mf.value,
    mf.period_end,
    m.name as metric_name,
    m.unit,
    m.directionality
  FROM public.metric_facts mf
  JOIN public.holdings h ON h.id = mf.holding_id
  JOIN public.metrics m ON m.code = mf.metric_code
  ORDER BY mf.holding_id, mf.metric_code, mf.period_end DESC
)
SELECT
  portfolio_id,
  metric_code,
  metric_name,
  unit,
  directionality,
  SUM(value) as total_value,
  COUNT(DISTINCT holding_id) as holding_count,
  MAX(period_end) as latest_date
FROM latest_facts
GROUP BY portfolio_id, metric_code, metric_name, unit, directionality;

COMMENT ON VIEW public.v_portfolio_kpi_latest IS 'Latest KPI values per portfolio, summed across holdings';

-- Holdings view with related data
CREATE OR REPLACE VIEW public.v_holdings AS
SELECT
  h.id,
  h.portfolio_id,
  h.name,
  h.status,
  h.asset_type,
  h.asset_subtype,
  h.sector,
  h.country,
  h.funds_allocated,
  h.as_of,
  h.description,
  h.website,
  h.primary_contact_name,
  h.primary_contact_email,
  h.created_at,
  h.updated_at,
  -- Latest valuation
  (SELECT value FROM public.holding_valuations hv
   WHERE hv.holding_id = h.id
   ORDER BY as_of_date DESC LIMIT 1) as latest_valuation,
  -- Total contributions
  (SELECT COALESCE(SUM(amount), 0) FROM public.holding_contributions hc
   WHERE hc.holding_id = h.id) as total_contributions
FROM public.holdings h;

COMMENT ON VIEW public.v_holdings IS 'Holdings with latest valuation and contribution totals';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get portfolio's latest KPIs summed
CREATE OR REPLACE FUNCTION public.get_portfolio_latest_kpis_sum(p_portfolio_id UUID)
RETURNS TABLE(
  metric_code TEXT,
  metric_name TEXT,
  unit TEXT,
  total_value NUMERIC,
  holding_count BIGINT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    metric_code,
    metric_name,
    unit,
    total_value,
    holding_count
  FROM public.v_portfolio_kpi_latest
  WHERE portfolio_id = p_portfolio_id
  ORDER BY metric_name;
$$;

-- Get top KPIs per holding (for map display)
CREATE OR REPLACE FUNCTION public.get_top_kpis_per_holding(
  p_portfolio_id UUID,
  p_limit INTEGER DEFAULT 3
)
RETURNS TABLE(
  holding_id UUID,
  holding_name TEXT,
  metric_code TEXT,
  metric_name TEXT,
  value NUMERIC,
  unit TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT
      h.id as holding_id,
      h.name as holding_name,
      mf.metric_code,
      m.name as metric_name,
      mf.value,
      m.unit,
      ROW_NUMBER() OVER (PARTITION BY h.id ORDER BY mf.period_end DESC, m.name) as rn
    FROM public.holdings h
    JOIN public.metric_facts mf ON mf.holding_id = h.id
    JOIN public.metrics m ON m.code = mf.metric_code
    WHERE h.portfolio_id = p_portfolio_id
  )
  SELECT holding_id, holding_name, metric_code, metric_name, value, unit
  FROM ranked
  WHERE rn <= p_limit;
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION public.get_portfolio_latest_kpis_sum(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_top_kpis_per_holding(UUID, INTEGER) TO authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metric_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staging_metric_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_metric_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holding_valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holding_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holding_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holding_locations ENABLE ROW LEVEL SECURITY;

-- ==================== METRICS ====================
DROP POLICY IF EXISTS "metrics_read" ON public.metrics;
CREATE POLICY "metrics_read" ON public.metrics
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "metrics_service" ON public.metrics;
CREATE POLICY "metrics_service" ON public.metrics
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================== METRIC FACTS ====================
DROP POLICY IF EXISTS "metric_facts_read" ON public.metric_facts;
CREATE POLICY "metric_facts_read" ON public.metric_facts
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.holdings h
      JOIN public.portfolio_members pm ON pm.portfolio_id = h.portfolio_id
      WHERE h.id = metric_facts.holding_id AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "metric_facts_write" ON public.metric_facts;
CREATE POLICY "metric_facts_write" ON public.metric_facts
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.holdings h
      WHERE h.id = metric_facts.holding_id
        AND public.can_edit_portfolio(h.portfolio_id)
    )
  );

DROP POLICY IF EXISTS "metric_facts_service" ON public.metric_facts;
CREATE POLICY "metric_facts_service" ON public.metric_facts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================== STAGING METRIC FACTS ====================
DROP POLICY IF EXISTS "staging_read" ON public.staging_metric_facts;
CREATE POLICY "staging_read" ON public.staging_metric_facts
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "staging_service" ON public.staging_metric_facts;
CREATE POLICY "staging_service" ON public.staging_metric_facts
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================== PORTFOLIO METRIC TARGETS ====================
DROP POLICY IF EXISTS "targets_read" ON public.portfolio_metric_targets;
CREATE POLICY "targets_read" ON public.portfolio_metric_targets
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

DROP POLICY IF EXISTS "targets_write" ON public.portfolio_metric_targets;
CREATE POLICY "targets_write" ON public.portfolio_metric_targets
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "targets_service" ON public.portfolio_metric_targets;
CREATE POLICY "targets_service" ON public.portfolio_metric_targets
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================== HOLDING VALUATIONS ====================
DROP POLICY IF EXISTS "valuations_read" ON public.holding_valuations;
CREATE POLICY "valuations_read" ON public.holding_valuations
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.holdings h
      JOIN public.portfolio_members pm ON pm.portfolio_id = h.portfolio_id
      WHERE h.id = holding_valuations.holding_id AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "valuations_write" ON public.holding_valuations;
CREATE POLICY "valuations_write" ON public.holding_valuations
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.holdings h
      WHERE h.id = holding_valuations.holding_id
        AND public.can_edit_portfolio(h.portfolio_id)
    )
  );

DROP POLICY IF EXISTS "valuations_service" ON public.holding_valuations;
CREATE POLICY "valuations_service" ON public.holding_valuations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================== HOLDING TRANSACTIONS ====================
DROP POLICY IF EXISTS "transactions_read" ON public.holding_transactions;
CREATE POLICY "transactions_read" ON public.holding_transactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.holdings h
      JOIN public.portfolio_members pm ON pm.portfolio_id = h.portfolio_id
      WHERE h.id = holding_transactions.holding_id AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "transactions_write" ON public.holding_transactions;
CREATE POLICY "transactions_write" ON public.holding_transactions
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.holdings h
      WHERE h.id = holding_transactions.holding_id
        AND public.can_edit_portfolio(h.portfolio_id)
    )
  );

DROP POLICY IF EXISTS "transactions_service" ON public.holding_transactions;
CREATE POLICY "transactions_service" ON public.holding_transactions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================== HOLDING CONTRIBUTIONS ====================
DROP POLICY IF EXISTS "contributions_read" ON public.holding_contributions;
CREATE POLICY "contributions_read" ON public.holding_contributions
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

DROP POLICY IF EXISTS "contributions_write" ON public.holding_contributions;
CREATE POLICY "contributions_write" ON public.holding_contributions
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "contributions_service" ON public.holding_contributions;
CREATE POLICY "contributions_service" ON public.holding_contributions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================== HOLDING LOCATIONS ====================
DROP POLICY IF EXISTS "locations_read" ON public.holding_locations;
CREATE POLICY "locations_read" ON public.holding_locations
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

DROP POLICY IF EXISTS "locations_write" ON public.holding_locations;
CREATE POLICY "locations_write" ON public.holding_locations
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "locations_service" ON public.holding_locations;
CREATE POLICY "locations_service" ON public.holding_locations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT ON public.metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.metric_facts TO authenticated;
GRANT SELECT ON public.staging_metric_facts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_metric_targets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holding_valuations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holding_transactions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holding_contributions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holding_locations TO authenticated;

GRANT ALL ON public.metrics TO service_role;
GRANT ALL ON public.metric_facts TO service_role;
GRANT ALL ON public.staging_metric_facts TO service_role;
GRANT ALL ON public.portfolio_metric_targets TO service_role;
GRANT ALL ON public.holding_valuations TO service_role;
GRANT ALL ON public.holding_transactions TO service_role;
GRANT ALL ON public.holding_contributions TO service_role;
GRANT ALL ON public.holding_locations TO service_role;

-- Grant on views
GRANT SELECT ON public.v_portfolio_kpi_latest TO authenticated;
GRANT SELECT ON public.v_holdings TO authenticated;
