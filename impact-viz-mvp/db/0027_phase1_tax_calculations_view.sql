-- Migration 0027: Phase 1 - Tax Calculation Views & Enhancements
-- Purpose: Create views with AGI-based calculations and deduction limits
-- Author: Claude Code
-- Date: 2024-11-28
-- Related: Migration 0026 (AGI & Donor Tracking)

BEGIN;

-- ============================================================================
-- 1. VIEW: Tax Contributions with AGI Calculations
-- ============================================================================

CREATE OR REPLACE VIEW v_tax_contributions_with_limits AS
SELECT
  tc.id,
  tc.portfolio_id,
  tc.holding_id,
  tc.tax_year,
  tc.contribution_date,
  tc.recipient_name,
  tc.recipient_ein,
  tc.recipient_type,
  tc.contribution_type,
  tc.amount_usd,
  tc.cost_basis,
  tc.fmv_at_donation,
  tc.deductible_amount as original_deductible_amount,
  tc.agi_limit_percentage,
  tc.carryforward_eligible,
  tc.carryforward_years,

  -- AGI information
  ty.adjusted_gross_income as agi,
  ty.filing_status,

  -- Calculated AGI limit
  CASE
    WHEN ty.adjusted_gross_income IS NOT NULL AND tc.agi_limit_percentage IS NOT NULL
    THEN ty.adjusted_gross_income * (tc.agi_limit_percentage / 100.0)
    ELSE NULL
  END as agi_limit_amount,

  -- Actual deductible this year (lesser of contribution or AGI limit)
  CASE
    WHEN ty.adjusted_gross_income IS NOT NULL AND tc.agi_limit_percentage IS NOT NULL
    THEN LEAST(
      tc.amount_usd,
      ty.adjusted_gross_income * (tc.agi_limit_percentage / 100.0)
    )
    ELSE tc.amount_usd
  END as deductible_this_year,

  -- Excess for carryforward
  CASE
    WHEN ty.adjusted_gross_income IS NOT NULL AND tc.agi_limit_percentage IS NOT NULL
    THEN GREATEST(
      tc.amount_usd - (ty.adjusted_gross_income * (tc.agi_limit_percentage / 100.0)),
      0
    )
    ELSE 0
  END as excess_for_carryforward,

  -- Within limit flag
  CASE
    WHEN ty.adjusted_gross_income IS NULL THEN NULL
    WHEN tc.agi_limit_percentage IS NULL THEN true
    WHEN tc.amount_usd <= (ty.adjusted_gross_income * (tc.agi_limit_percentage / 100.0)) THEN true
    ELSE false
  END as within_agi_limit,

  -- Capital gains avoided
  CASE
    WHEN tc.cost_basis IS NOT NULL AND tc.fmv_at_donation IS NOT NULL
    THEN tc.fmv_at_donation - tc.cost_basis
    ELSE NULL
  END as capital_gains_avoided,

  -- Tax savings estimate (simplified: capital gains rate 20% + deduction at marginal 37%)
  CASE
    WHEN tc.cost_basis IS NOT NULL AND tc.fmv_at_donation IS NOT NULL
      AND ty.adjusted_gross_income IS NOT NULL AND tc.agi_limit_percentage IS NOT NULL
    THEN
      -- Capital gains tax avoided
      ((tc.fmv_at_donation - tc.cost_basis) * 0.20) +
      -- Deduction value (at 37% marginal rate assumption)
      (LEAST(tc.amount_usd, ty.adjusted_gross_income * (tc.agi_limit_percentage / 100.0)) * 0.37)
    WHEN ty.adjusted_gross_income IS NOT NULL AND tc.agi_limit_percentage IS NOT NULL
    THEN
      -- Just deduction value (cash donation)
      LEAST(tc.amount_usd, ty.adjusted_gross_income * (tc.agi_limit_percentage / 100.0)) * 0.37
    ELSE NULL
  END as estimated_tax_savings,

  -- QCD special handling
  CASE
    WHEN tc.qcd_qualified = true THEN tc.amount_usd * 0.37 -- Excluded from income at marginal rate
    ELSE NULL
  END as qcd_tax_benefit,

  -- Metadata
  tc.notes,
  tc.created_at,
  tc.updated_at

FROM public.tax_contributions tc
LEFT JOIN public.tax_years ty ON tc.portfolio_id = ty.portfolio_id AND tc.tax_year = ty.tax_year;

