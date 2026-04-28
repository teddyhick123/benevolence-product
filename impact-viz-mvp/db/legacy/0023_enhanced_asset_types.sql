-- Migration 0023: Add Enhanced Asset Types for Tax Optimization
-- Purpose: Add private equity, venture capital, and real estate donation types
-- Author: Claude Code
-- Date: 2024-11-28
-- Related: TAX_ENHANCEMENT_ANALYSIS.md - Phase 1 "Big 3" Implementation

-- Add new asset type enum values
-- Note: ALTER TYPE ... ADD VALUE cannot be executed inside a transaction block
-- These must be run separately

-- High-priority philanthropic asset types
ALTER TYPE asset_type_enum ADD VALUE IF NOT EXISTS 'private_equity_investment';
ALTER TYPE asset_type_enum ADD VALUE IF NOT EXISTS 'venture_capital_investment';
ALTER TYPE asset_type_enum ADD VALUE IF NOT EXISTS 'real_estate_donation';

-- Medium-priority impact investing types
ALTER TYPE asset_type_enum ADD VALUE IF NOT EXISTS 'impact_bond';
ALTER TYPE asset_type_enum ADD VALUE IF NOT EXISTS 'conservation_investment';

-- Additional donation types for tax planning
ALTER TYPE asset_type_enum ADD VALUE IF NOT EXISTS 'qcd_distribution';
ALTER TYPE asset_type_enum ADD VALUE IF NOT EXISTS 'cryptocurrency_donation';
ALTER TYPE asset_type_enum ADD VALUE IF NOT EXISTS 'artwork_collectible_donation';

-- Comments for each new type
COMMENT ON TYPE asset_type_enum IS
  'Formal taxonomy for different asset classes in portfolio management.

  Investment Types:
  - equity_investment: Public stocks
  - private_equity_investment: Private equity funds, PE investments
  - venture_capital_investment: VC funds, startup investments
  - debt_investment: Bonds, notes, loans
  - impact_bond: Social/Green/Development Impact Bonds
  - conservation_investment: Forest carbon credits, wetland banking, habitat restoration
  - pri: Program Related Investment (IRS qualified, below-market rate)
  - mri: Mission Related Investment (market rate)

  Grant Types:
  - foundation_grant: Direct foundation grantmaking
  - daf_grant: Donor Advised Fund grant recommendation

  Donation Types:
  - donation: General charitable contribution (can be stock, cash, crypto, etc.)
  - real_estate_donation: Donated property, conservation easements
  - qcd_distribution: Qualified Charitable Distribution from IRA (age 70.5+)
  - cryptocurrency_donation: Bitcoin, Ethereum, other digital assets
  - artwork_collectible_donation: Art, collectibles (requires related-use qualification)

  Other:
  - other: Uncategorized or hybrid structures';

-- Migration verification query
-- Run this after migration to see available asset types:
-- SELECT enumlabel as asset_type
-- FROM pg_enum
-- WHERE enumtypid = 'asset_type_enum'::regtype
-- ORDER BY enumsortorder;

-- Expected output:
/*
asset_type
---------------------------
equity_investment
debt_investment
pri
mri
foundation_grant
daf_grant
donation
other
private_equity_investment
venture_capital_investment
real_estate_donation
impact_bond
conservation_investment
qcd_distribution
cryptocurrency_donation
artwork_collectible_donation
*/
