-- ============================================================================
-- GRANT MANAGEMENT MODULE
-- ============================================================================
-- Description: Due diligence, milestones, and workflow automation for foundations/DAFs
-- Tables: grant_details, grant_milestones, grant_payments, grant_reports,
--         grant_documents, grant_communications, grant_contacts, grant_budget_items,
--         workflow_templates, workflow_instances, workflow_tasks
-- Views: v_grants, v_grant_health, v_portfolio_grant_summary
-- ============================================================================

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Grant type enumeration
DO $$ BEGIN
  CREATE TYPE grant_type_enum AS ENUM (
    'general_operating',
    'project',
    'capacity_building',
    'multi_year',
    'seed',
    'planning'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Milestone status enumeration
DO $$ BEGIN
  CREATE TYPE milestone_status_enum AS ENUM (
    'pending',
    'in_progress',
    'completed',
    'overdue',
    'cancelled'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 1. GRANT DETAILS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.grant_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id UUID NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  grant_period_start DATE,
  grant_period_end DATE,
  grant_type grant_type_enum,
  renewal_eligible BOOLEAN DEFAULT false,
  renewal_date DATE,
  deliverables TEXT,
  reporting_frequency TEXT,  -- monthly, quarterly, annual, final
  next_report_due DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(holding_id)
);

CREATE INDEX IF NOT EXISTS idx_grant_details_holding ON public.grant_details(holding_id);
CREATE INDEX IF NOT EXISTS idx_grant_details_next_report ON public.grant_details(next_report_due) WHERE next_report_due IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_grant_details_renewal ON public.grant_details(renewal_date) WHERE renewal_eligible = true;

COMMENT ON TABLE public.grant_details IS 'Grant-specific details for foundation and DAF grants';

-- ============================================================================
-- 2. GRANT MILESTONES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.grant_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES public.grant_details(id) ON DELETE CASCADE,
  milestone_name TEXT NOT NULL,
  description TEXT,
  due_date DATE,
  completed_date DATE,
  status milestone_status_enum DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT milestone_completed_date_check CHECK (
    (status = 'completed' AND completed_date IS NOT NULL) OR (status != 'completed')
  )
);

CREATE INDEX IF NOT EXISTS idx_milestones_grant ON public.grant_milestones(grant_id);
CREATE INDEX IF NOT EXISTS idx_milestones_status ON public.grant_milestones(status);
CREATE INDEX IF NOT EXISTS idx_milestones_due ON public.grant_milestones(due_date) WHERE due_date IS NOT NULL;

COMMENT ON TABLE public.grant_milestones IS 'Deliverables and milestones for grant-funded projects';

-- ============================================================================
-- 3. GRANT PAYMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.grant_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES public.grant_details(id) ON DELETE CASCADE,
  payment_date DATE,
  scheduled_date DATE,
  amount NUMERIC NOT NULL,
  payment_type TEXT CHECK (payment_type IN ('initial', 'interim', 'final', 'milestone')),
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'pending', 'paid', 'cancelled')),
  check_number TEXT,
  wire_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grant_payments_grant ON public.grant_payments(grant_id);
CREATE INDEX IF NOT EXISTS idx_grant_payments_status ON public.grant_payments(status);
CREATE INDEX IF NOT EXISTS idx_grant_payments_date ON public.grant_payments(scheduled_date);

COMMENT ON TABLE public.grant_payments IS 'Scheduled and actual grant disbursements';

-- ============================================================================
-- 4. GRANT REPORTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.grant_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES public.grant_details(id) ON DELETE CASCADE,
  report_period_start DATE,
  report_period_end DATE,
  due_date DATE,
  submitted_date DATE,
  report_type TEXT,  -- interim, final, financial, narrative
  document_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grant_reports_grant ON public.grant_reports(grant_id);
CREATE INDEX IF NOT EXISTS idx_grant_reports_due ON public.grant_reports(due_date) WHERE submitted_date IS NULL;

COMMENT ON TABLE public.grant_reports IS 'Required reporting schedules and submissions';

