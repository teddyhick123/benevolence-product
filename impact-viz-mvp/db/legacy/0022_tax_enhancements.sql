-- Migration: Tax Field Enhancements
-- Date: 2025-11-30
-- Description: Add qcd_qualified field to tax_contributions table
--
-- QCD (Qualified Charitable Distribution):
-- - Available to donors age 70½ or older
-- - Direct IRA-to-charity transfers
-- - Counts toward Required Minimum Distribution (RMD)
-- - Excluded from taxable income (better than standard deduction)
-- - Annual limit: $100,000 per individual

-- Add QCD tracking field
ALTER TABLE tax_contributions
ADD COLUMN IF NOT EXISTS qcd_qualified BOOLEAN DEFAULT FALSE;

-- Add helpful comment
COMMENT ON COLUMN tax_contributions.qcd_qualified IS
  'Qualified Charitable Distribution: IRA distribution to charity (age 70½+, up to $100k/year)';

-- Add partial index for efficient QCD queries
-- Only indexes rows where qcd_qualified = true (saves space)
CREATE INDEX IF NOT EXISTS idx_tax_contributions_qcd
  ON tax_contributions(portfolio_id, tax_year)
  WHERE qcd_qualified = true;

-- Verify the column was added
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'tax_contributions'
      AND column_name = 'qcd_qualified'
  ) THEN
    RAISE NOTICE 'SUCCESS: qcd_qualified column added to tax_contributions';
  ELSE
    RAISE EXCEPTION 'FAILED: qcd_qualified column was not added';
  END IF;
END $$;
