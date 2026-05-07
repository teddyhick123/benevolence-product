-- =============================================================================
-- 0009_grants.sql
-- Grant management — for foundations making grants to nonprofits.
-- Also covers DAF recommendations and program-related investments (PRIs).
-- Depends on: 0001, 0004, 0006
-- =============================================================================

CREATE TYPE grant_status_enum AS ENUM (
  'draft',
  'pending_approval',
  'approved',
  'paid',
  'denied',
  'cancelled',
  'completed'
);

-- ---------------------------------------------------------------------------
-- grants
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grants (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  portfolio_id    uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,

  -- Link to holding when grant is tracked as a position
  holding_id      uuid REFERENCES holdings(id) ON DELETE SET NULL,

  -- Grantee info
  grantee_name    text NOT NULL,
  grantee_ein     text,
  grantee_address text,

  -- Grant details
  grant_number    text UNIQUE,    -- internal reference
  grant_type      text NOT NULL DEFAULT 'general_support',
  -- 'general_support', 'project', 'capacity_building', 'emergency', 'pri', 'mri', 'daf_recommendation'

  status          grant_status_enum NOT NULL DEFAULT 'draft',
  amount          numeric(20,4) NOT NULL,
  currency        text NOT NULL DEFAULT 'USD',

  -- Dates
  approved_date   date,
  payment_date    date,
  report_due_date date,
  period_start    date,
  period_end      date,

  -- Purpose & reporting
  purpose         text,
  restrictions    text,           -- 'unrestricted', 'restricted to...'
  reporting_requirements text,
  notes           text,

  -- Approval chain
  approved_by     uuid REFERENCES auth.users(id),
  approved_at     timestamptz,

  -- External tracking
  external_id     text,
  source_system   text,

  deleted_at      timestamptz,
  deleted_by      uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_grants_org_id       ON grants (org_id)       WHERE deleted_at IS NULL;
CREATE INDEX idx_grants_portfolio_id ON grants (portfolio_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_grants_holding_id   ON grants (holding_id)   WHERE holding_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_grants_status       ON grants (status)       WHERE deleted_at IS NULL;
CREATE INDEX idx_grants_grantee_ein  ON grants (grantee_ein)  WHERE grantee_ein IS NOT NULL;

CREATE TRIGGER trg_grants_updated_at
  BEFORE UPDATE ON grants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- grant_reports — grantee progress/final reports
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS grant_reports (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  grant_id        uuid NOT NULL REFERENCES grants(id) ON DELETE CASCADE,
  report_type     text NOT NULL DEFAULT 'progress',  -- 'progress', 'final', 'financial'
  report_date     date NOT NULL,
  due_date        date,
  received_at     timestamptz,
  content         text,
  attachments     jsonb,          -- array of storage paths
  notes           text
);

CREATE INDEX idx_grant_reports_grant_id ON grant_reports (grant_id);

CREATE TRIGGER trg_grant_reports_updated_at
  BEFORE UPDATE ON grant_reports
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE grants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grants: portfolio members can view"
  ON grants FOR SELECT
  USING (can_view_portfolio(portfolio_id) AND deleted_at IS NULL);
CREATE POLICY "grants: portfolio members (member+) can manage"
  ON grants FOR ALL
  USING (can_edit_portfolio(portfolio_id) AND deleted_at IS NULL)
  WITH CHECK (can_edit_portfolio(portfolio_id));

ALTER TABLE grant_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "grant_reports: inherit from grant"
  ON grant_reports FOR SELECT
  USING (can_view_portfolio((SELECT portfolio_id FROM grants WHERE id = grant_id)));
CREATE POLICY "grant_reports: portfolio members (member+) can manage"
  ON grant_reports FOR ALL
  USING (can_edit_portfolio((SELECT portfolio_id FROM grants WHERE id = grant_id)))
  WITH CHECK (can_edit_portfolio((SELECT portfolio_id FROM grants WHERE id = grant_id)));
