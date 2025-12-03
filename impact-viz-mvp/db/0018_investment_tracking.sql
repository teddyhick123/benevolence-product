-- Migration 0018: Investment Tracking - Valuations and Transactions
-- Purpose: Add financial performance tracking for investments (equity, debt, PRIs, MRIs)
-- Author: Claude Code
-- Date: 2024-11-24

-- ============================================================================
-- PART 1: HOLDING VALUATIONS
-- Track Net Asset Value (NAV) over time for investment holdings
-- ============================================================================

CREATE TABLE public.holding_valuations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  holding_id UUID NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  as_of_date DATE NOT NULL,
  nav NUMERIC NOT NULL CHECK (nav >= 0),
  units NUMERIC CHECK (units > 0),
  nav_per_unit NUMERIC GENERATED ALWAYS AS (
    CASE WHEN units > 0 THEN nav / units ELSE NULL END
  ) STORED,
  valuation_source TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure only one valuation per holding per date
  UNIQUE(holding_id, as_of_date)
);

-- Indexes for efficient queries
CREATE INDEX idx_valuations_holding ON public.holding_valuations(holding_id);
CREATE INDEX idx_valuations_date ON public.holding_valuations(as_of_date DESC);
CREATE INDEX idx_valuations_holding_date ON public.holding_valuations(holding_id, as_of_date DESC);

-- Comments
COMMENT ON TABLE public.holding_valuations IS
  'Historical Net Asset Value (NAV) tracking for investment holdings';

COMMENT ON COLUMN public.holding_valuations.nav IS
  'Net Asset Value in base currency at the as_of_date';

COMMENT ON COLUMN public.holding_valuations.units IS
  'Number of units/shares held (optional, for per-unit NAV calculation)';

COMMENT ON COLUMN public.holding_valuations.nav_per_unit IS
  'Calculated NAV per unit if units are specified';

COMMENT ON COLUMN public.holding_valuations.valuation_source IS
  'Source of valuation: "Fund Statement", "Mark to Market", "Manager Report", etc.';

-- ============================================================================
-- PART 2: HOLDING TRANSACTIONS
-- Track capital movements: calls, distributions, contributions
-- ============================================================================

-- Transaction type enumeration
CREATE TYPE transaction_type_enum AS ENUM (
  'initial_investment',  -- Initial capital deployment
  'capital_call',        -- Subsequent capital called by fund manager
  'distribution',        -- Cash distribution received
  'return_of_capital',   -- Non-taxable return of capital
  'reinvestment'         -- Distribution reinvested
);

CREATE TABLE public.holding_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  holding_id UUID NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  transaction_date DATE NOT NULL,
  transaction_type transaction_type_enum NOT NULL,
  amount NUMERIC NOT NULL,
  memo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate transactions
  UNIQUE(holding_id, transaction_date, transaction_type, amount)
);

-- Indexes
CREATE INDEX idx_transactions_holding ON public.holding_transactions(holding_id);
CREATE INDEX idx_transactions_date ON public.holding_transactions(transaction_date DESC);
CREATE INDEX idx_transactions_type ON public.holding_transactions(transaction_type);

-- Comments
COMMENT ON TABLE public.holding_transactions IS
  'Capital movements for investment holdings: calls, distributions, contributions';

COMMENT ON COLUMN public.holding_transactions.amount IS
  'Transaction amount in base currency (positive for calls/investments, positive for distributions)';

-- ============================================================================
-- PART 3: INVESTMENT PERFORMANCE VIEW
-- Calculated metrics: cost basis, distributions, unrealized gain, MOIC
-- ============================================================================

