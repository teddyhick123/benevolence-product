-- Migration 0026: Phase 1 - AGI & Donor Profile Tracking
-- Purpose: Enable precise tax deduction calculations and QCD validation
-- Author: Claude Code
-- Date: 2024-11-28
-- Related: Tax Enhancement Phase 1

BEGIN;

-- ============================================================================
-- 1. DONOR PROFILES - Personal tax information for validation
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.donor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,

  -- Personal information
  date_of_birth DATE,
  filing_status TEXT CHECK (filing_status IN ('single', 'married_filing_jointly', 'married_filing_separately', 'head_of_household', 'qualifying_widow')),

  -- Calculated fields
  age_as_of_date DATE, -- Date to calculate age (typically Dec 31 of tax year)

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One profile per portfolio
  UNIQUE(portfolio_id)
);

CREATE INDEX idx_donor_profiles_portfolio ON public.donor_profiles(portfolio_id);

COMMENT ON TABLE public.donor_profiles IS
  'Donor personal information for tax validation (QCD age requirements, etc.)';

COMMENT ON COLUMN public.donor_profiles.date_of_birth IS
  'Date of birth for calculating age eligibility (e.g., QCD requires age 70.5+)';

COMMENT ON COLUMN public.donor_profiles.filing_status IS
  'Tax filing status affects standard deduction and AGI thresholds';

-- ============================================================================
-- 2. TAX YEARS - AGI and tax planning data per year
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.tax_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL CHECK (tax_year >= 1900 AND tax_year <= 2100),

  -- Income information
  adjusted_gross_income NUMERIC CHECK (adjusted_gross_income >= 0),
  filing_status TEXT CHECK (filing_status IN ('single', 'married_filing_jointly', 'married_filing_separately', 'head_of_household', 'qualifying_widow')),

  -- AGI-based limits (calculated from AGI and filing status)
  agi_limit_60_pct NUMERIC GENERATED ALWAYS AS (adjusted_gross_income * 0.60) STORED,
  agi_limit_50_pct NUMERIC GENERATED ALWAYS AS (adjusted_gross_income * 0.50) STORED,
  agi_limit_30_pct NUMERIC GENERATED ALWAYS AS (adjusted_gross_income * 0.30) STORED,
  agi_limit_20_pct NUMERIC GENERATED ALWAYS AS (adjusted_gross_income * 0.20) STORED,

  -- Standard deduction (for comparison)
  standard_deduction NUMERIC,

  -- Alternative Minimum Tax
  amt_exposure BOOLEAN DEFAULT false,
  amt_notes TEXT,

  -- Totals (calculated by triggers or manual entry)
  total_contributions_60_pct NUMERIC DEFAULT 0 CHECK (total_contributions_60_pct >= 0),
  total_contributions_50_pct NUMERIC DEFAULT 0 CHECK (total_contributions_50_pct >= 0),
  total_contributions_30_pct NUMERIC DEFAULT 0 CHECK (total_contributions_30_pct >= 0),
  total_contributions_20_pct NUMERIC DEFAULT 0 CHECK (total_contributions_20_pct >= 0),

  -- Carryforward from prior years
  carryforward_from_prior_years NUMERIC DEFAULT 0 CHECK (carryforward_from_prior_years >= 0),

  -- Planning notes
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- One record per portfolio per tax year
  UNIQUE(portfolio_id, tax_year)
);

CREATE INDEX idx_tax_years_portfolio_year ON public.tax_years(portfolio_id, tax_year);
CREATE INDEX idx_tax_years_year ON public.tax_years(tax_year);

COMMENT ON TABLE public.tax_years IS
  'AGI and tax planning information per year for calculating actual deduction limits';

COMMENT ON COLUMN public.tax_years.adjusted_gross_income IS
  'Adjusted Gross Income from tax return - determines charitable deduction limits';

COMMENT ON COLUMN public.tax_years.agi_limit_60_pct IS
  'Max deduction for cash to public charity (60% of AGI)';

COMMENT ON COLUMN public.tax_years.agi_limit_50_pct IS
  'Max deduction for conservation easements with enhanced limit (50% of AGI)';

COMMENT ON COLUMN public.tax_years.agi_limit_30_pct IS
  'Max deduction for appreciated property to public charity OR cash to private foundation (30% of AGI)';

COMMENT ON COLUMN public.tax_years.agi_limit_20_pct IS
  'Max deduction for appreciated property to private foundation (20% of AGI)';

-- ============================================================================
-- 3. ENHANCED CARRYFORWARDS - Auto-generated multi-year tracking
-- ============================================================================

-- Add columns to existing tax_carryforwards table for better tracking
ALTER TABLE public.tax_carryforwards
  ADD COLUMN IF NOT EXISTS used_in_year INTEGER,
  ADD COLUMN IF NOT EXISTS amount_used_in_year NUMERIC DEFAULT 0 CHECK (amount_used_in_year >= 0),
  ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.tax_carryforwards.used_in_year IS
  'Tax year when this carryforward amount was applied (NULL if not yet used)';

