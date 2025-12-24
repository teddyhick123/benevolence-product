-- Migration: Link portfolio_recommendations to global charities database
-- Description: Add optional foreign key to allow linking portfolio recommendations to global charity data
-- Date: 2025-12-21

-- Add charity_id column to portfolio_recommendations (nullable for backward compatibility)
ALTER TABLE portfolio_recommendations
  ADD COLUMN IF NOT EXISTS charity_id UUID REFERENCES charities(id) ON DELETE SET NULL;

-- Create index for joins and lookups
CREATE INDEX IF NOT EXISTS idx_portfolio_recommendations_charity_id
  ON portfolio_recommendations(charity_id);

-- Composite index for common queries (portfolio + charity lookups)
CREATE INDEX IF NOT EXISTS idx_portfolio_recommendations_portfolio_charity
  ON portfolio_recommendations(portfolio_id, charity_id);

-- Add comments
COMMENT ON COLUMN portfolio_recommendations.charity_id IS 'Optional link to global charities table. NULL for custom/unlisted organizations.';

-- Note: Existing portfolio_recommendations will have NULL charity_id
-- A separate backfill script will migrate existing recommendations to global charities where possible
