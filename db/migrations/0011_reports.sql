-- =============================================================================
-- 0011_reports.sql
-- Generated portfolio reports (PDF snapshots, AI narrative reports, etc.)
-- Depends on: 0001, 0004
-- =============================================================================

CREATE OR REPLACE FUNCTION generate_share_token()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT encode(gen_random_bytes(24), 'hex');
$$;

GRANT EXECUTE ON FUNCTION generate_share_token() TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS reports (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  portfolio_id    uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  created_by      uuid NOT NULL REFERENCES auth.users(id),

  report_type     text NOT NULL DEFAULT 'portfolio_summary',
  -- 'portfolio_summary', 'impact_report', 'tax_summary', 'grant_report', 'donor_report'

  title           text NOT NULL,
  description     text,
  period_start    date,
  period_end      date,

  -- Storage
  storage_path    text,           -- Supabase Storage path for PDF
  storage_bucket  text DEFAULT 'reports',
  content         jsonb,          -- structured content for HTML rendering
  template        text DEFAULT 'default',

  status          text NOT NULL DEFAULT 'draft',  -- 'draft', 'generating', 'ready', 'failed'
  generated_at    timestamptz,
  generation_error text,

  -- Sharing
  is_public       boolean NOT NULL DEFAULT false,
  share_token     text UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  shared_at       timestamptz,
  expires_at      timestamptz,

  deleted_at      timestamptz,
  deleted_by      uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_reports_portfolio_id ON reports (portfolio_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_org_id       ON reports (org_id)       WHERE deleted_at IS NULL;
CREATE INDEX idx_reports_share_token  ON reports (share_token)  WHERE is_public AND deleted_at IS NULL;

CREATE TRIGGER trg_reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "reports: portfolio members can view"
  ON reports FOR SELECT
  USING (
    (can_view_portfolio(portfolio_id) AND deleted_at IS NULL)
    OR (is_public AND (expires_at IS NULL OR expires_at > now()))
  );

CREATE POLICY "reports: portfolio members (member+) can create"
  ON reports FOR INSERT
  WITH CHECK (can_edit_portfolio(portfolio_id));

CREATE POLICY "reports: portfolio admins can manage"
  ON reports FOR UPDATE
  USING (user_portfolio_role(portfolio_id) IN ('admin','owner') AND deleted_at IS NULL)
  WITH CHECK (user_portfolio_role(portfolio_id) IN ('admin','owner'));

-- ---------------------------------------------------------------------------
-- report_templates — reusable report configurations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_templates (
  id           uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  portfolio_id uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  created_by   uuid REFERENCES auth.users(id),

  name         text NOT NULL,
  description  text,
  scope        text NOT NULL DEFAULT 'portfolio'
               CHECK (scope IN ('portfolio', 'holding', 'sector')),
  config       jsonb NOT NULL DEFAULT '{}',
  is_default   boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_report_templates_portfolio_id ON report_templates (portfolio_id);

CREATE TRIGGER trg_report_templates_updated_at
  BEFORE UPDATE ON report_templates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE report_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_templates: portfolio members can view"
  ON report_templates FOR SELECT TO authenticated
  USING (can_view_portfolio(portfolio_id));

CREATE POLICY "report_templates: portfolio editors can manage"
  ON report_templates FOR ALL TO authenticated
  USING (can_edit_portfolio(portfolio_id))
  WITH CHECK (can_edit_portfolio(portfolio_id));

CREATE POLICY "report_templates: service role full access"
  ON report_templates FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON report_templates TO authenticated;
GRANT ALL ON report_templates TO service_role;

-- ---------------------------------------------------------------------------
-- generated_documents — generated report and export documents
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS generated_documents (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at        timestamptz NOT NULL DEFAULT now(),

  portfolio_id      uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  template_id       uuid REFERENCES report_templates(id) ON DELETE SET NULL,
  holding_id        uuid REFERENCES holdings(id) ON DELETE SET NULL,
  generated_by      uuid REFERENCES auth.users(id),

  title             text NOT NULL,
  document_type     text NOT NULL DEFAULT 'report'
                    CHECK (document_type IN ('report', 'export')),
  format            text NOT NULL DEFAULT 'html'
                    CHECK (format IN ('html', 'csv', 'json', 'xlsx', 'pdf')),
  scope             text NOT NULL DEFAULT 'portfolio'
                    CHECK (scope IN ('portfolio', 'holding', 'sector')),
  sector            text,

  content           jsonb,
  config            jsonb NOT NULL DEFAULT '{}',
  file_size_bytes   integer,

  status            text NOT NULL DEFAULT 'generated'
                    CHECK (status IN ('generated', 'archived')),
  generated_at      timestamptz NOT NULL DEFAULT now(),
  expires_at        timestamptz,

  is_public         boolean NOT NULL DEFAULT false,
  share_token       text UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex')
);

CREATE INDEX idx_generated_documents_portfolio_id ON generated_documents (portfolio_id);
CREATE INDEX idx_generated_documents_share_token ON generated_documents (share_token) WHERE is_public = true;
CREATE INDEX idx_generated_documents_status ON generated_documents (portfolio_id, status);

ALTER TABLE generated_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "generated_documents: portfolio members can view"
  ON generated_documents FOR SELECT TO authenticated
  USING (
    can_view_portfolio(portfolio_id)
    OR (is_public = true AND (expires_at IS NULL OR expires_at > now()))
  );

CREATE POLICY "generated_documents: portfolio editors can manage"
  ON generated_documents FOR ALL TO authenticated
  USING (can_edit_portfolio(portfolio_id))
  WITH CHECK (can_edit_portfolio(portfolio_id));

CREATE POLICY "generated_documents: service role full access"
  ON generated_documents FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON generated_documents TO authenticated;
GRANT ALL ON generated_documents TO service_role;

-- ---------------------------------------------------------------------------
-- report_schedules — recurring report generation schedules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS report_schedules (
  id               uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),

  portfolio_id     uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  template_id      uuid NOT NULL REFERENCES report_templates(id) ON DELETE CASCADE,
  created_by       uuid REFERENCES auth.users(id),

  name             text NOT NULL,
  frequency        text NOT NULL
                   CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
  day_of_week      integer CHECK (day_of_week BETWEEN 0 AND 6),
  day_of_month     integer CHECK (day_of_month BETWEEN 1 AND 31),
  time_of_day      time,
  timezone         text NOT NULL DEFAULT 'UTC',

  delivery_method  text CHECK (delivery_method IN ('store', 'email', 'both')),
  recipients       jsonb NOT NULL DEFAULT '[]',

  is_active        boolean NOT NULL DEFAULT true,
  last_run_at      timestamptz,
  next_run_at      timestamptz,
  run_count        integer NOT NULL DEFAULT 0,
  last_error       text
);

CREATE INDEX idx_report_schedules_portfolio_id ON report_schedules (portfolio_id);
CREATE INDEX idx_report_schedules_next_run ON report_schedules (next_run_at) WHERE is_active = true;

CREATE TRIGGER trg_report_schedules_updated_at
  BEFORE UPDATE ON report_schedules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "report_schedules: portfolio members can view"
  ON report_schedules FOR SELECT TO authenticated
  USING (can_view_portfolio(portfolio_id));

CREATE POLICY "report_schedules: portfolio editors can manage"
  ON report_schedules FOR ALL TO authenticated
  USING (can_edit_portfolio(portfolio_id))
  WITH CHECK (can_edit_portfolio(portfolio_id));

CREATE POLICY "report_schedules: service role full access"
  ON report_schedules FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON report_schedules TO authenticated;
GRANT ALL ON report_schedules TO service_role;
