-- Migration 0024: Enhanced Tax Tracking Fields
-- Purpose: Add fields for sophisticated tax planning (appraisal, carryforward, UBIT, etc.)
-- Author: Claude Code
-- Date: 2024-11-28
-- Related: TAX_ENHANCEMENT_ANALYSIS.md - Phase 2 Implementation

BEGIN;

-- ============================================================================
-- 1. Add Enhanced Tax Planning Fields to tax_contributions
-- ============================================================================

-- Carryforward tracking (complementary to existing carryforwards table)
ALTER TABLE public.tax_contributions
  ADD COLUMN IF NOT EXISTS carryforward_eligible BOOLEAN DEFAULT false;

ALTER TABLE public.tax_contributions
  ADD COLUMN IF NOT EXISTS carryforward_years INTEGER CHECK (carryforward_years >= 0 AND carryforward_years <= 15);

COMMENT ON COLUMN public.tax_contributions.carryforward_eligible IS
  'Whether this contribution is eligible for multi-year carryforward if AGI limits exceeded';

COMMENT ON COLUMN public.tax_contributions.carryforward_years IS
  'Number of years eligible for carryforward (typically 5 for most contributions, up to 15 for conservation easements)';

-- AGI limit percentage (more flexible than category-based approach)
ALTER TABLE public.tax_contributions
  ADD COLUMN IF NOT EXISTS agi_limit_percentage NUMERIC CHECK (agi_limit_percentage > 0 AND agi_limit_percentage <= 100);

COMMENT ON COLUMN public.tax_contributions.agi_limit_percentage IS
  'Percentage of AGI that limits this deduction (e.g., 30 for appreciated property, 50 for cash to public charity, 60 for cash overall)';

-- UBIT concerns for investments
ALTER TABLE public.tax_contributions
  ADD COLUMN IF NOT EXISTS ubit_concerns TEXT;

COMMENT ON COLUMN public.tax_contributions.ubit_concerns IS
  'Unrelated Business Income Tax concerns or notes. Important for private equity, business interests, or debt-financed property donations.';

-- Related-use qualification (critical for artwork/collectibles)
ALTER TABLE public.tax_contributions
  ADD COLUMN IF NOT EXISTS related_use_qualified BOOLEAN;

COMMENT ON COLUMN public.tax_contributions.related_use_qualified IS
  'For artwork/collectibles: whether donation qualifies for related-use rule (use is related to charity''s exempt purpose). Affects deduction: related-use allows FMV deduction, unrelated use limits to cost basis.';

-- Long-term capital gains qualification
ALTER TABLE public.tax_contributions
  ADD COLUMN IF NOT EXISTS holding_period_ltcg BOOLEAN;

COMMENT ON COLUMN public.tax_contributions.holding_period_ltcg IS
  'Whether asset was held >1 year qualifying for long-term capital gains treatment. Critical for determining deduction limits.';

-- ============================================================================
-- 2. Add Asset-Specific Tax Metadata Fields
-- ============================================================================

-- Private equity / VC specific tracking
ALTER TABLE public.tax_contributions
  ADD COLUMN IF NOT EXISTS requires_qualified_appraisal BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.tax_contributions.requires_qualified_appraisal IS
  'Whether this contribution requires a qualified appraisal under IRS rules (typically property >$5,000, always for private equity/VC/real estate >$10,000)';

-- Conservation easement specific
ALTER TABLE public.tax_contributions
  ADD COLUMN IF NOT EXISTS conservation_easement BOOLEAN DEFAULT false;

ALTER TABLE public.tax_contributions
  ADD COLUMN IF NOT EXISTS conservation_enhanced_deduction BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.tax_contributions.conservation_easement IS
  'Whether this is a qualified conservation easement donation';

COMMENT ON COLUMN public.tax_contributions.conservation_enhanced_deduction IS
  'Whether this conservation easement qualifies for enhanced 50% AGI limit (vs standard 30% for appreciated property)';

-- QCD specific tracking
ALTER TABLE public.tax_contributions
  ADD COLUMN IF NOT EXISTS qcd_qualified BOOLEAN DEFAULT false;

ALTER TABLE public.tax_contributions
  ADD COLUMN IF NOT EXISTS qcd_counts_toward_rmd BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.tax_contributions.qcd_qualified IS
  'Whether this qualifies as a Qualified Charitable Distribution from IRA (age 70.5+, direct to charity, max $100k/year)';

COMMENT ON COLUMN public.tax_contributions.qcd_counts_toward_rmd IS
  'Whether this QCD counts toward Required Minimum Distribution. QCDs are excluded from income (better than deduction).';

-- Form 8283 tracking (for non-cash contributions >$500)
ALTER TABLE public.tax_contributions
  ADD COLUMN IF NOT EXISTS form_8283_required BOOLEAN DEFAULT false;

ALTER TABLE public.tax_contributions
  ADD COLUMN IF NOT EXISTS form_8283_section TEXT CHECK (form_8283_section IN ('A', 'B'));

COMMENT ON COLUMN public.tax_contributions.form_8283_required IS
  'Whether IRS Form 8283 is required (non-cash donations >$500)';

COMMENT ON COLUMN public.tax_contributions.form_8283_section IS
  'Section A for contributions $500-$5,000; Section B for contributions >$5,000 requiring qualified appraisal';

-- ============================================================================
-- 3. Update Existing contribution_type Check Constraint
-- ============================================================================

-- Drop old constraint
ALTER TABLE public.tax_contributions
  DROP CONSTRAINT IF EXISTS tax_contributions_contribution_type_check;

-- Add new constraint with additional types
ALTER TABLE public.tax_contributions
  ADD CONSTRAINT tax_contributions_contribution_type_check
  CHECK (contribution_type IN (
    'cash',
    'check',
    'wire',
    'ach',
    'stock',
    'crypto',
    'other_property',
    'real_estate',
    'vehicle',
    'art',
    'other'
  ));

-- ============================================================================
-- 4. Add Helpful Indexes
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_tax_contributions_carryforward
  ON public.tax_contributions(portfolio_id, tax_year)
  WHERE carryforward_eligible = true;

CREATE INDEX IF NOT EXISTS idx_tax_contributions_qcd
  ON public.tax_contributions(portfolio_id, tax_year)
  WHERE qcd_qualified = true;

CREATE INDEX IF NOT EXISTS idx_tax_contributions_conservation
  ON public.tax_contributions(portfolio_id, tax_year)
  WHERE conservation_easement = true;

-- ============================================================================
-- 5. Update the updated_at trigger to include new fields
-- ============================================================================

-- Trigger should already exist from 0013_tax_tracking.sql
-- No changes needed - it updates updated_at on any UPDATE to the table

COMMIT;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- Check new columns exist
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'tax_contributions'
--   AND column_name IN (
--     'carryforward_eligible', 'carryforward_years', 'agi_limit_percentage',
--     'ubit_concerns', 'related_use_qualified', 'holding_period_ltcg',
--     'qcd_qualified', 'conservation_easement', 'form_8283_required'
--   )
-- ORDER BY column_name;

-- Check contribution_type constraint updated
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conname = 'tax_contributions_contribution_type_check';
