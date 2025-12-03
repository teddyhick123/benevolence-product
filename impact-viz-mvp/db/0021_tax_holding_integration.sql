-- Migration 0021: Tax-Holdings Integration (Phase 5)
-- Purpose: Link holdings to tax contributions for auto-population and validation
-- Author: Claude Code
-- Date: 2024-11-24

-- ============================================================================
-- PART 1: ADD HOLDING LINKAGE TO TAX CONTRIBUTIONS
-- ============================================================================

-- Note: holding_id column and index already exist from migration 0013_tax_tracking.sql
-- This migration adds validation functions and views for the existing linkage

-- Add/update comment on existing column
COMMENT ON COLUMN public.tax_contributions.holding_id IS
  'Optional link to a holding record for automatic data population';

-- ============================================================================
-- PART 2: VALIDATION FUNCTION FOR CONSISTENCY
-- Ensures contribution_type matches the linked holding''s asset_type
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
    -- Equity investments should use stock or crypto
    WHEN 'equity_investment' THEN
      IF NEW.contribution_type NOT IN ('stock', 'crypto') THEN
        RAISE EXCEPTION 'Equity investments must use stock or crypto contribution type (holding has asset_type: %)', h_asset_type;
      END IF;

    -- Debt investments should use other_property
    WHEN 'debt_investment' THEN
      IF NEW.contribution_type NOT IN ('other_property', 'cash') THEN
        RAISE EXCEPTION 'Debt investments should use other_property or cash contribution type (holding has asset_type: %)', h_asset_type;
      END IF;

    -- PRIs and MRIs should use other_property
    WHEN 'pri', 'mri' THEN
      IF NEW.contribution_type NOT IN ('other_property') THEN
        RAISE EXCEPTION 'PRI/MRI investments should use other_property contribution type (holding has asset_type: %)', h_asset_type;
      END IF;

    -- Foundation and DAF grants should use cash-based types
    WHEN 'foundation_grant', 'daf_grant' THEN
      IF NEW.contribution_type NOT IN ('cash', 'check', 'wire') THEN
        RAISE EXCEPTION 'Foundation and DAF grants should use cash-based contribution types (holding has asset_type: %)', h_asset_type;
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

-- Create trigger to enforce validation
CREATE TRIGGER validate_tax_contribution_trigger
  BEFORE INSERT OR UPDATE ON public.tax_contributions
  FOR EACH ROW
  EXECUTE FUNCTION validate_tax_contribution_consistency();

COMMENT ON FUNCTION validate_tax_contribution_consistency() IS
  'Validates that contribution_type is appropriate for the linked holding''s asset_type';

-- ============================================================================
-- PART 3: AUTO-POPULATION HELPER FUNCTION
-- Suggests contribution_type based on asset_type
-- ============================================================================

CREATE OR REPLACE FUNCTION suggest_contribution_type_for_asset(p_asset_type TEXT)
RETURNS TEXT AS $$
BEGIN
  RETURN CASE p_asset_type
    WHEN 'equity_investment' THEN 'stock'
    WHEN 'debt_investment' THEN 'other_property'
    WHEN 'pri' THEN 'other_property'
    WHEN 'mri' THEN 'stock'
    WHEN 'foundation_grant' THEN 'cash'
    WHEN 'daf_grant' THEN 'cash'
    WHEN 'donation' THEN 'cash'
    ELSE 'other_property'
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION suggest_contribution_type_for_asset(TEXT) IS
  'Returns the recommended contribution_type for a given asset_type';

-- ============================================================================
-- PART 4: VIEW FOR TAX-LINKED HOLDINGS
-- Shows holdings with their linked tax contributions
-- ============================================================================

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
WHERE h.asset_type IN ('equity_investment', 'debt_investment', 'foundation_grant', 'daf_grant', 'donation');

COMMENT ON VIEW v_holdings_with_tax IS
  'Holdings linked with their tax contribution records for unified view';

-- ============================================================================
-- PART 5: HELPER FUNCTION TO GET TAX-ELIGIBLE HOLDINGS
-- Returns holdings that should have tax records but don''t
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
    AND h.asset_type IN ('equity_investment', 'debt_investment', 'foundation_grant', 'daf_grant', 'donation')
    AND NOT EXISTS (
      SELECT 1 FROM public.tax_contributions tc
      WHERE tc.holding_id = h.id
    )
  ORDER BY h.created_at DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_holdings_missing_tax_records(UUID) IS
  'Returns tax-eligible holdings that don''t have associated tax contribution records';

-- ============================================================================
-- PART 6: UPDATE RLS POLICIES
-- Allow viewing tax contributions through holding relationships
-- ============================================================================

-- Note: Existing tax_contributions RLS policies should already cover access control
-- This is just a verification that users can see tax contributions for their holdings

-- Verify existing policy exists (this is informational, not executable)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tax_contributions'
      AND policyname LIKE '%portfolio%'
  ) THEN
    RAISE NOTICE 'Warning: tax_contributions table may need RLS policies for portfolio access';
  END IF;
END $$;

-- ============================================================================
-- Migration Verification
-- ============================================================================

/*
-- Verify column was added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'tax_contributions'
  AND column_name = 'holding_id';

-- Verify index was created
SELECT indexname FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename = 'tax_contributions'
  AND indexname = 'idx_tax_contributions_holding';

-- Verify function was created
SELECT routine_name FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('validate_tax_contribution_consistency', 'suggest_contribution_type_for_asset', 'get_holdings_missing_tax_records');

-- Verify trigger was created
SELECT trigger_name FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'tax_contributions'
  AND trigger_name = 'validate_tax_contribution_trigger';

-- Test the validation function (should succeed)
-- This would need actual holding and tax contribution data
*/

-- ============================================================================
-- Rollback Instructions
-- ============================================================================

/*
BEGIN;

-- Drop view
DROP VIEW IF EXISTS v_holdings_with_tax;

-- Drop trigger
DROP TRIGGER IF EXISTS validate_tax_contribution_trigger ON public.tax_contributions;

-- Drop functions
DROP FUNCTION IF EXISTS validate_tax_contribution_consistency();
DROP FUNCTION IF EXISTS suggest_contribution_type_for_asset(TEXT);
DROP FUNCTION IF EXISTS get_holdings_missing_tax_records(UUID);

-- Drop index
DROP INDEX IF EXISTS idx_tax_contributions_holding;

-- Drop column
ALTER TABLE public.tax_contributions DROP COLUMN IF EXISTS holding_id;

COMMIT;
*/
