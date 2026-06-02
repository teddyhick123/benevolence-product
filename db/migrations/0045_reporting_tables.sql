-- Migration: Reporting Tables
-- Description: Creates report_templates, generated_documents, report_schedules,
--              and generate_share_token RPC. Fixes R-B1 (missing reporting schema).
-- Date: 2026-06-02

-- ---------------------------------------------------------------------------
-- generate_share_token — used by document share-link feature
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_share_token()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT encode(gen_random_bytes(24), 'hex');
$$;

GRANT EXECUTE ON FUNCTION public.generate_share_token() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- report_templates — reusable report configurations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_templates (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  portfolio_id uuid        NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  created_by   uuid        REFERENCES auth.users(id),

  name         text        NOT NULL,
  description  text,
  scope        text        NOT NULL DEFAULT 'portfolio'
                           CHECK (scope IN ('portfolio', 'holding', 'sector')),
  config       jsonb       NOT NULL DEFAULT '{}',
  is_default   boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_report_templates_portfolio_id ON public.report_templates (portfolio_id);

ALTER TABLE public.report_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_templates: portfolio members can view"
  ON public.report_templates FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

CREATE POLICY "report_templates: portfolio editors can manage"
  ON public.report_templates FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

CREATE POLICY "report_templates: service role full access"
  ON public.report_templates FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_templates TO authenticated;
GRANT ALL ON public.report_templates TO service_role;

CREATE TRIGGER set_report_templates_updated_at
  BEFORE UPDATE ON public.report_templates
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- generated_documents — generated report and export documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.generated_documents (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),

  portfolio_id      uuid        NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  template_id       uuid        REFERENCES public.report_templates(id) ON DELETE SET NULL,
  holding_id        uuid        REFERENCES public.holdings(id) ON DELETE SET NULL,
  generated_by      uuid        REFERENCES auth.users(id),

  title             text        NOT NULL,
  document_type     text        NOT NULL DEFAULT 'report'
                                CHECK (document_type IN ('report', 'export')),
  format            text        NOT NULL DEFAULT 'html'
                                CHECK (format IN ('html', 'csv', 'json', 'xlsx', 'pdf')),
  scope             text        NOT NULL DEFAULT 'portfolio'
                                CHECK (scope IN ('portfolio', 'holding', 'sector')),
  sector            text,

  content           jsonb,
  config            jsonb       NOT NULL DEFAULT '{}',
  file_size_bytes   integer,

  status            text        NOT NULL DEFAULT 'generated'
                                CHECK (status IN ('generated', 'archived')),
  generated_at      timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz,

  is_public         boolean     NOT NULL DEFAULT false,
  share_token       text        UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex')
);

CREATE INDEX IF NOT EXISTS idx_generated_documents_portfolio_id ON public.generated_documents (portfolio_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_share_token  ON public.generated_documents (share_token) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_generated_documents_status       ON public.generated_documents (portfolio_id, status);

ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "generated_documents: portfolio members can view"
  ON public.generated_documents FOR SELECT TO authenticated
  USING (
    public.can_view_portfolio(portfolio_id)
    OR (is_public = true AND (expires_at IS NULL OR expires_at > now()))
  );

CREATE POLICY "generated_documents: portfolio editors can manage"
  ON public.generated_documents FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

CREATE POLICY "generated_documents: service role full access"
  ON public.generated_documents FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_documents TO authenticated;
GRANT ALL ON public.generated_documents TO service_role;

-- ---------------------------------------------------------------------------
-- report_schedules — recurring report generation schedules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_schedules (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  portfolio_id     uuid        NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  template_id      uuid        NOT NULL REFERENCES public.report_templates(id) ON DELETE CASCADE,
  created_by       uuid        REFERENCES auth.users(id),

  name             text        NOT NULL,
  frequency        text        NOT NULL
                               CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  day_of_week      integer     CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month     integer     CHECK (day_of_month BETWEEN 1 AND 31),
  time_of_day      time,
  timezone         text        NOT NULL DEFAULT 'UTC',

  delivery_method  text        CHECK (delivery_method IN ('store', 'email', 'both')),
  recipients       jsonb       NOT NULL DEFAULT '[]',

  is_active        boolean     NOT NULL DEFAULT true,
  last_run_at      timestamptz,
  next_run_at      timestamptz,
  run_count        integer     NOT NULL DEFAULT 0,
  last_error       text
);

CREATE INDEX IF NOT EXISTS idx_report_schedules_portfolio_id ON public.report_schedules (portfolio_id);
CREATE INDEX IF NOT EXISTS idx_report_schedules_next_run     ON public.report_schedules (next_run_at) WHERE is_active = true;

ALTER TABLE public.report_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_schedules: portfolio members can view"
  ON public.report_schedules FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

CREATE POLICY "report_schedules: portfolio editors can manage"
  ON public.report_schedules FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

CREATE POLICY "report_schedules: service role full access"
  ON public.report_schedules FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.report_schedules TO authenticated;
GRANT ALL ON public.report_schedules TO service_role;

CREATE TRIGGER set_report_schedules_updated_at
  BEFORE UPDATE ON public.report_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