COMMENT ON COLUMN public.tax_carryforwards.amount_used_in_year IS
  'Amount of this carryforward used in a specific year';

COMMENT ON COLUMN public.tax_carryforwards.auto_generated IS
  'Whether this carryforward was automatically generated by the system';

CREATE INDEX IF NOT EXISTS idx_tax_carryforwards_expires ON public.tax_carryforwards(portfolio_id, expires_tax_year);

-- ============================================================================
-- 4. HELPER FUNCTIONS FOR AGI CALCULATIONS
-- ============================================================================

-- Function to get AGI for a specific year
CREATE OR REPLACE FUNCTION get_agi_for_year(p_portfolio_id UUID, p_tax_year INTEGER)
RETURNS NUMERIC AS $$
DECLARE
  v_agi NUMERIC;
BEGIN
  SELECT adjusted_gross_income INTO v_agi
  FROM public.tax_years
  WHERE portfolio_id = p_portfolio_id
    AND tax_year = p_tax_year;

  RETURN v_agi;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_agi_for_year(UUID, INTEGER) IS
  'Retrieves AGI for a portfolio and tax year';

-- Function to calculate deduction limit for a contribution
CREATE OR REPLACE FUNCTION calculate_deduction_limit(
  p_portfolio_id UUID,
  p_tax_year INTEGER,
  p_agi_limit_percentage NUMERIC,
  p_amount NUMERIC
)
RETURNS TABLE (
  agi NUMERIC,
  limit_amount NUMERIC,
  contribution_amount NUMERIC,
  deductible_this_year NUMERIC,
  excess_for_carryforward NUMERIC,
  within_limit BOOLEAN
) AS $$
DECLARE
  v_agi NUMERIC;
  v_limit NUMERIC;
  v_deductible NUMERIC;
  v_excess NUMERIC;
BEGIN
  -- Get AGI for the year
  v_agi := get_agi_for_year(p_portfolio_id, p_tax_year);

  -- If no AGI on record, return NULLs
  IF v_agi IS NULL THEN
    RETURN QUERY SELECT
      NULL::NUMERIC, NULL::NUMERIC, p_amount, p_amount, 0::NUMERIC, NULL::BOOLEAN;
    RETURN;
  END IF;

  -- Calculate limit
  v_limit := v_agi * (p_agi_limit_percentage / 100.0);

  -- Calculate deductible amount (lesser of contribution or limit)
  v_deductible := LEAST(p_amount, v_limit);

  -- Calculate excess for carryforward
  v_excess := GREATEST(p_amount - v_limit, 0);

  RETURN QUERY SELECT
    v_agi,
    v_limit,
    p_amount,
    v_deductible,
    v_excess,
    (p_amount <= v_limit);
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_deduction_limit(UUID, INTEGER, NUMERIC, NUMERIC) IS
  'Calculates actual deduction limit based on AGI and returns breakdown';

-- Function to calculate donor age as of a specific date
CREATE OR REPLACE FUNCTION calculate_donor_age(p_portfolio_id UUID, p_as_of_date DATE)
RETURNS NUMERIC AS $$
DECLARE
  v_dob DATE;
  v_age NUMERIC;
BEGIN
  SELECT date_of_birth INTO v_dob
  FROM public.donor_profiles
  WHERE portfolio_id = p_portfolio_id;

  IF v_dob IS NULL THEN
    RETURN NULL;
  END IF;

  -- Calculate age in years (with decimal for months)
  v_age := EXTRACT(YEAR FROM AGE(p_as_of_date, v_dob)) +
           (EXTRACT(MONTH FROM AGE(p_as_of_date, v_dob)) / 12.0);

  RETURN v_age;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION calculate_donor_age(UUID, DATE) IS
  'Calculates donor age as of a specific date (returns decimal with months)';

-- Function to validate QCD eligibility
CREATE OR REPLACE FUNCTION validate_qcd_eligibility(
  p_portfolio_id UUID,
  p_contribution_date DATE,
  p_amount NUMERIC
)
RETURNS TABLE (
  is_eligible BOOLEAN,
  donor_age NUMERIC,
  reason TEXT
) AS $$
DECLARE
  v_age NUMERIC;
  v_eligible BOOLEAN;
  v_reason TEXT;
BEGIN
  v_age := calculate_donor_age(p_portfolio_id, p_contribution_date);

  -- Check age requirement (70.5+)
  IF v_age IS NULL THEN
    v_eligible := false;
    v_reason := 'Donor date of birth not on file';
  ELSIF v_age < 70.5 THEN
    v_eligible := false;
    v_reason := format('Donor age %.1f is below required 70.5', v_age);
  ELSIF p_amount > 100000 THEN
    v_eligible := false;
    v_reason := format('Amount $%s exceeds $100,000 annual QCD limit', p_amount);
  ELSE
    v_eligible := true;
    v_reason := format('Eligible: Age %.1f, Amount $%s', v_age, p_amount);
  END IF;

  RETURN QUERY SELECT v_eligible, v_age, v_reason;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION validate_qcd_eligibility(UUID, DATE, NUMERIC) IS
  'Validates whether a contribution qualifies as a QCD based on donor age and amount';