CREATE VIEW v_investment_performance AS
SELECT
  h.id,
  h.portfolio_id,
  h.name,
  h.asset_type,
  h.asset_subtype,
  h.status,
  h.sector,
  h.country,

  -- Latest valuation
  latest_val.nav as current_nav,
  latest_val.as_of_date as nav_as_of_date,
  latest_val.valuation_source,

  -- Cost basis (sum of investments)
  COALESCE(inv.total_invested, h.funds_allocated, 0) as cost_basis,

  -- Distributions received
  COALESCE(dist.total_distributions, 0) as total_distributions,

  -- Unrealized gain/loss
  COALESCE(latest_val.nav, h.funds_allocated, 0) - COALESCE(inv.total_invested, h.funds_allocated, 0) as unrealized_gain,

  -- Unrealized gain percentage
  CASE
    WHEN COALESCE(inv.total_invested, h.funds_allocated, 0) > 0
    THEN ((COALESCE(latest_val.nav, h.funds_allocated, 0) - COALESCE(inv.total_invested, h.funds_allocated, 0)) / COALESCE(inv.total_invested, h.funds_allocated, 0)) * 100
    ELSE NULL
  END as unrealized_gain_pct,

  -- Total value (NAV + distributions)
  COALESCE(latest_val.nav, h.funds_allocated, 0) + COALESCE(dist.total_distributions, 0) as total_value,

  -- Multiple on Invested Capital (MOIC)
  CASE
    WHEN COALESCE(inv.total_invested, h.funds_allocated, 0) > 0
    THEN (COALESCE(latest_val.nav, h.funds_allocated, 0) + COALESCE(dist.total_distributions, 0)) / COALESCE(inv.total_invested, h.funds_allocated, 0)
    ELSE NULL
  END as moic,

  -- Transaction counts
  inv.investment_count,
  dist.distribution_count,

  -- First and last transaction dates
  inv.first_investment_date,
  inv.last_investment_date,
  dist.last_distribution_date

FROM public.holdings h

-- Latest valuation (most recent NAV)
LEFT JOIN LATERAL (
  SELECT nav, as_of_date, valuation_source
  FROM public.holding_valuations
  WHERE holding_id = h.id
  ORDER BY as_of_date DESC
  LIMIT 1
) latest_val ON true

-- Investment totals
LEFT JOIN LATERAL (
  SELECT
    SUM(amount) as total_invested,
    COUNT(*) as investment_count,
    MIN(transaction_date) as first_investment_date,
    MAX(transaction_date) as last_investment_date
  FROM public.holding_transactions
  WHERE holding_id = h.id
    AND transaction_type IN ('initial_investment', 'capital_call')
) inv ON true

-- Distribution totals
LEFT JOIN LATERAL (
  SELECT
    SUM(amount) as total_distributions,
    COUNT(*) as distribution_count,
    MAX(transaction_date) as last_distribution_date
  FROM public.holding_transactions
  WHERE holding_id = h.id
    AND transaction_type IN ('distribution', 'return_of_capital')
) dist ON true

-- Only include investment asset types
WHERE h.asset_type IN ('equity_investment', 'debt_investment', 'pri', 'mri');

-- Comments
COMMENT ON VIEW v_investment_performance IS
  'Calculated investment performance metrics: NAV, cost basis, distributions, unrealized gain, MOIC';

-- ============================================================================
-- PART 4: PORTFOLIO-LEVEL AGGREGATION VIEW
-- Aggregate performance across entire investment portfolio
-- ============================================================================

CREATE VIEW v_portfolio_investment_summary AS
SELECT
  portfolio_id,

  -- Counts
  COUNT(*) as total_investments,
  COUNT(*) FILTER (WHERE status = 'Active') as active_investments,
  COUNT(*) FILTER (WHERE status = 'Exited') as exited_investments,

  -- Asset type breakdown
  COUNT(*) FILTER (WHERE asset_type = 'equity_investment') as equity_count,
  COUNT(*) FILTER (WHERE asset_type = 'debt_investment') as debt_count,
  COUNT(*) FILTER (WHERE asset_type = 'pri') as pri_count,
  COUNT(*) FILTER (WHERE asset_type = 'mri') as mri_count,

  -- Financial totals
  SUM(cost_basis) as total_cost_basis,
  SUM(current_nav) as total_current_nav,
  SUM(total_distributions) as total_distributions,
  SUM(unrealized_gain) as total_unrealized_gain,
  SUM(total_value) as total_value,

  -- Portfolio-level MOIC
  CASE
    WHEN SUM(cost_basis) > 0
    THEN SUM(total_value) / SUM(cost_basis)
    ELSE NULL
  END as portfolio_moic,

  -- Average metrics
  AVG(unrealized_gain_pct) FILTER (WHERE unrealized_gain_pct IS NOT NULL) as avg_unrealized_gain_pct,
  AVG(moic) FILTER (WHERE moic IS NOT NULL) as avg_moic

FROM v_investment_performance
GROUP BY portfolio_id;

COMMENT ON VIEW v_portfolio_investment_summary IS
  'Portfolio-level aggregation of investment performance metrics';

-- ============================================================================
-- PART 5: ROW LEVEL SECURITY (RLS)
-- Apply same security model as holdings table
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE public.holding_valuations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holding_transactions ENABLE ROW LEVEL SECURITY;

