-- Migration: Generated Letters Cache
-- Description: Store AI-generated portfolio letters to avoid regeneration on every page visit
-- Date: 2026-01-22

-- Table to store generated letters
CREATE TABLE IF NOT EXISTS generated_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  letter_content TEXT NOT NULL,
  summary_data JSONB NOT NULL,  -- Store portfolio summary, kpis, holdings snapshot
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by portfolio (most common query pattern)
CREATE INDEX IF NOT EXISTS idx_generated_letters_portfolio
  ON generated_letters(portfolio_id);

-- Index for fetching latest version
CREATE INDEX IF NOT EXISTS idx_generated_letters_portfolio_version
  ON generated_letters(portfolio_id, version DESC);

-- Enable Row Level Security
ALTER TABLE generated_letters ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view letters for portfolios they have access to
CREATE POLICY "Users can view letters for their portfolios"
  ON generated_letters FOR SELECT
  USING (
    portfolio_id IN (
      SELECT portfolio_id FROM portfolio_members WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can insert letters for portfolios they have access to
CREATE POLICY "Users can insert letters for their portfolios"
  ON generated_letters FOR INSERT
  WITH CHECK (
    portfolio_id IN (
      SELECT portfolio_id FROM portfolio_members WHERE user_id = auth.uid()
    )
  );

-- Policy: Users can update letters for portfolios they have access to
CREATE POLICY "Users can update letters for their portfolios"
  ON generated_letters FOR UPDATE
  USING (
    portfolio_id IN (
      SELECT portfolio_id FROM portfolio_members WHERE user_id = auth.uid()
    )
  );

-- Policy: Service role has full access (for API operations)
CREATE POLICY "Service role has full access to generated_letters"
  ON generated_letters FOR ALL
  USING (auth.role() = 'service_role');

-- Add table comment for documentation
COMMENT ON TABLE generated_letters IS 'Cached AI-generated portfolio letters to reduce API calls and provide consistent content';
COMMENT ON COLUMN generated_letters.summary_data IS 'JSONB snapshot of portfolio, summary stats, KPIs, and holdings at generation time';
COMMENT ON COLUMN generated_letters.version IS 'Incremental version number for tracking regenerations';
