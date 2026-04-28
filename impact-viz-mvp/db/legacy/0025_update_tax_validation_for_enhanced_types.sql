-- Migration 0025: Update Tax Validation for Enhanced Asset Types
-- Purpose: Update validation trigger and suggestion function for new asset types
-- Author: Claude Code
-- Date: 2024-11-28
-- Related: Migration 0023 (enhanced asset types), Migration 0024 (enhanced tax fields)

BEGIN;

-- ============================================================================
-- 1. Update Validation Function for New Asset Types
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_tax_contribution_consistency()
RETURNS TRIGGER AS $$
DECLARE
  h_asset_type TEXT;
BEGIN
  -- Only validate if holding_id is provided
  IF NEW.holding_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get the asset type of the linked holding
  SELECT asset_type INTO h_asset_type
  FROM public.holdings
  WHERE id = NEW.holding_id;

  -- If holding not found, let foreign key constraint handle it
  IF h_asset_type IS NULL THEN
    RETURN NEW;
  END IF;

  -- Validate consistency between asset_type and contribution_type
  CASE h_asset_type
    -- Public equity investments should use stock or crypto
    WHEN 'equity_investment' THEN
      IF NEW.contribution_type NOT IN ('stock', 'crypto') THEN
        RAISE EXCEPTION 'Public equity investments must use stock or crypto contribution type (holding has asset_type: %)', h_asset_type;
      END IF;

    -- Private equity and VC require other_property (need appraisal)
    WHEN 'private_equity_investment', 'venture_capital_investment' THEN
      IF NEW.contribution_type NOT IN ('other_property') THEN
        RAISE EXCEPTION 'Private equity and VC investments require other_property contribution type (holding has asset_type: %)', h_asset_type;
      END IF;

    -- Debt investments and impact bonds
    WHEN 'debt_investment', 'impact_bond' THEN
      IF NEW.contribution_type NOT IN ('other_property', 'cash') THEN
        RAISE EXCEPTION 'Debt investments and impact bonds should use other_property or cash contribution type (holding has asset_type: %)', h_asset_type;
      END IF;

    -- Conservation investments
    WHEN 'conservation_investment' THEN
      IF NEW.contribution_type NOT IN ('other_property') THEN
        RAISE EXCEPTION 'Conservation investments should use other_property contribution type (holding has asset_type: %)', h_asset_type;
      END IF;

    -- PRIs and MRIs should use other_property
    WHEN 'pri', 'mri' THEN
      IF NEW.contribution_type NOT IN ('other_property') THEN
        RAISE EXCEPTION 'PRI/MRI investments should use other_property contribution type (holding has asset_type: %)', h_asset_type;
      END IF;

    -- Foundation and DAF grants should use cash-based types
    WHEN 'foundation_grant', 'daf_grant' THEN
      IF NEW.contribution_type NOT IN ('cash', 'check', 'wire', 'ach') THEN
        RAISE EXCEPTION 'Foundation and DAF grants should use cash-based contribution types (holding has asset_type: %)', h_asset_type;
      END IF;

    -- Real estate donations must use real_estate
    WHEN 'real_estate_donation' THEN
      IF NEW.contribution_type NOT IN ('real_estate') THEN
        RAISE EXCEPTION 'Real estate donations must use real_estate contribution type (holding has asset_type: %)', h_asset_type;
      END IF;

    -- QCD distributions must use ACH (direct from IRA)
    WHEN 'qcd_distribution' THEN
      IF NEW.contribution_type NOT IN ('ach') THEN
        RAISE EXCEPTION 'QCD distributions must come directly from IRA via ACH (holding has asset_type: %)', h_asset_type;
      END IF;

    -- Cryptocurrency donations must use crypto
    WHEN 'cryptocurrency_donation' THEN
      IF NEW.contribution_type NOT IN ('crypto') THEN
        RAISE EXCEPTION 'Cryptocurrency donations must use crypto contribution type (holding has asset_type: %)', h_asset_type;
      END IF;

    -- Artwork/collectible donations must use art
    WHEN 'artwork_collectible_donation' THEN
      IF NEW.contribution_type NOT IN ('art') THEN
        RAISE EXCEPTION 'Artwork/collectible donations must use art contribution type (holding has asset_type: %)', h_asset_type;
      END IF;

    -- Donations can be any type (stock, crypto, cash, real_estate, etc.)
    WHEN 'donation' THEN
      -- No restriction - donations can be any asset type
      NULL;

    ELSE
      -- For 'other' or unknown types, allow any contribution_type
      NULL;
  END CASE;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION validate_tax_contribution_consistency() IS
  'Validates that contribution_type is appropriate for the linked holding''s asset_type. Updated to support enhanced asset types including private equity, real estate, QCDs, and more.';

-- ============================================================================
-- 2. Update Suggestion Function for New Asset Types
-- ============================================================================

