-- Migration 0019: Grant Management - Details, Milestones, and Reports
-- Purpose: Add grant-specific tracking for foundations and DAF grants
-- Author: Claude Code
-- Date: 2024-11-24

-- ============================================================================
-- PART 1: GRANT DETAILS TABLE
-- Store grant-specific information for foundation_grant and daf_grant holdings
-- ============================================================================

-- Grant type enumeration
CREATE TYPE grant_type_enum AS ENUM (
  'general_operating',   -- Unrestricted general operating support
  'project',             -- Project-specific grant
  'capacity_building',   -- Organizational capacity building
  'multi_year',          -- Multi-year commitment
  'seed',                -- Seed funding
  'planning'             -- Planning grant
);

CREATE TABLE public.grant_details (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  holding_id UUID NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  grant_period_start DATE,
  grant_period_end DATE,
  grant_type grant_type_enum,
  renewal_eligible BOOLEAN DEFAULT false,
  renewal_date DATE,
  deliverables TEXT,
  reporting_frequency TEXT, -- 'monthly', 'quarterly', 'annual', 'final'
  next_report_due DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Only one grant_details record per holding
  UNIQUE(holding_id)
);

-- Indexes
CREATE INDEX idx_grant_details_holding ON public.grant_details(holding_id);
CREATE INDEX idx_grant_details_next_report ON public.grant_details(next_report_due) WHERE next_report_due IS NOT NULL;
CREATE INDEX idx_grant_details_renewal ON public.grant_details(renewal_date) WHERE renewal_eligible = true;

-- Comments
COMMENT ON TABLE public.grant_details IS
  'Grant-specific details for foundation and DAF grants';

COMMENT ON COLUMN public.grant_details.reporting_frequency IS
  'Expected reporting cadence: monthly, quarterly, annual, or final';

COMMENT ON COLUMN public.grant_details.next_report_due IS
  'Next scheduled report due date for tracking compliance';

-- ============================================================================
-- PART 2: GRANT MILESTONES TABLE
-- Track deliverables and milestones for grant projects
-- ============================================================================

-- Milestone status enumeration
CREATE TYPE milestone_status_enum AS ENUM (
  'pending',       -- Not yet started
  'in_progress',   -- Currently working on
  'completed',     -- Successfully completed
  'overdue',       -- Past due date
  'cancelled'      -- No longer applicable
);

CREATE TABLE public.grant_milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grant_id UUID NOT NULL REFERENCES public.grant_details(id) ON DELETE CASCADE,
  milestone_name TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  completed_date DATE,
  status milestone_status_enum DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure completed_date is set when status is completed
  CONSTRAINT milestone_completed_date_check CHECK (
    (status = 'completed' AND completed_date IS NOT NULL) OR
    (status != 'completed')
  )
);

-- Indexes
CREATE INDEX idx_milestones_grant ON public.grant_milestones(grant_id);
CREATE INDEX idx_milestones_status ON public.grant_milestones(status);
CREATE INDEX idx_milestones_due ON public.grant_milestones(due_date) WHERE due_date IS NOT NULL;

-- Comments
COMMENT ON TABLE public.grant_milestones IS
  'Deliverables and milestones for grant-funded projects';

COMMENT ON CONSTRAINT milestone_completed_date_check ON public.grant_milestones IS
  'Ensures completed milestones have a completion date';

-- ============================================================================
-- PART 3: GRANT REPORTS TABLE
-- Track required reporting submissions
-- ============================================================================

CREATE TABLE public.grant_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  grant_id UUID NOT NULL REFERENCES public.grant_details(id) ON DELETE CASCADE,
  report_period_start DATE,
  report_period_end DATE,
  due_date DATE,
  submitted_date DATE,
  report_type TEXT, -- 'interim', 'final', 'financial', 'narrative'
  document_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_grant_reports_grant ON public.grant_reports(grant_id);
CREATE INDEX idx_grant_reports_due ON public.grant_reports(due_date) WHERE submitted_date IS NULL;
CREATE INDEX idx_grant_reports_submitted ON public.grant_reports(submitted_date DESC);

-- Comments
COMMENT ON TABLE public.grant_reports IS
  'Tracking of grant reporting requirements and submissions';

COMMENT ON COLUMN public.grant_reports.report_type IS
  'Type of report: interim, final, financial, narrative';

-- ============================================================================
-- PART 4: GRANT SUMMARY VIEW
-- Aggregated view of grant status including milestone progress
-- ============================================================================

