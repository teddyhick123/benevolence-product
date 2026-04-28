-- Migration 0022: Create v_holdings View
-- Purpose: Provide a stable view interface for holdings queries
-- Author: Claude Code
-- Date: 2024-11-25

-- ============================================================================
-- CREATE V_HOLDINGS VIEW
-- Provides a clean, stable interface for querying holdings with all fields
-- ============================================================================

CREATE OR REPLACE VIEW v_holdings AS
SELECT
  h.id,
  h.portfolio_id,
  h.investee_id,
  h.name,
  h.status,
  h.asset_type,
  h.asset_subtype,
  h.funds_allocated,
  h.as_of,
  h.sector,
  h.country,
  h.custodian,
  h.valuation_method,
  h.description,
  h.primary_contact_name,
  h.primary_contact_email,
  h.location_city,
  h.location_state,
  h.location_country,
  h.theory_of_action,
  h.cost_per_outcome,
  h.cost_per_outcome_unit,
  h.metadata,
  h.created_at,
  h.updated_at
FROM public.holdings h;

COMMENT ON VIEW v_holdings IS
  'Stable view interface for querying holdings with all standard fields';

-- ============================================================================
-- Migration Verification
-- ============================================================================

/*
-- Verify view was created
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'v_holdings';

-- Test the view
SELECT id, name, asset_type, funds_allocated
FROM v_holdings
LIMIT 5;
*/

-- ============================================================================
-- Rollback Instructions
-- ============================================================================

/*
BEGIN;

DROP VIEW IF EXISTS v_holdings;

COMMIT;
*/
