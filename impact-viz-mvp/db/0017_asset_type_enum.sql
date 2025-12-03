-- Migration 0017: Convert asset_class to asset_type with enum
-- Purpose: Establish formal asset type taxonomy for multi-asset portfolio management
-- Author: Claude Code
-- Date: 2024-11-24

-- Create asset type enumeration
CREATE TYPE asset_type_enum AS ENUM (
  'equity_investment',      -- Stocks, VC, PE investments
  'debt_investment',        -- Bonds, notes, loans
  'pri',                    -- Program Related Investment (IRS qualified)
  'mri',                    -- Mission Related Investment
  'foundation_grant',       -- Direct foundation grant
  'daf_grant',              -- Donor Advised Fund grant
  'donation',               -- Charitable contribution
  'other'                   -- Uncategorized
);

-- Step 1: Rename existing column to temporary name
ALTER TABLE public.holdings
  RENAME COLUMN asset_class TO asset_type_text;

-- Step 2: Add new typed column (nullable initially for migration)
ALTER TABLE public.holdings
  ADD COLUMN asset_type asset_type_enum;

-- Step 3: Migrate existing data with intelligent pattern matching
UPDATE public.holdings
SET asset_type =
  CASE
    -- Grant patterns
    WHEN LOWER(asset_type_text) LIKE '%grant%' THEN 'foundation_grant'::asset_type_enum
    WHEN LOWER(asset_type_text) LIKE '%daf%' THEN 'daf_grant'::asset_type_enum

    -- Donation patterns
    WHEN LOWER(asset_type_text) LIKE '%donation%' THEN 'donation'::asset_type_enum
    WHEN LOWER(asset_type_text) LIKE '%gift%' THEN 'donation'::asset_type_enum

    -- Equity patterns
    WHEN LOWER(asset_type_text) LIKE '%equity%' THEN 'equity_investment'::asset_type_enum
    WHEN LOWER(asset_type_text) LIKE '%stock%' THEN 'equity_investment'::asset_type_enum
    WHEN LOWER(asset_type_text) LIKE '%venture%' THEN 'equity_investment'::asset_type_enum
    WHEN LOWER(asset_type_text) LIKE '%private equity%' THEN 'equity_investment'::asset_type_enum
    WHEN LOWER(asset_type_text) LIKE '%pe%' THEN 'equity_investment'::asset_type_enum
    WHEN LOWER(asset_type_text) LIKE '%vc%' THEN 'equity_investment'::asset_type_enum

    -- Debt patterns
    WHEN LOWER(asset_type_text) LIKE '%debt%' THEN 'debt_investment'::asset_type_enum
    WHEN LOWER(asset_type_text) LIKE '%bond%' THEN 'debt_investment'::asset_type_enum
    WHEN LOWER(asset_type_text) LIKE '%note%' THEN 'debt_investment'::asset_type_enum
    WHEN LOWER(asset_type_text) LIKE '%loan%' THEN 'debt_investment'::asset_type_enum

    -- PRI/MRI patterns
    WHEN LOWER(asset_type_text) LIKE '%pri%' THEN 'pri'::asset_type_enum
    WHEN LOWER(asset_type_text) LIKE '%program related%' THEN 'pri'::asset_type_enum
    WHEN LOWER(asset_type_text) LIKE '%mri%' THEN 'mri'::asset_type_enum
    WHEN LOWER(asset_type_text) LIKE '%mission related%' THEN 'mri'::asset_type_enum

    -- Default to 'other' for unmatched patterns
    ELSE 'other'::asset_type_enum
  END
WHERE asset_type_text IS NOT NULL;

-- Step 4: Set default for NULL values
UPDATE public.holdings
SET asset_type = 'other'::asset_type_enum
WHERE asset_type IS NULL;

-- Step 5: Add asset_subtype for detailed classification (optional free text)
ALTER TABLE public.holdings
  ADD COLUMN asset_subtype TEXT;

COMMENT ON COLUMN public.holdings.asset_subtype IS
  'Free-form subclassification. Examples: "Public Stock", "Venture Capital", "General Operating Grant", etc.';

-- Step 6: Migrate detailed classification to asset_subtype
UPDATE public.holdings
SET asset_subtype = asset_type_text
WHERE asset_type_text IS NOT NULL
  AND asset_type_text != ''
  AND asset_type = 'other'::asset_type_enum;

-- Step 7: Drop old text column
ALTER TABLE public.holdings
  DROP COLUMN asset_type_text;

-- Step 8: Make asset_type non-nullable with default
ALTER TABLE public.holdings
  ALTER COLUMN asset_type SET DEFAULT 'other'::asset_type_enum,
  ALTER COLUMN asset_type SET NOT NULL;

-- Step 9: Add index for efficient filtering
CREATE INDEX idx_holdings_asset_type ON public.holdings(asset_type);

-- Step 10: Add helpful comments
COMMENT ON TYPE asset_type_enum IS
  'Formal taxonomy for different asset classes in portfolio management';

COMMENT ON COLUMN public.holdings.asset_type IS
  'Primary asset classification: investment vs grant vs donation';

-- Step 11: Update RLS policies if needed (they should work with renamed column)
-- No changes needed - RLS policies operate on portfolio_id, not asset_class

-- Migration verification query
-- Run this after migration to verify data distribution:
-- SELECT asset_type, COUNT(*),
--        ARRAY_AGG(DISTINCT asset_subtype) FILTER (WHERE asset_subtype IS NOT NULL) as subtypes
-- FROM holdings
-- GROUP BY asset_type
-- ORDER BY COUNT(*) DESC;

-- Rollback instructions (if needed):
/*
BEGIN;

-- Recreate text column
ALTER TABLE public.holdings ADD COLUMN asset_class TEXT;

-- Copy enum back to text
UPDATE public.holdings SET asset_class = asset_type::TEXT;

-- Drop enum column and type
ALTER TABLE public.holdings DROP COLUMN asset_type;
ALTER TABLE public.holdings DROP COLUMN asset_subtype;
DROP INDEX idx_holdings_asset_type;
DROP TYPE asset_type_enum;

-- Rename back
ALTER TABLE public.holdings RENAME COLUMN asset_class TO asset_class;

COMMIT;
*/