COMMENT ON VIEW v_tax_contributions_with_limits IS
  'Tax contributions enhanced with AGI-based deduction limit calculations and tax savings estimates';

-- ============================================================================
-- 2. VIEW: Portfolio Tax Summary by Year
-- ============================================================================

CREATE OR REPLACE VIEW v_portfolio_tax_summary AS
SELECT
  ty.portfolio_id,
  ty.tax_year,
  ty.adjusted_gross_income as agi,
  ty.filing_status,
  ty.standard_deduction,

  -- AGI limits
  ty.agi_limit_60_pct,
  ty.agi_limit_50_pct,
  ty.agi_limit_30_pct,
  ty.agi_limit_20_pct,

  -- Total contributions by category
  COUNT(tc.id) as total_contributions_count,
  SUM(tc.amount_usd) as total_contributed,

  -- Calculate totals by AGI limit category
  SUM(CASE WHEN tc.agi_limit_percentage = 60 THEN tc.amount_usd ELSE 0 END) as contributed_60_pct,
  SUM(CASE WHEN tc.agi_limit_percentage = 50 THEN tc.amount_usd ELSE 0 END) as contributed_50_pct,
  SUM(CASE WHEN tc.agi_limit_percentage = 30 THEN tc.amount_usd ELSE 0 END) as contributed_30_pct,
  SUM(CASE WHEN tc.agi_limit_percentage = 20 THEN tc.amount_usd ELSE 0 END) as contributed_20_pct,

  -- Total deductible this year (with AGI limits applied)
  SUM(
    CASE
      WHEN ty.adjusted_gross_income IS NOT NULL AND tc.agi_limit_percentage IS NOT NULL
      THEN LEAST(tc.amount_usd, ty.adjusted_gross_income * (tc.agi_limit_percentage / 100.0))
      ELSE tc.amount_usd
    END
  ) as total_deductible_this_year,

  -- Total excess for carryforward
  SUM(
    CASE
      WHEN ty.adjusted_gross_income IS NOT NULL AND tc.agi_limit_percentage IS NOT NULL
      THEN GREATEST(tc.amount_usd - (ty.adjusted_gross_income * (tc.agi_limit_percentage / 100.0)), 0)
      ELSE 0
    END
  ) as total_excess_carryforward,

  -- Total capital gains avoided
  SUM(
    CASE
      WHEN tc.cost_basis IS NOT NULL AND tc.fmv_at_donation IS NOT NULL
      THEN tc.fmv_at_donation - tc.cost_basis
      ELSE 0
    END
  ) as total_capital_gains_avoided,

  -- QCD totals
  SUM(CASE WHEN tc.qcd_qualified = true THEN tc.amount_usd ELSE 0 END) as total_qcd_amount,
  COUNT(CASE WHEN tc.qcd_qualified = true THEN 1 END) as qcd_count,

  -- Utilization percentages
  CASE
    WHEN ty.agi_limit_60_pct > 0
    THEN (SUM(CASE WHEN tc.agi_limit_percentage = 60 THEN tc.amount_usd ELSE 0 END) / ty.agi_limit_60_pct) * 100
    ELSE NULL
  END as utilization_60_pct,

  CASE
    WHEN ty.agi_limit_30_pct > 0
    THEN (SUM(CASE WHEN tc.agi_limit_percentage = 30 THEN tc.amount_usd ELSE 0 END) / ty.agi_limit_30_pct) * 100
    ELSE NULL
  END as utilization_30_pct,

  -- Carryforward information
  ty.carryforward_from_prior_years,

  -- Remaining capacity
  CASE
    WHEN ty.agi_limit_60_pct IS NOT NULL
    THEN ty.agi_limit_60_pct - SUM(CASE WHEN tc.agi_limit_percentage = 60 THEN tc.amount_usd ELSE 0 END)
    ELSE NULL
  END as remaining_capacity_60_pct,

  CASE
    WHEN ty.agi_limit_30_pct IS NOT NULL
    THEN ty.agi_limit_30_pct - SUM(CASE WHEN tc.agi_limit_percentage = 30 THEN tc.amount_usd ELSE 0 END)
    ELSE NULL
  END as remaining_capacity_30_pct,

  ty.notes,
  ty.created_at,
  ty.updated_at

FROM public.tax_years ty
LEFT JOIN public.tax_contributions tc
  ON ty.portfolio_id = tc.portfolio_id
  AND ty.tax_year = tc.tax_year