-- ============================================================================
-- 5. AUTO-CARRYFORWARD GENERATION FUNCTION
-- ============================================================================

CREATE OR REPLACE FUNCTION auto_generate_carryforwards(p_tax_contribution_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_portfolio_id UUID;
  v_tax_year INTEGER;
  v_amount NUMERIC;
  v_agi_limit_pct NUMERIC;
  v_carryforward_years INTEGER;
  v_agi_category TEXT;
  v_recipient_name TEXT;
  v_recipient_ein TEXT;
  v_excess NUMERIC;
  v_generated_count INTEGER := 0;
  i INTEGER;
BEGIN
  -- Get contribution details
  SELECT
    portfolio_id, tax_year, amount_usd, agi_limit_percentage,
    carryforward_years, agi_limit_category,
    recipient_name, recipient_ein
  INTO
    v_portfolio_id, v_tax_year, v_amount, v_agi_limit_pct,
    v_carryforward_years, v_agi_category,
    v_recipient_name, v_recipient_ein
  FROM public.tax_contributions
  WHERE id = p_tax_contribution_id;

  -- If no carryforward eligible, exit
  IF v_carryforward_years IS NULL OR v_carryforward_years = 0 THEN
    RETURN 0;
  END IF;

  -- Calculate excess (amount exceeding AGI limit)
  SELECT excess_for_carryforward INTO v_excess
  FROM calculate_deduction_limit(
    v_portfolio_id, v_tax_year, v_agi_limit_pct, v_amount
  );

  -- If no excess or AGI not on file, exit
  IF v_excess IS NULL OR v_excess <= 0 THEN
    RETURN 0;
  END IF;

  -- Generate carryforward records for future years
  FOR i IN 1..v_carryforward_years LOOP
    INSERT INTO public.tax_carryforwards (
      portfolio_id,
      tax_contribution_id,
      originating_tax_year,
      amount,
      amount_remaining,
      agi_limit_category,
      expires_tax_year,
      recipient_name,
      recipient_ein,
      auto_generated,
      notes
    ) VALUES (
      v_portfolio_id,
      p_tax_contribution_id,
      v_tax_year,
      v_excess,
      v_excess,
      v_agi_category,
      v_tax_year + v_carryforward_years,
      v_recipient_name,
      v_recipient_ein,
      true,
      format('Auto-generated carryforward for year %s (expires %s)',
        v_tax_year + i, v_tax_year + v_carryforward_years)
    );

    v_generated_count := v_generated_count + 1;
  END LOOP;

  RETURN v_generated_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_generate_carryforwards(UUID) IS
  'Automatically generates carryforward records when contribution exceeds AGI limit';

-- ============================================================================
-- 6. TRIGGERS FOR AUTOMATIC UPDATES
-- ============================================================================

-- Trigger to update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_donor_profiles_updated_at
  BEFORE UPDATE ON public.donor_profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tax_years_updated_at
  BEFORE UPDATE ON public.tax_years
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 7. RLS POLICIES
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE public.donor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_years ENABLE ROW LEVEL SECURITY;

-- Policies for donor_profiles (user owns their data via profiles table)
CREATE POLICY donor_profiles_select_own ON public.donor_profiles
  FOR SELECT USING (
    portfolio_id IN (
      SELECT portfolio_id FROM public.profiles
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY donor_profiles_insert_own ON public.donor_profiles
  FOR INSERT WITH CHECK (
    portfolio_id IN (
      SELECT portfolio_id FROM public.profiles
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY donor_profiles_update_own ON public.donor_profiles
  FOR UPDATE USING (
    portfolio_id IN (
      SELECT portfolio_id FROM public.profiles
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY donor_profiles_delete_own ON public.donor_profiles
  FOR DELETE USING (
    portfolio_id IN (
      SELECT portfolio_id FROM public.profiles
      WHERE user_id = auth.uid()
    )
  );

-- Policies for tax_years
CREATE POLICY tax_years_select_own ON public.tax_years
  FOR SELECT USING (
    portfolio_id IN (
      SELECT portfolio_id FROM public.profiles
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY tax_years_insert_own ON public.tax_years
  FOR INSERT WITH CHECK (
    portfolio_id IN (
      SELECT portfolio_id FROM public.profiles
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY tax_years_update_own ON public.tax_years
  FOR UPDATE USING (
    portfolio_id IN (
      SELECT portfolio_id FROM public.profiles
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY tax_years_delete_own ON public.tax_years
  FOR DELETE USING (
    portfolio_id IN (
      SELECT portfolio_id FROM public.profiles
      WHERE user_id = auth.uid()
    )
  );

COMMIT;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Verify tables created
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('donor_profiles', 'tax_years');

-- Test AGI calculation
-- SELECT * FROM calculate_deduction_limit(
--   'portfolio-uuid'::UUID, 2024, 30.0, 1000000
-- );

-- Test QCD validation
-- SELECT * FROM validate_qcd_eligibility(
--   'portfolio-uuid'::UUID, '2024-01-01'::DATE, 50000
-- );