CREATE VIEW v_grants AS
SELECT
  h.id,
  h.portfolio_id,
  h.name,
  h.asset_type,
  h.asset_subtype,
  h.funds_allocated,
  h.status,
  h.sector,
  h.country,

  -- Grant details
  gd.id as grant_id,
  gd.grant_period_start,
  gd.grant_period_end,
  gd.grant_type,
  gd.next_report_due,
  gd.renewal_eligible,
  gd.renewal_date,
  gd.reporting_frequency,
  gd.deliverables,

  -- Milestone summary
  COUNT(gm.id) as total_milestones,
  COUNT(gm.id) FILTER (WHERE gm.status = 'completed') as milestones_completed,
  COUNT(gm.id) FILTER (WHERE gm.status IN ('pending', 'in_progress')) as milestones_pending,
  COUNT(gm.id) FILTER (WHERE gm.status = 'overdue') as milestones_overdue,

  -- Report summary
  COUNT(gr.id) as total_reports,
  COUNT(gr.id) FILTER (WHERE gr.submitted_date IS NOT NULL) as reports_submitted,
  COUNT(gr.id) FILTER (WHERE gr.submitted_date IS NULL AND gr.due_date < CURRENT_DATE) as reports_overdue,

  -- Calculated fields
  CASE
    WHEN COUNT(gm.id) > 0 THEN
      (COUNT(gm.id) FILTER (WHERE gm.status = 'completed')::FLOAT / COUNT(gm.id)::FLOAT) * 100
    ELSE NULL
  END as milestone_completion_pct,

  -- Grant period status
  CASE
    WHEN gd.grant_period_end IS NULL THEN 'ongoing'
    WHEN gd.grant_period_end < CURRENT_DATE THEN 'ended'
    WHEN gd.grant_period_start > CURRENT_DATE THEN 'future'
    ELSE 'active'
  END as grant_period_status

FROM public.holdings h
INNER JOIN public.grant_details gd ON h.id = gd.holding_id
LEFT JOIN public.grant_milestones gm ON gd.id = gm.grant_id
LEFT JOIN public.grant_reports gr ON gd.id = gr.grant_id
WHERE h.asset_type IN ('foundation_grant', 'daf_grant')
GROUP BY h.id, gd.id;

COMMENT ON VIEW v_grants IS
  'Comprehensive grant summary with milestone and reporting progress';

-- ============================================================================
-- PART 5: ROW LEVEL SECURITY (RLS)
-- Apply same security model as holdings table
-- ============================================================================

-- Enable RLS on new tables
ALTER TABLE public.grant_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_reports ENABLE ROW LEVEL SECURITY;

-- Grant Details RLS: Access through holding's portfolio membership
CREATE POLICY "Users can view grant details for their portfolios"
  ON public.grant_details
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.holdings h
      INNER JOIN public.portfolio_members pm ON h.portfolio_id = pm.portfolio_id
      WHERE h.id = grant_details.holding_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert grant details for portfolios they can edit"
  ON public.grant_details
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.holdings h
      WHERE h.id = grant_details.holding_id
        AND can_edit_portfolio(h.portfolio_id)
    )
  );

CREATE POLICY "Users can update grant details for portfolios they can edit"
  ON public.grant_details
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.holdings h
      WHERE h.id = grant_details.holding_id
        AND can_edit_portfolio(h.portfolio_id)
    )
  );

CREATE POLICY "Users can delete grant details for portfolios they can edit"
  ON public.grant_details
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.holdings h
      WHERE h.id = grant_details.holding_id
        AND can_edit_portfolio(h.portfolio_id)
    )
  );

-- Grant Milestones RLS: Access through grant's holding
CREATE POLICY "Users can view milestones for their portfolios"
  ON public.grant_milestones
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.grant_details gd
      INNER JOIN public.holdings h ON gd.holding_id = h.id
      INNER JOIN public.portfolio_members pm ON h.portfolio_id = pm.portfolio_id
      WHERE gd.id = grant_milestones.grant_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert milestones for portfolios they can edit"
  ON public.grant_milestones
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.grant_details gd
      INNER JOIN public.holdings h ON gd.holding_id = h.id
      WHERE gd.id = grant_milestones.grant_id
        AND can_edit_portfolio(h.portfolio_id)
    )
  );

CREATE POLICY "Users can update milestones for portfolios they can edit"
  ON public.grant_milestones
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.grant_details gd
      INNER JOIN public.holdings h ON gd.holding_id = h.id
      WHERE gd.id = grant_milestones.grant_id
        AND can_edit_portfolio(h.portfolio_id)
    )
  );

CREATE POLICY "Users can delete milestones for portfolios they can edit"
  ON public.grant_milestones
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.grant_details gd
      INNER JOIN public.holdings h ON gd.holding_id = h.id
      WHERE gd.id = grant_milestones.grant_id
        AND can_edit_portfolio(h.portfolio_id)
    )
  );