GROUP BY
  ty.id, ty.portfolio_id, ty.tax_year, ty.adjusted_gross_income,
  ty.filing_status, ty.standard_deduction,
  ty.agi_limit_60_pct, ty.agi_limit_50_pct, ty.agi_limit_30_pct, ty.agi_limit_20_pct,
  ty.carryforward_from_prior_years, ty.notes, ty.created_at, ty.updated_at;

COMMENT ON VIEW v_portfolio_tax_summary IS
  'Portfolio-level tax summary showing AGI utilization, deduction limits, and carryforward amounts by year';

-- ============================================================================
-- 3. VIEW: Carryforward Schedule
-- ============================================================================

CREATE OR REPLACE VIEW v_carryforward_schedule AS
SELECT
  cf.id,
  cf.portfolio_id,
  cf.tax_contribution_id,
  cf.originating_tax_year,
  cf.expires_tax_year,
  cf.amount as original_amount,
  cf.amount_remaining,
  cf.amount - cf.amount_remaining as amount_used,
  cf.agi_limit_category,
  cf.recipient_name,
  cf.auto_generated,

  -- Years remaining
  cf.expires_tax_year - EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER as years_until_expiry,

  -- Status
  CASE
    WHEN cf.expires_tax_year < EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER THEN 'expired'
    WHEN cf.amount_remaining <= 0 THEN 'fully_used'
    WHEN cf.amount_remaining < cf.amount THEN 'partially_used'
    ELSE 'available'
  END as status,

  -- Tax contribution details (if linked)
  tc.contribution_type,
  h.asset_type,

  cf.notes,
  cf.created_at,
  cf.updated_at

FROM public.tax_carryforwards cf
LEFT JOIN public.tax_contributions tc ON cf.tax_contribution_id = tc.id
LEFT JOIN public.holdings h ON tc.holding_id = h.id;

COMMENT ON VIEW v_carryforward_schedule IS
  'Carryforward schedule showing status, expiry, and remaining amounts';

-- ============================================================================
-- 4. FUNCTION: Get Donation Capacity for Current Year
-- ============================================================================

CREATE OR REPLACE FUNCTION get_donation_capacity(
  p_portfolio_id UUID,
  p_tax_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
)
RETURNS TABLE (
  tax_year INTEGER,
  agi NUMERIC,
  -- Cash to public charity (60%)
  limit_60_pct NUMERIC,
  used_60_pct NUMERIC,
  remaining_60_pct NUMERIC,
  -- Appreciated property to public charity / cash to private foundation (30%)
  limit_30_pct NUMERIC,
  used_30_pct NUMERIC,
  remaining_30_pct NUMERIC,
  -- Appreciated property to private foundation (20%)
  limit_20_pct NUMERIC,
  used_20_pct NUMERIC,
  remaining_20_pct NUMERIC,
  -- Conservation easements (50%)
  limit_50_pct NUMERIC,
  used_50_pct NUMERIC,
  remaining_50_pct NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.tax_year,
    s.agi,
    s.agi_limit_60_pct,
    s.contributed_60_pct,
    s.remaining_capacity_60_pct,
    s.agi_limit_30_pct,
    s.contributed_30_pct,
    s.remaining_capacity_30_pct,
    s.agi_limit_20_pct,
    s.contributed_20_pct,
    s.agi_limit_20_pct - s.contributed_20_pct as remaining_20_pct,
    s.agi_limit_50_pct,
    s.contributed_50_pct,
    s.agi_limit_50_pct - s.contributed_50_pct as remaining_50_pct
  FROM v_portfolio_tax_summary s
  WHERE s.portfolio_id = p_portfolio_id
    AND s.tax_year = p_tax_year;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_donation_capacity(UUID, INTEGER) IS
  'Returns remaining donation capacity for each AGI limit category for a given year';

COMMIT;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- View tax contributions with limits
-- SELECT
--   contribution_date, recipient_name, amount_usd,
--   agi, agi_limit_percentage, agi_limit_amount,
--   deductible_this_year, excess_for_carryforward,
--   within_agi_limit, estimated_tax_savings
-- FROM v_tax_contributions_with_limits
-- WHERE portfolio_id = 'your-uuid'
--   AND tax_year = 2024
-- ORDER BY contribution_date;

-- View portfolio tax summary
-- SELECT * FROM v_portfolio_tax_summary
-- WHERE portfolio_id = 'your-uuid'
--   AND tax_year = 2024;

-- Check donation capacity
-- SELECT * FROM get_donation_capacity('your-uuid'::UUID, 2024);