-- Valuations RLS: Access through holding's portfolio membership
CREATE POLICY "Users can view valuations for their portfolios"
  ON public.holding_valuations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.holdings h
      INNER JOIN public.portfolio_members pm ON h.portfolio_id = pm.portfolio_id
      WHERE h.id = holding_valuations.holding_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert valuations for portfolios they can edit"
  ON public.holding_valuations
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.holdings h
      WHERE h.id = holding_valuations.holding_id
        AND can_edit_portfolio(h.portfolio_id)
    )
  );

CREATE POLICY "Users can update valuations for portfolios they can edit"
  ON public.holding_valuations
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.holdings h
      WHERE h.id = holding_valuations.holding_id
        AND can_edit_portfolio(h.portfolio_id)
    )
  );

CREATE POLICY "Users can delete valuations for portfolios they can edit"
  ON public.holding_valuations
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.holdings h
      WHERE h.id = holding_valuations.holding_id
        AND can_edit_portfolio(h.portfolio_id)
    )
  );

-- Transactions RLS: Same pattern as valuations
CREATE POLICY "Users can view transactions for their portfolios"
  ON public.holding_transactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.holdings h
      INNER JOIN public.portfolio_members pm ON h.portfolio_id = pm.portfolio_id
      WHERE h.id = holding_transactions.holding_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert transactions for portfolios they can edit"
  ON public.holding_transactions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.holdings h
      WHERE h.id = holding_transactions.holding_id
        AND can_edit_portfolio(h.portfolio_id)
    )
  );

CREATE POLICY "Users can update transactions for portfolios they can edit"
  ON public.holding_transactions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.holdings h
      WHERE h.id = holding_transactions.holding_id
        AND can_edit_portfolio(h.portfolio_id)
    )
  );

CREATE POLICY "Users can delete transactions for portfolios they can edit"
  ON public.holding_transactions
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.holdings h
      WHERE h.id = holding_transactions.holding_id
        AND can_edit_portfolio(h.portfolio_id)
    )
  );

-- ============================================================================
-- PART 6: HELPER FUNCTIONS
-- ============================================================================

-- Function to get latest NAV for a holding
CREATE OR REPLACE FUNCTION get_latest_nav(p_holding_id UUID)
RETURNS NUMERIC AS $$
  SELECT nav
  FROM public.holding_valuations
  WHERE holding_id = p_holding_id
  ORDER BY as_of_date DESC
  LIMIT 1;
$$ LANGUAGE SQL STABLE;

-- Function to calculate cost basis for a holding
CREATE OR REPLACE FUNCTION get_cost_basis(p_holding_id UUID)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM public.holding_transactions
  WHERE holding_id = p_holding_id
    AND transaction_type IN ('initial_investment', 'capital_call');
$$ LANGUAGE SQL STABLE;

-- Function to calculate total distributions for a holding
CREATE OR REPLACE FUNCTION get_total_distributions(p_holding_id UUID)
RETURNS NUMERIC AS $$
  SELECT COALESCE(SUM(amount), 0)
  FROM public.holding_transactions
  WHERE holding_id = p_holding_id
    AND transaction_type IN ('distribution', 'return_of_capital');
$$ LANGUAGE SQL STABLE;

-- ============================================================================
-- Migration Verification
-- ============================================================================

-- Run these queries after migration to verify:

/*
-- Check table creation
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('holding_valuations', 'holding_transactions');

-- Check view creation
SELECT table_name FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN ('v_investment_performance', 'v_portfolio_investment_summary');

-- Check RLS policies
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('holding_valuations', 'holding_transactions');

-- Test investment performance view (should return investments only)
SELECT id, name, asset_type, current_nav, cost_basis, moic
FROM v_investment_performance
LIMIT 5;
*/

-- ============================================================================
-- Rollback Instructions
-- ============================================================================

/*
BEGIN;

-- Drop views
DROP VIEW IF EXISTS v_portfolio_investment_summary;
DROP VIEW IF EXISTS v_investment_performance;

-- Drop functions
DROP FUNCTION IF EXISTS get_latest_nav(UUID);
DROP FUNCTION IF EXISTS get_cost_basis(UUID);
DROP FUNCTION IF EXISTS get_total_distributions(UUID);

-- Drop tables (CASCADE removes foreign keys)
DROP TABLE IF EXISTS public.holding_transactions CASCADE;
DROP TABLE IF EXISTS public.holding_valuations CASCADE;

-- Drop enum
DROP TYPE IF EXISTS transaction_type_enum;

COMMIT;
*/
