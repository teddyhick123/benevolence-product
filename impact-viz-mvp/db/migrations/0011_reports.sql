-- =============================================================================
-- 0011_reports.sql
-- Generated portfolio reports (PDF snapshots, AI narrative reports, etc.)
-- Depends on: 0001, 0004
-- =============================================================================

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
