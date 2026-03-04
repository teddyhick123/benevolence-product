-- ============================================================================
-- REPORTING MODULE
-- ============================================================================
-- Description: Report generation and templates
-- Tables: report_templates, report_schedules, generated_documents, generated_letters
-- Views: v_recent_documents, v_active_schedules
-- ============================================================================

-- ============================================================================
-- 1. REPORT TEMPLATES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  scope TEXT NOT NULL CHECK (scope IN ('holding', 'portfolio', 'sector')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_templates_portfolio_id ON public.report_templates(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_report_templates_default ON public.report_templates(portfolio_id, scope) WHERE is_default = true;

COMMENT ON TABLE public.report_templates IS 'Reusable report configurations';
COMMENT ON COLUMN public.report_templates.scope IS 'Report scope: holding, portfolio, or sector';
COMMENT ON COLUMN public.report_templates.config IS 'JSON config: metric_codes, chart_preferences, include_sections, time_range';

-- ============================================================================
-- 2. REPORT SCHEDULES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.report_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.report_templates(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'annually')),
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sunday
  day_of_month INTEGER CHECK (day_of_month BETWEEN 1 AND 31),
  month_of_year INTEGER CHECK (month_of_year BETWEEN 1 AND 12),
  time_of_day TIME DEFAULT '09:00:00',
  timezone TEXT DEFAULT 'America/New_York',
  is_active BOOLEAN DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  recipients JSONB DEFAULT '[]'::jsonb,  -- [{email, name}]
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_report_schedules_portfolio ON public.report_schedules(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_report_schedules_next_run ON public.report_schedules(next_run_at) WHERE is_active = true;

COMMENT ON TABLE public.report_schedules IS 'Scheduled report generation';

-- ============================================================================
-- 3. GENERATED DOCUMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.generated_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  holding_id UUID REFERENCES public.holdings(id) ON DELETE SET NULL,
  template_id UUID REFERENCES public.report_templates(id) ON DELETE SET NULL,
  schedule_id UUID REFERENCES public.report_schedules(id) ON DELETE SET NULL,

  -- Document info
  document_type TEXT NOT NULL,  -- impact_report, tax_summary, board_report, custom
  title TEXT NOT NULL,
  format TEXT NOT NULL CHECK (format IN ('pdf', 'xlsx', 'docx', 'html', 'csv')),
  file_size_bytes BIGINT,
  storage_path TEXT,

  -- Generation context
  date_range_start DATE,
  date_range_end DATE,
  generation_params JSONB DEFAULT '{}'::jsonb,

  -- Status
  status TEXT DEFAULT 'generating' CHECK (status IN ('generating', 'completed', 'failed')),
  error_message TEXT,

  -- AI generation metadata
  ai_generated BOOLEAN DEFAULT false,
  ai_prompt TEXT,
  ai_model TEXT,

  -- Access tracking
  download_count INTEGER DEFAULT 0,
  last_downloaded_at TIMESTAMPTZ,

  generated_by UUID REFERENCES auth.users(id),
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_documents_portfolio ON public.generated_documents(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_holding ON public.generated_documents(holding_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_type ON public.generated_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_generated_documents_date ON public.generated_documents(generated_at DESC);

COMMENT ON TABLE public.generated_documents IS 'Generated report outputs';

-- ============================================================================
-- 4. GENERATED LETTERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.generated_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  holding_id UUID REFERENCES public.holdings(id) ON DELETE SET NULL,

  -- Letter details
  letter_type TEXT NOT NULL,  -- grant_agreement, acknowledgment, report_cover, update
  recipient_name TEXT,
  recipient_email TEXT,
  recipient_org TEXT,

  -- Content
  subject TEXT,
  body TEXT NOT NULL,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent')),
  sent_at TIMESTAMPTZ,
  sent_via TEXT CHECK (sent_via IN ('email', 'mail', 'both')),

  -- AI generation
  ai_generated BOOLEAN DEFAULT false,
  ai_prompt TEXT,

  generated_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_generated_letters_portfolio ON public.generated_letters(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_generated_letters_holding ON public.generated_letters(holding_id);
CREATE INDEX IF NOT EXISTS idx_generated_letters_type ON public.generated_letters(letter_type);
CREATE INDEX IF NOT EXISTS idx_generated_letters_status ON public.generated_letters(status);

COMMENT ON TABLE public.generated_letters IS 'Generated correspondence';

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Recent documents
CREATE OR REPLACE VIEW public.v_recent_documents AS
SELECT
  gd.*,
  h.name as holding_name,
  rt.name as template_name
FROM public.generated_documents gd
LEFT JOIN public.holdings h ON gd.holding_id = h.id
LEFT JOIN public.report_templates rt ON gd.template_id = rt.id
WHERE gd.status = 'completed'
ORDER BY gd.generated_at DESC;

COMMENT ON VIEW public.v_recent_documents IS 'Recently generated documents';

-- Active schedules
CREATE OR REPLACE VIEW public.v_active_schedules AS
SELECT
  rs.*,
  rt.name as template_name,
  rt.scope as template_scope
FROM public.report_schedules rs
LEFT JOIN public.report_templates rt ON rs.template_id = rt.id
WHERE rs.is_active = true
ORDER BY rs.next_run_at ASC;

COMMENT ON VIEW public.v_active_schedules IS 'Active report schedules';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Calculate next run time
CREATE OR REPLACE FUNCTION public.calculate_next_run_time(
  p_frequency TEXT,
  p_day_of_week INTEGER,
  p_day_of_month INTEGER,
  p_time_of_day TIME,
  p_last_run TIMESTAMPTZ DEFAULT NULL
)
RETURNS TIMESTAMPTZ AS $$
DECLARE
  v_base TIMESTAMPTZ;
  v_next TIMESTAMPTZ;
BEGIN
  v_base := COALESCE(p_last_run, NOW());

  CASE p_frequency
    WHEN 'daily' THEN
      v_next := (v_base::DATE + 1) + p_time_of_day;
    WHEN 'weekly' THEN
      v_next := v_base::DATE + ((7 + p_day_of_week - EXTRACT(DOW FROM v_base)::INTEGER) % 7 + 1) + p_time_of_day;
    WHEN 'monthly' THEN
      v_next := DATE_TRUNC('month', v_base + INTERVAL '1 month') + (LEAST(p_day_of_month, 28) - 1) + p_time_of_day;
    WHEN 'quarterly' THEN
      v_next := DATE_TRUNC('quarter', v_base + INTERVAL '3 months') + (LEAST(p_day_of_month, 28) - 1) + p_time_of_day;
    WHEN 'annually' THEN
      v_next := DATE_TRUNC('year', v_base + INTERVAL '1 year') + (LEAST(p_day_of_month, 28) - 1) + p_time_of_day;
    ELSE
      v_next := v_base + INTERVAL '1 day';
  END CASE;

  -- If calculated time is in the past, add one period
  IF v_next <= NOW() THEN
    CASE p_frequency
      WHEN 'daily' THEN v_next := v_next + INTERVAL '1 day';
      WHEN 'weekly' THEN v_next := v_next + INTERVAL '1 week';
      WHEN 'monthly' THEN v_next := v_next + INTERVAL '1 month';
      WHEN 'quarterly' THEN v_next := v_next + INTERVAL '3 months';
      WHEN 'annually' THEN v_next := v_next + INTERVAL '1 year';
    END CASE;
  END IF;

  RETURN v_next;
END;
$$ LANGUAGE plpgsql;

-- Auto-update next run time trigger
CREATE OR REPLACE FUNCTION public.auto_calculate_next_run()
RETURNS TRIGGER AS $$
BEGIN
  NEW.next_run_at := public.calculate_next_run_time(
    NEW.frequency,
    NEW.day_of_week,
    NEW.day_of_month,
    NEW.time_of_day,
    NEW.last_run_at
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_next_run_trigger ON public.report_schedules;
CREATE TRIGGER calculate_next_run_trigger
  BEFORE INSERT OR UPDATE OF frequency, day_of_week, day_of_month, time_of_day, last_run_at
  ON public.report_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_calculate_next_run();

-- Enforce single default template per scope
CREATE OR REPLACE FUNCTION public.enforce_single_default_template()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE public.report_templates
    SET is_default = false
    WHERE portfolio_id = NEW.portfolio_id
      AND scope = NEW.scope
      AND id != NEW.id
      AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_single_default_template ON public.report_templates;
CREATE TRIGGER trg_enforce_single_default_template
  BEFORE INSERT OR UPDATE ON public.report_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_single_default_template();

-- Updated_at triggers
DROP TRIGGER IF EXISTS trg_report_templates_updated_at ON public.report_templates;
CREATE TRIGGER trg_report_templates_updated_at
  BEFORE UPDATE ON public.report_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_report_schedules_updated_at ON public.report_schedules;
CREATE TRIGGER trg_report_schedules_updated_at
  BEFORE UPDATE ON public.report_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_generated_letters_updated_at ON public.generated_letters;
CREATE TRIGGER trg_generated_letters_updated_at
  BEFORE UPDATE ON public.generated_letters
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Grant execute
GRANT EXECUTE ON FUNCTION public.calculate_next_run_time(TEXT, INTEGER, INTEGER, TIME, TIMESTAMPTZ) TO authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.generated_letters ENABLE ROW LEVEL SECURITY;

-- Report Templates
DROP POLICY IF EXISTS "report_templates_read" ON public.report_templates;
CREATE POLICY "report_templates_read" ON public.report_templates
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

DROP POLICY IF EXISTS "report_templates_write" ON public.report_templates;
CREATE POLICY "report_templates_write" ON public.report_templates
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "report_templates_service" ON public.report_templates;
CREATE POLICY "report_templates_service" ON public.report_templates
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Report Schedules
DROP POLICY IF EXISTS "report_schedules_read" ON public.report_schedules;
CREATE POLICY "report_schedules_read" ON public.report_schedules
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

DROP POLICY IF EXISTS "report_schedules_write" ON public.report_schedules;
CREATE POLICY "report_schedules_write" ON public.report_schedules
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "report_schedules_service" ON public.report_schedules;
CREATE POLICY "report_schedules_service" ON public.report_schedules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Generated Documents
DROP POLICY IF EXISTS "generated_documents_read" ON public.generated_documents;
CREATE POLICY "generated_documents_read" ON public.generated_documents
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

DROP POLICY IF EXISTS "generated_documents_write" ON public.generated_documents;
CREATE POLICY "generated_documents_write" ON public.generated_documents
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "generated_documents_service" ON public.generated_documents;
CREATE POLICY "generated_documents_service" ON public.generated_documents
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Generated Letters
DROP POLICY IF EXISTS "generated_letters_read" ON public.generated_letters;
CREATE POLICY "generated_letters_read" ON public.generated_letters
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

DROP POLICY IF EXISTS "generated_letters_write" ON public.generated_letters;
CREATE POLICY "generated_letters_write" ON public.generated_letters
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "generated_letters_service" ON public.generated_letters;
CREATE POLICY "generated_letters_service" ON public.generated_letters
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_schedules TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_letters TO authenticated;

GRANT ALL ON public.report_templates TO service_role;
GRANT ALL ON public.report_schedules TO service_role;
GRANT ALL ON public.generated_documents TO service_role;
GRANT ALL ON public.generated_letters TO service_role;

-- Views
GRANT SELECT ON public.v_recent_documents TO authenticated;
GRANT SELECT ON public.v_active_schedules TO authenticated;