-- ============================================================================
-- 5. GRANT DOCUMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.grant_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES public.grant_details(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL,  -- proposal, agreement, amendment, report, correspondence
  file_name TEXT NOT NULL,
  storage_path TEXT,
  file_size BIGINT,
  uploaded_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grant_documents_grant ON public.grant_documents(grant_id);

COMMENT ON TABLE public.grant_documents IS 'Grant-related file storage';

-- ============================================================================
-- 6. GRANT COMMUNICATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.grant_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES public.grant_details(id) ON DELETE CASCADE,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  comm_type TEXT NOT NULL,  -- email, phone, meeting, letter
  subject TEXT,
  summary TEXT NOT NULL,
  full_content TEXT,
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  logged_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grant_communications_grant ON public.grant_communications(grant_id);

COMMENT ON TABLE public.grant_communications IS 'Communication log with grantees';

-- ============================================================================
-- 7. GRANT CONTACTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.grant_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES public.grant_details(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  phone TEXT,
  is_primary BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grant_contacts_grant ON public.grant_contacts(grant_id);

COMMENT ON TABLE public.grant_contacts IS 'Contact persons at grantee organizations';

-- ============================================================================
-- 8. GRANT BUDGET ITEMS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.grant_budget_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grant_id UUID NOT NULL REFERENCES public.grant_details(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  description TEXT,
  budgeted_amount NUMERIC NOT NULL,
  actual_amount NUMERIC,
  variance NUMERIC GENERATED ALWAYS AS (budgeted_amount - COALESCE(actual_amount, 0)) STORED,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_grant_budget_items_grant ON public.grant_budget_items(grant_id);

COMMENT ON TABLE public.grant_budget_items IS 'Line-item budgets for grants';

-- ============================================================================
-- 9. WORKFLOW TEMPLATES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  workflow_type TEXT NOT NULL,  -- grant_review, renewal, compliance
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_templates_portfolio ON public.workflow_templates(portfolio_id);

COMMENT ON TABLE public.workflow_templates IS 'Reusable workflow definitions';

-- ============================================================================
-- 10. WORKFLOW INSTANCES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.workflow_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES public.workflow_templates(id) ON DELETE SET NULL,
  grant_id UUID REFERENCES public.grant_details(id) ON DELETE CASCADE,
  holding_id UUID REFERENCES public.holdings(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled', 'paused')),
  current_step INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  started_by UUID REFERENCES auth.users(id),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_instances_template ON public.workflow_instances(template_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_grant ON public.workflow_instances(grant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_instances_status ON public.workflow_instances(status);

COMMENT ON TABLE public.workflow_instances IS 'Active workflow executions';

-- ============================================================================
-- 11. WORKFLOW TASKS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.workflow_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES public.workflow_instances(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  task_name TEXT NOT NULL,
  description TEXT,
  assigned_to UUID REFERENCES auth.users(id),
  due_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES auth.users(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workflow_tasks_instance ON public.workflow_tasks(instance_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_assigned ON public.workflow_tasks(assigned_to) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_workflow_tasks_due ON public.workflow_tasks(due_date) WHERE status = 'pending';

COMMENT ON TABLE public.workflow_tasks IS 'Individual workflow tasks';

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Grant summary view
CREATE OR REPLACE VIEW public.v_grants AS
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
  gd.id as grant_id,
  gd.grant_period_start,
  gd.grant_period_end,
  gd.grant_type,
  gd.next_report_due,
  gd.renewal_eligible,
  gd.renewal_date,
  gd.reporting_frequency,
  gd.deliverables,
  COUNT(gm.id) as total_milestones,
  COUNT(gm.id) FILTER (WHERE gm.status = 'completed') as milestones_completed,
  COUNT(gm.id) FILTER (WHERE gm.status IN ('pending', 'in_progress')) as milestones_pending,
  COUNT(gm.id) FILTER (WHERE gm.status = 'overdue') as milestones_overdue,
  COUNT(gr.id) as total_reports,
  COUNT(gr.id) FILTER (WHERE gr.submitted_date IS NOT NULL) as reports_submitted,
  COUNT(gr.id) FILTER (WHERE gr.submitted_date IS NULL AND gr.due_date < CURRENT_DATE) as reports_overdue,
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

COMMENT ON VIEW public.v_grants IS 'Comprehensive grant summary with milestone and reporting progress';

-- Grant health view (risk scoring)
CREATE OR REPLACE VIEW public.v_grant_health AS
SELECT
  g.*,
  CASE
    WHEN milestones_overdue > 0 OR reports_overdue > 0 THEN 'at_risk'
    WHEN milestones_pending = 0 AND total_milestones > 0 THEN 'on_track'
    WHEN next_report_due <= CURRENT_DATE + INTERVAL '7 days' THEN 'needs_attention'
    ELSE 'healthy'
  END as health_status,
  CASE
    WHEN milestones_overdue > 0 THEN 30
    WHEN reports_overdue > 0 THEN 25
    WHEN next_report_due <= CURRENT_DATE + INTERVAL '7 days' THEN 15
    ELSE 0
  END as risk_score
FROM public.v_grants g;

COMMENT ON VIEW public.v_grant_health IS 'Grant health scores and risk assessment';

-- Portfolio grant summary
CREATE OR REPLACE VIEW public.v_portfolio_grant_summary AS
SELECT
  portfolio_id,
  COUNT(*) as total_grants,
  SUM(funds_allocated) as total_allocated,
  COUNT(*) FILTER (WHERE grant_period_status = 'active') as active_grants,
  COUNT(*) FILTER (WHERE milestones_overdue > 0 OR reports_overdue > 0) as at_risk_grants,
  SUM(milestones_completed) as total_milestones_completed,
  SUM(total_milestones) as total_milestones
FROM public.v_grants
GROUP BY portfolio_id;

COMMENT ON VIEW public.v_portfolio_grant_summary IS 'Portfolio-level grant summary';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get upcoming report deadlines
CREATE OR REPLACE FUNCTION public.get_upcoming_grant_reports(
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

-- Get overdue milestones
CREATE OR REPLACE FUNCTION public.get_overdue_milestones(p_portfolio_id UUID)
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

-- Get upcoming deadlines (combined milestones and reports)
CREATE OR REPLACE FUNCTION public.get_upcoming_deadlines(
  p_portfolio_id UUID,
  p_days_ahead INTEGER DEFAULT 30
)
RETURNS TABLE (
  holding_id UUID,
  holding_name TEXT,
  deadline_type TEXT,
  item_name TEXT,
  due_date DATE,
  days_until_due INTEGER
) AS $$
  -- Reports
  SELECT
    h.id as holding_id,
    h.name as holding_name,
    'report' as deadline_type,
    COALESCE(gr.report_type, 'Report') as item_name,
    gr.due_date,
    (gr.due_date - CURRENT_DATE) as days_until_due
  FROM public.grant_reports gr
  INNER JOIN public.grant_details gd ON gr.grant_id = gd.id
  INNER JOIN public.holdings h ON gd.holding_id = h.id
  WHERE h.portfolio_id = p_portfolio_id
    AND gr.submitted_date IS NULL
    AND gr.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + p_days_ahead

  UNION ALL

  -- Milestones
  SELECT
    h.id as holding_id,
    h.name as holding_name,
    'milestone' as deadline_type,
    gm.milestone_name as item_name,
    gm.due_date,
    (gm.due_date - CURRENT_DATE) as days_until_due
  FROM public.grant_milestones gm
  INNER JOIN public.grant_details gd ON gm.grant_id = gd.id
  INNER JOIN public.holdings h ON gd.holding_id = h.id
  WHERE h.portfolio_id = p_portfolio_id
    AND gm.status NOT IN ('completed', 'cancelled')
    AND gm.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + p_days_ahead

  ORDER BY due_date ASC;
$$ LANGUAGE SQL STABLE;

-- Grant execute
GRANT EXECUTE ON FUNCTION public.get_upcoming_grant_reports(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_overdue_milestones(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_upcoming_deadlines(UUID, INTEGER) TO authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.grant_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_communications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grant_budget_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_tasks ENABLE ROW LEVEL SECURITY;

-- Helper: Check grant access via holding
CREATE OR REPLACE FUNCTION public.can_view_grant(p_grant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.grant_details gd
    JOIN public.holdings h ON h.id = gd.holding_id
    JOIN public.portfolio_members pm ON pm.portfolio_id = h.portfolio_id
    WHERE gd.id = p_grant_id AND pm.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_grant(p_grant_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.grant_details gd
    JOIN public.holdings h ON h.id = gd.holding_id
    WHERE gd.id = p_grant_id AND public.can_edit_portfolio(h.portfolio_id)
  );
$$;

-- Grant Details RLS
DROP POLICY IF EXISTS "grant_details_read" ON public.grant_details;
CREATE POLICY "grant_details_read" ON public.grant_details
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.holdings h
      JOIN public.portfolio_members pm ON pm.portfolio_id = h.portfolio_id
      WHERE h.id = grant_details.holding_id AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "grant_details_write" ON public.grant_details;
CREATE POLICY "grant_details_write" ON public.grant_details
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.holdings h
      WHERE h.id = grant_details.holding_id AND public.can_edit_portfolio(h.portfolio_id)
    )
  );

DROP POLICY IF EXISTS "grant_details_service" ON public.grant_details;
CREATE POLICY "grant_details_service" ON public.grant_details
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Apply similar RLS to related tables (milestones, payments, etc.)
-- Grant Milestones
DROP POLICY IF EXISTS "grant_milestones_read" ON public.grant_milestones;
CREATE POLICY "grant_milestones_read" ON public.grant_milestones
  FOR SELECT TO authenticated
  USING (public.can_view_grant(grant_id));

DROP POLICY IF EXISTS "grant_milestones_write" ON public.grant_milestones;
CREATE POLICY "grant_milestones_write" ON public.grant_milestones
  FOR ALL TO authenticated
  USING (public.can_edit_grant(grant_id))
  WITH CHECK (public.can_edit_grant(grant_id));

DROP POLICY IF EXISTS "grant_milestones_service" ON public.grant_milestones;
CREATE POLICY "grant_milestones_service" ON public.grant_milestones
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Apply to other grant tables with same pattern
-- (grant_payments, grant_reports, grant_documents, grant_communications, grant_contacts, grant_budget_items)

-- Workflow Templates RLS
DROP POLICY IF EXISTS "workflow_templates_read" ON public.workflow_templates;
CREATE POLICY "workflow_templates_read" ON public.workflow_templates
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

DROP POLICY IF EXISTS "workflow_templates_write" ON public.workflow_templates;
CREATE POLICY "workflow_templates_write" ON public.workflow_templates
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "workflow_templates_service" ON public.workflow_templates;
CREATE POLICY "workflow_templates_service" ON public.workflow_templates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grant_details TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grant_milestones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grant_payments TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grant_reports TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grant_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grant_communications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grant_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.grant_budget_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_instances TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.workflow_tasks TO authenticated;

GRANT ALL ON public.grant_details TO service_role;
GRANT ALL ON public.grant_milestones TO service_role;
GRANT ALL ON public.grant_payments TO service_role;
GRANT ALL ON public.grant_reports TO service_role;
GRANT ALL ON public.grant_documents TO service_role;
GRANT ALL ON public.grant_communications TO service_role;
GRANT ALL ON public.grant_contacts TO service_role;
GRANT ALL ON public.grant_budget_items TO service_role;
GRANT ALL ON public.workflow_templates TO service_role;
GRANT ALL ON public.workflow_instances TO service_role;
GRANT ALL ON public.workflow_tasks TO service_role;

-- Views
GRANT SELECT ON public.v_grants TO authenticated;
GRANT SELECT ON public.v_grant_health TO authenticated;
GRANT SELECT ON public.v_portfolio_grant_summary TO authenticated;