-- Grant Reports RLS: Same pattern as milestones
CREATE POLICY "Users can view reports for their portfolios"
  ON public.grant_reports
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.grant_details gd
      INNER JOIN public.holdings h ON gd.holding_id = h.id
      INNER JOIN public.portfolio_members pm ON h.portfolio_id = pm.portfolio_id
      WHERE gd.id = grant_reports.grant_id
        AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert reports for portfolios they can edit"
  ON public.grant_reports
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.grant_details gd
      INNER JOIN public.holdings h ON gd.holding_id = h.id
      WHERE gd.id = grant_reports.grant_id
        AND can_edit_portfolio(h.portfolio_id)
    )
  );

CREATE POLICY "Users can update reports for portfolios they can edit"
  ON public.grant_reports
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.grant_details gd
      INNER JOIN public.holdings h ON gd.holding_id = h.id
      WHERE gd.id = grant_reports.grant_id
        AND can_edit_portfolio(h.portfolio_id)
    )
  );

CREATE POLICY "Users can delete reports for portfolios they can edit"
  ON public.grant_reports
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.grant_details gd
      INNER JOIN public.holdings h ON gd.holding_id = h.id
      WHERE gd.id = grant_reports.grant_id
        AND can_edit_portfolio(h.portfolio_id)
    )
  );

-- ============================================================================
-- PART 6: HELPER FUNCTIONS
-- ============================================================================

-- Function to get upcoming report deadlines for a portfolio
CREATE OR REPLACE FUNCTION get_upcoming_grant_reports(
  p_portfolio_id UUID,
  p_days_ahead INTEGER DEFAULT 30
)
RETURNS TABLE (
  holding_id UUID,
  holding_name TEXT,
  grant_id UUID,
  due_date DATE,
  days_until_due INTEGER,
  report_type TEXT
) AS $$
  SELECT
    h.id as holding_id,
    h.name as holding_name,
    gr.grant_id,
    gr.due_date,
    (gr.due_date - CURRENT_DATE) as days_until_due,
    gr.report_type
  FROM public.grant_reports gr
  INNER JOIN public.grant_details gd ON gr.grant_id = gd.id
  INNER JOIN public.holdings h ON gd.holding_id = h.id
  WHERE h.portfolio_id = p_portfolio_id
    AND gr.submitted_date IS NULL
    AND gr.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + p_days_ahead
  ORDER BY gr.due_date ASC;
$$ LANGUAGE SQL STABLE;

-- Function to get overdue milestones for a portfolio
CREATE OR REPLACE FUNCTION get_overdue_milestones(p_portfolio_id UUID)
RETURNS TABLE (
  holding_id UUID,
  holding_name TEXT,
  grant_id UUID,
  milestone_id UUID,
  milestone_name TEXT,
  due_date DATE,
  days_overdue INTEGER
) AS $$
  SELECT
    h.id as holding_id,
    h.name as holding_name,
    gm.grant_id,
    gm.id as milestone_id,
    gm.milestone_name,
    gm.due_date,
    (CURRENT_DATE - gm.due_date) as days_overdue
  FROM public.grant_milestones gm
  INNER JOIN public.grant_details gd ON gm.grant_id = gd.id
  INNER JOIN public.holdings h ON gd.holding_id = h.id
  WHERE h.portfolio_id = p_portfolio_id
    AND gm.status NOT IN ('completed', 'cancelled')
    AND gm.due_date < CURRENT_DATE
  ORDER BY gm.due_date ASC;
$$ LANGUAGE SQL STABLE;

-- ============================================================================
-- Migration Verification
-- ============================================================================

-- Run these queries after migration to verify:

/*
-- Check table creation
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('grant_details', 'grant_milestones', 'grant_reports');

-- Check view creation
SELECT table_name FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name = 'v_grants';

-- Check RLS policies
SELECT tablename, policyname FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('grant_details', 'grant_milestones', 'grant_reports');

-- Test grants view (should return grant holdings only)
SELECT id, name, asset_type, grant_type, total_milestones, milestones_completed
FROM v_grants
LIMIT 5;
*/

-- ============================================================================
-- Rollback Instructions
-- ============================================================================

/*
BEGIN;

-- Drop functions
DROP FUNCTION IF EXISTS get_upcoming_grant_reports(UUID, INTEGER);
DROP FUNCTION IF EXISTS get_overdue_milestones(UUID);

-- Drop view
DROP VIEW IF EXISTS v_grants;

-- Drop tables (CASCADE removes foreign keys)
DROP TABLE IF EXISTS public.grant_reports CASCADE;
DROP TABLE IF EXISTS public.grant_milestones CASCADE;
DROP TABLE IF EXISTS public.grant_details CASCADE;

-- Drop enums
DROP TYPE IF EXISTS milestone_status_enum;
DROP TYPE IF EXISTS grant_type_enum;

COMMIT;
*/
