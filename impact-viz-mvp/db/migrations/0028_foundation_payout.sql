-- =============================================================================
-- 0028_foundation_payout.sql
-- Adds foundation_990pf_data table with proper IRS 990-PF Part XIII columns.
-- Depends on: 0004 (portfolios)
--
-- The legacy migration track (0013_tax_tracking.sql) created a simplified
-- version of this table.  This migration idempotently creates it if absent and
-- adds the extra columns needed for the correct Part XIII calculation:
--   avg_fair_market_value  — average monthly FMV (more accurate than year-end)
--   exempt_use_assets      — assets used directly in charitable activities
--   acquisition_indebtedness — indebtedness on asset acquisition
-- Without these three columns the distributable-amount formula is just
-- netAssets × 0.05, which materially over-states the required payout.
-- =============================================================================

CREATE TABLE IF NOT EXISTS foundation_990pf_data (
  id                       UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  portfolio_id             UUID        NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  tax_year                 SMALLINT    NOT NULL,

  -- Asset base (IRS Part XIII lines 1–3)
  fair_market_value_assets NUMERIC(18,2),           -- year-end FMV (fallback)
  avg_fair_market_value    NUMERIC(18,2),           -- average monthly FMV (preferred)
  exempt_use_assets        NUMERIC(18,2) NOT NULL DEFAULT 0,
  acquisition_indebtedness NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- Excise tax on net investment income (IRS Part VI)
  net_investment_income    NUMERIC(18,2) NOT NULL DEFAULT 0,
  excise_tax_rate          NUMERIC(5,2)  NOT NULL DEFAULT 1.39, -- percent, e.g. 1.39
  excise_tax_amount        NUMERIC(18,2),           -- override; computed from rate if null

  -- Payout (may be stored from the actual filed form)
  required_payout          NUMERIC(18,2),           -- override; computed if null
  actual_payout            NUMERIC(18,2),
  payout_deficit           NUMERIC(18,2) NOT NULL DEFAULT 0,

  -- Self-dealing (Part VII-A)
  has_self_dealing         BOOLEAN       NOT NULL DEFAULT false,
  self_dealing_notes       TEXT,

  -- Summary totals
  total_grants             NUMERIC(18,2) NOT NULL DEFAULT 0,
  total_expenses           NUMERIC(18,2) NOT NULL DEFAULT 0,

  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (portfolio_id, tax_year)
);

-- Add new columns for environments that already have the legacy table
ALTER TABLE foundation_990pf_data
  ADD COLUMN IF NOT EXISTS avg_fair_market_value    NUMERIC(18,2);
ALTER TABLE foundation_990pf_data
  ADD COLUMN IF NOT EXISTS exempt_use_assets        NUMERIC(18,2) NOT NULL DEFAULT 0;
ALTER TABLE foundation_990pf_data
  ADD COLUMN IF NOT EXISTS acquisition_indebtedness NUMERIC(18,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_foundation_990pf_portfolio_year
  ON foundation_990pf_data (portfolio_id, tax_year);

CREATE TRIGGER IF NOT EXISTS trg_foundation_990pf_updated_at
  BEFORE UPDATE ON foundation_990pf_data
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE foundation_990pf_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "foundation_990pf_data: portfolio members can view"
  ON foundation_990pf_data FOR SELECT
  USING (can_view_portfolio(portfolio_id));

CREATE POLICY IF NOT EXISTS "foundation_990pf_data: portfolio admins can manage"
  ON foundation_990pf_data FOR ALL
  USING (can_modify_portfolio(portfolio_id))
  WITH CHECK (can_modify_portfolio(portfolio_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON foundation_990pf_data TO authenticated;
GRANT ALL ON foundation_990pf_data TO service_role;
