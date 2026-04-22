-- Migration: Holdings Charity Link
-- Description: Add charity_id FK to holdings table for linking holdings to public charity records
-- Date: 2026-01-30

-- Add charity_id foreign key to holdings table
ALTER TABLE holdings ADD COLUMN IF NOT EXISTS charity_id UUID REFERENCES charities(id) ON DELETE SET NULL;

-- Index for fast joins on charity_id
CREATE INDEX IF NOT EXISTS idx_holdings_charity_id ON holdings(charity_id);

-- Add column comment
COMMENT ON COLUMN holdings.charity_id IS 'FK to charities table for linking to public nonprofit financial data (Form 990, ratings)';
