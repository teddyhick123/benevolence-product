-- =============================================================================
-- 0012_owner_tax_profile.sql
-- owner_tax_profile — the PORTFOLIO OWNER's personal tax data.
-- This is distinct from the `donors` table (0015), which is the donor CRM.
-- Stores: DOB, filing status, AGI info needed for QCD calculations, etc.
--
-- Name history: was called `donor_profiles` in legacy schema — renamed to
-- eliminate confusion with the donor CRM table.
-- Depends on: 0001, 0004
-- =============================================================================

CREATE TABLE IF NOT EXISTS owner_tax_profiles (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  -- One profile per portfolio (the portfolio owner's personal tax info)
  portfolio_id        uuid NOT NULL UNIQUE REFERENCES portfolios(id) ON DELETE CASCADE,
  user_id             uuid NOT NULL REFERENCES auth.users(id),

  -- Personal info (for IRS age-based rules like QCD eligibility at 70.5)
  date_of_birth       date,
  spouse_date_of_birth date,

  -- Tax filing
  filing_status       text NOT NULL DEFAULT 'single',
  -- 'single', 'married_filing_jointly', 'married_filing_separately',
  -- 'head_of_household', 'qualifying_widow_widower'

  -- AGI inputs (current tax year)
  gross_income        numeric(20,2),
  adjustments         numeric(20,2),
  agi                 numeric(20,2) GENERATED ALWAYS AS (
                        COALESCE(gross_income, 0) - COALESCE(adjustments, 0)
                      ) STORED,

  -- Carryforward deductions from prior years (OBBB 2026 / CARES Act)
  carryforward_charitable numeric(20,2) DEFAULT 0,
  carryforward_year   int,

  -- QCD tracking
  qcd_used_ytd        numeric(20,2) DEFAULT 0,
  qcd_limit_override  numeric(20,2),  -- if null, use IRS annual limit ($105k 2024)

  -- State tax info
  state_of_residency  text,
  state_agi           numeric(20,2),

  tax_year            int NOT NULL DEFAULT date_part('year', CURRENT_DATE)::int,

  notes               text
);

CREATE INDEX idx_owner_tax_profiles_portfolio_id ON owner_tax_profiles (portfolio_id);
CREATE INDEX idx_owner_tax_profiles_user_id      ON owner_tax_profiles (user_id);

CREATE TRIGGER trg_owner_tax_profiles_updated_at
  BEFORE UPDATE ON owner_tax_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: owner_tax_profile — very sensitive, strict access
-- ---------------------------------------------------------------------------
ALTER TABLE owner_tax_profiles ENABLE ROW LEVEL SECURITY;

-- Only the portfolio owner (owner/admin role) can see tax profile
CREATE POLICY "owner_tax_profiles: portfolio admins only"
  ON owner_tax_profiles FOR SELECT
  USING (user_portfolio_role(portfolio_id) IN ('admin','owner'));

CREATE POLICY "owner_tax_profiles: portfolio owner can manage"
  ON owner_tax_profiles FOR ALL
  USING (user_portfolio_role(portfolio_id) IN ('admin','owner'))
  WITH CHECK (user_portfolio_role(portfolio_id) IN ('admin','owner'));
