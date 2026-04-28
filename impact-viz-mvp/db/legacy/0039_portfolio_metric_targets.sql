-- ============================================================================
-- Migration 0039: Create portfolio_metric_targets Table
-- ============================================================================
-- Purpose: Replace kpi_definitions with cleaner, single-purpose table
--
-- Design Decision:
--   - Metrics auto-display if they have data in metric_facts
--   - Targets are OPTIONAL overlays for goal-tracking
--   - Display names can override metrics.name per-portfolio
--
-- Benefits:
--   - Simpler data model (targets are separate concern)
--   - No orphaned metrics (all metrics with data show automatically)
--   - Targets remain queryable & normalized (not JSONB)
-- ============================================================================

BEGIN;

-- Create portfolio_metric_targets table
CREATE TABLE IF NOT EXISTS public.portfolio_metric_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  metric_code TEXT NOT NULL REFERENCES public.metrics(code) ON DELETE CASCADE,

  -- Target tracking
  target_value NUMERIC,
  target_date DATE,

  -- Optional customization
  display_name TEXT,  -- Override metrics.name for this portfolio
  notes TEXT,         -- Context about this target

  -- Metadata
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Constraints
  CONSTRAINT portfolio_metric_targets_unique UNIQUE(portfolio_id, metric_code),
  CONSTRAINT target_date_future CHECK (target_date IS NULL OR target_date >= CURRENT_DATE)
);

-- Indexes for common queries
CREATE INDEX idx_portfolio_metric_targets_portfolio
  ON public.portfolio_metric_targets(portfolio_id);

CREATE INDEX idx_portfolio_metric_targets_metric
  ON public.portfolio_metric_targets(metric_code);

CREATE INDEX idx_portfolio_metric_targets_target_date
  ON public.portfolio_metric_targets(target_date)
  WHERE target_date IS NOT NULL;

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_portfolio_metric_targets_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER portfolio_metric_targets_updated_at
  BEFORE UPDATE ON public.portfolio_metric_targets
  FOR EACH ROW
  EXECUTE FUNCTION update_portfolio_metric_targets_timestamp();

-- RLS Policies (match existing portfolio access patterns)
ALTER TABLE public.portfolio_metric_targets ENABLE ROW LEVEL SECURITY;

-- Users can view targets for portfolios they have access to
CREATE POLICY "Users can view portfolio metric targets"
  ON public.portfolio_metric_targets
  FOR SELECT
  USING (
    portfolio_id IN (
      SELECT portfolio_id
      FROM public.portfolio_members
      WHERE user_id = auth.uid()
    )
  );

-- Users can manage targets for portfolios they can edit
CREATE POLICY "Users can manage portfolio metric targets"
  ON public.portfolio_metric_targets
  FOR ALL
  USING (
    portfolio_id IN (
      SELECT portfolio_id
      FROM public.portfolio_members
      WHERE user_id = auth.uid()
        AND role IN ('owner', 'editor')
    )
  );

-- Grant permissions
GRANT SELECT ON public.portfolio_metric_targets TO authenticated;
GRANT SELECT ON public.portfolio_metric_targets TO anon;

COMMIT;

-- ============================================================================
-- NOTES
-- ============================================================================
-- Next steps:
--   1. Run 0040_migrate_kpi_definitions_data.sql to copy existing data
--   2. Run 0041_update_kpi_views.sql to update views
--   3. Run 0042_drop_kpi_definitions.sql to remove old table
--
-- Breaking changes:
--   - order_index removed (UI can sort by metric_code or display_name)
--   - calculation field removed (was unused)
--   - unit removed (use metrics.unit instead)
--
-- Migration safety:
--   - kpi_definitions table remains untouched (can rollback)
--   - Views will be updated in separate migration
-- ============================================================================
