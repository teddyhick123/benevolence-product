-- Migration: Report Templates for Custom AI Reports
-- Part of Phase 1: Enhanced Reporting

-- Create report_templates table for storing reusable report configurations
CREATE TABLE IF NOT EXISTS report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('holding', 'portfolio', 'sector')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE report_templates IS 'Stores reusable report configurations for the AI portfolio manager';
COMMENT ON COLUMN report_templates.scope IS 'Report scope: holding (single holding), portfolio (entire portfolio), or sector (sector-based analysis)';
COMMENT ON COLUMN report_templates.config IS 'JSON configuration including: metric_codes, chart_preferences, include_sections, time_range';

-- Create index for portfolio lookups
CREATE INDEX IF NOT EXISTS idx_report_templates_portfolio_id ON report_templates(portfolio_id);

-- Create index for default template lookups
CREATE INDEX IF NOT EXISTS idx_report_templates_default ON report_templates(portfolio_id, scope) WHERE is_default = true;

-- Enable RLS
ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Portfolio members can manage their templates
CREATE POLICY "Portfolio members can view report templates"
  ON report_templates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM portfolio_members pm
      WHERE pm.portfolio_id = report_templates.portfolio_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Portfolio members can create report templates"
  ON report_templates FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM portfolio_members pm
      WHERE pm.portfolio_id = report_templates.portfolio_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Portfolio members can update report templates"
  ON report_templates FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM portfolio_members pm
      WHERE pm.portfolio_id = report_templates.portfolio_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Portfolio members can delete report templates"
  ON report_templates FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM portfolio_members pm
      WHERE pm.portfolio_id = report_templates.portfolio_id
        AND pm.user_id = auth.uid()
    )
  );

-- Function to ensure only one default template per scope per portfolio
CREATE OR REPLACE FUNCTION enforce_single_default_template()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE report_templates
    SET is_default = false
    WHERE portfolio_id = NEW.portfolio_id
      AND scope = NEW.scope
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to enforce single default
DROP TRIGGER IF EXISTS trg_enforce_single_default_template ON report_templates;
CREATE TRIGGER trg_enforce_single_default_template
  BEFORE INSERT OR UPDATE ON report_templates
  FOR EACH ROW
  EXECUTE FUNCTION enforce_single_default_template();

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_report_templates_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_report_templates_updated_at ON report_templates;
CREATE TRIGGER trg_report_templates_updated_at
  BEFORE UPDATE ON report_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_report_templates_updated_at();
