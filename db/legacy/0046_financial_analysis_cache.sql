-- Migration: Financial Analysis Cache
-- Description: Store AI-generated financial analyses for holdings' linked charities
-- Date: 2026-01-30

CREATE TABLE IF NOT EXISTS generated_financial_analyses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id UUID NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  charity_id UUID NOT NULL REFERENCES charities(id) ON DELETE CASCADE,
  analysis_content TEXT NOT NULL,
  financial_snapshot JSONB NOT NULL,  -- Revenue, expenses, assets, filings at generation time
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  version INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookup by holding
CREATE INDEX IF NOT EXISTS idx_financial_analyses_holding
  ON generated_financial_analyses(holding_id);

-- Index for fetching latest version
CREATE INDEX IF NOT EXISTS idx_financial_analyses_holding_version
  ON generated_financial_analyses(holding_id, version DESC);

-- Enable Row Level Security
ALTER TABLE generated_financial_analyses ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view analyses for holdings in their portfolios
CREATE POLICY "Users can view financial analyses for their portfolio holdings"
  ON generated_financial_analyses FOR SELECT
  USING (
    holding_id IN (
      SELECT h.id FROM holdings h
      JOIN portfolio_members pm ON pm.portfolio_id = h.portfolio_id
      WHERE pm.user_id = auth.uid()
    )
  );

-- Policy: Users can insert analyses for holdings in their portfolios
CREATE POLICY "Users can insert financial analyses for their portfolio holdings"
  ON generated_financial_analyses FOR INSERT
  WITH CHECK (
    holding_id IN (
      SELECT h.id FROM holdings h
      JOIN portfolio_members pm ON pm.portfolio_id = h.portfolio_id
      WHERE pm.user_id = auth.uid()
    )
  );

-- Policy: Service role has full access
CREATE POLICY "Service role has full access to financial analyses"
  ON generated_financial_analyses FOR ALL
  USING (auth.role() = 'service_role');

-- Documentation
COMMENT ON TABLE generated_financial_analyses IS 'Cached AI-generated financial analyses for nonprofit holdings, based on Form 990 and rating data';
COMMENT ON COLUMN generated_financial_analyses.financial_snapshot IS 'JSONB snapshot of charity financials, ratings, and filings at generation time';
COMMENT ON COLUMN generated_financial_analyses.version IS 'Incremental version number for tracking regenerations';