CREATE OR REPLACE FUNCTION suggest_contribution_type_for_asset(p_asset_type TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE p_asset_type
    -- Investment types
    WHEN 'equity_investment' THEN 'stock'
    WHEN 'private_equity_investment' THEN 'other_property'
    WHEN 'venture_capital_investment' THEN 'other_property'
    WHEN 'debt_investment' THEN 'other_property'
    WHEN 'impact_bond' THEN 'other_property'
    WHEN 'conservation_investment' THEN 'other_property'
    WHEN 'pri' THEN 'other_property'
    WHEN 'mri' THEN 'stock'

    -- Grant types
    WHEN 'foundation_grant' THEN 'cash'
    WHEN 'daf_grant' THEN 'cash'

    -- Donation types
    WHEN 'donation' THEN 'cash'
    WHEN 'real_estate_donation' THEN 'real_estate'
    WHEN 'qcd_distribution' THEN 'ach'
    WHEN 'cryptocurrency_donation' THEN 'crypto'
    WHEN 'artwork_collectible_donation' THEN 'art'

    -- Other
    ELSE 'other_property'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION suggest_contribution_type_for_asset(TEXT) IS
  'Returns the recommended contribution_type for a given asset_type. Updated to support enhanced asset types.';

-- ============================================================================
-- 3. Update View to Include All Tax-Deductible Asset Types
-- ============================================================================

-- Drop the existing view first to avoid column name conflicts
DROP VIEW IF EXISTS v_holdings_with_tax;

-- Create fresh view with enhanced fields
CREATE VIEW v_holdings_with_tax AS
SELECT
  h.id as holding_id,
  h.portfolio_id,
  h.name as holding_name,
  h.asset_type,
  h.asset_subtype,
  h.funds_allocated,
  h.sector,
  h.country,
  h.status,

  -- Tax contribution info
  tc.id as tax_contribution_id,
  tc.contribution_type,
  tc.amount_usd,
  tc.cost_basis,
  tc.fmv_at_donation,
  tc.contribution_date,
  tc.recipient_name,
  tc.tax_year,
  tc.applied_to_tax_year,
  tc.deductible_amount,

  -- Enhanced tax fields (newly added)
  tc.carryforward_eligible,
  tc.carryforward_years,
  tc.agi_limit_percentage,
  tc.qcd_qualified,
  tc.conservation_easement,
  tc.related_use_qualified,

  -- Calculated fields
  CASE
    WHEN tc.id IS NOT NULL THEN true
    ELSE false
  END as has_tax_record,

  CASE
    WHEN tc.cost_basis IS NOT NULL AND tc.fmv_at_donation IS NOT NULL
    THEN tc.fmv_at_donation - tc.cost_basis
    ELSE NULL
  END as capital_gains_avoided

FROM public.holdings h
LEFT JOIN public.tax_contributions tc ON h.id = tc.holding_id
WHERE h.asset_type IN (
  -- All investment types (potentially donated)
  'equity_investment', 'private_equity_investment', 'venture_capital_investment',
  'debt_investment', 'impact_bond', 'conservation_investment',
  -- Grant types
  'foundation_grant', 'daf_grant',
  -- Donation types
  'donation', 'real_estate_donation', 'qcd_distribution',
  'cryptocurrency_donation', 'artwork_collectible_donation'
);

COMMENT ON VIEW v_holdings_with_tax IS
  'Holdings linked with their tax contribution records for unified view. Includes all tax-deductible asset types.';

-- ============================================================================
-- 4. Update Helper Function to Include All Tax-Eligible Types
-- ============================================================================

CREATE OR REPLACE FUNCTION get_holdings_missing_tax_records(p_portfolio_id UUID)
RETURNS TABLE (
  holding_id UUID,
  holding_name TEXT,
  asset_type TEXT,
  funds_allocated NUMERIC,
  suggested_contribution_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    h.id,
    h.name,
    h.asset_type::TEXT,
    h.funds_allocated,
    suggest_contribution_type_for_asset(h.asset_type)
  FROM public.holdings h
  WHERE h.portfolio_id = p_portfolio_id
    AND h.asset_type IN (
      -- Investment types
      'equity_investment', 'private_equity_investment', 'venture_capital_investment',
      'debt_investment', 'impact_bond', 'conservation_investment',
      -- Grant types
      'foundation_grant', 'daf_grant',
      -- Donation types
      'donation', 'real_estate_donation', 'qcd_distribution',
      'cryptocurrency_donation', 'artwork_collectible_donation'
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.tax_contributions tc
      WHERE tc.holding_id = h.id
    )
  ORDER BY h.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_holdings_missing_tax_records(UUID) IS
  'Returns tax-eligible holdings that don''t have associated tax contribution records. Updated to include all enhanced asset types.';

COMMIT;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Verify functions were updated
-- SELECT routine_name, routine_definition
-- FROM information_schema.routines
-- WHERE routine_schema = 'public'
--   AND routine_name IN ('validate_tax_contribution_consistency', 'suggest_contribution_type_for_asset');

-- Test suggestion function with new types
-- SELECT
--   unnest(ARRAY[
--     'equity_investment', 'private_equity_investment', 'venture_capital_investment',
--     'real_estate_donation', 'qcd_distribution', 'cryptocurrency_donation',
--     'artwork_collectible_donation'
--   ]) as asset_type,
--   suggest_contribution_type_for_asset(unnest(ARRAY[
--     'equity_investment', 'private_equity_investment', 'venture_capital_investment',
--     'real_estate_donation', 'qcd_distribution', 'cryptocurrency_donation',
--     'artwork_collectible_donation'
--   ])) as suggested_contribution_type;
