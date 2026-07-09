-- =============================================================================
-- 0016_compliance.sql
-- Regulatory compliance: filing calendar and state registrations.
-- Module-gated: org_has_module(org_id, 'compliance').
-- Depends on: 0001, 0002
-- =============================================================================

-- ---------------------------------------------------------------------------
-- filing_calendar — regulatory filing deadlines
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS filing_calendar (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Filing details
  filing_type     text NOT NULL,
  -- 'form_990', 'form_990_pf', 'form_990_t', 'state_annual_report',
  -- 'state_charitable_registration', 'irs_extension', 'excise_tax', 'other'

  title           text NOT NULL,
  description     text,
  jurisdiction    text,            -- 'federal', 'CA', 'NY', etc.

  -- Dates
  due_date        date NOT NULL,
  extension_due_date date,
  period_start    date,
  period_end      date,

  -- Status
  status          text NOT NULL DEFAULT 'upcoming',
  -- 'upcoming', 'in_progress', 'filed', 'extended', 'overdue', 'waived', 'not_applicable'
  completed_at    timestamptz,
  completed_by    uuid REFERENCES auth.users(id),
  completed_by_name text,
  filing_reference text,           -- confirmation number / EFIN

  -- Reminders
  reminder_days   int[] DEFAULT '{30,14,7}',  -- days before due_date to remind
  last_reminded_at timestamptz,

  -- Attachments
  attachments     jsonb,           -- array of storage paths

  notes           text,
  is_recurring    boolean NOT NULL DEFAULT false,
  recurrence_rule text             -- iCal RRULE string for auto-generation
);

CREATE INDEX idx_filing_calendar_org_id      ON filing_calendar (org_id);
CREATE INDEX idx_filing_calendar_due_date    ON filing_calendar (due_date);
CREATE INDEX idx_filing_calendar_status      ON filing_calendar (org_id, status);
CREATE INDEX idx_filing_calendar_upcoming    ON filing_calendar (org_id, due_date)
  WHERE status IN ('upcoming','in_progress','extended');

CREATE TRIGGER trg_filing_calendar_updated_at
  BEFORE UPDATE ON filing_calendar
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- state_registrations — charitable solicitation registrations by state
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS state_registrations (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  state           text NOT NULL,
  registration_number text,
  registration_type text NOT NULL DEFAULT 'charitable_solicitation',

  status          text NOT NULL DEFAULT 'active',
  -- 'active', 'pending', 'renewal_due', 'expired', 'exempt', 'not_registered'

  registration_date   date,
  expiration_date     date,
  renewal_due_date    date,
  last_renewed_date   date,

  -- Financial thresholds (some states require registration above a $ threshold)
  exemption_basis text,            -- 'small_org', 'religious', 'member_funded', etc.
  annual_fee      numeric(10,2),

  notes           text,
  attachments     jsonb,

  UNIQUE (org_id, state, registration_type)
);

CREATE INDEX idx_state_registrations_org_id  ON state_registrations (org_id);
CREATE INDEX idx_state_registrations_status  ON state_registrations (org_id, status);
CREATE INDEX idx_state_registrations_renewal ON state_registrations (renewal_due_date)
  WHERE status IN ('active','renewal_due');

CREATE TRIGGER trg_state_registrations_updated_at
  BEFORE UPDATE ON state_registrations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- compliance_profiles — per-org compliance configuration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compliance_profiles (
  id                    uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  org_id                uuid NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,

  foundation_type       text CHECK (foundation_type IN ('private_foundation', 'public_charity', 'daf', 'community_foundation', 'other')),
  fiscal_year_end_month integer CHECK (fiscal_year_end_month BETWEEN 1 AND 12),
  fiscal_year_end_day   integer CHECK (fiscal_year_end_day BETWEEN 1 AND 31),
  state_of_incorporation text,
  registered_states     text[] NOT NULL DEFAULT '{}',

  auto_flag_self_dealing boolean NOT NULL DEFAULT true,
  er_grant_tracking     boolean NOT NULL DEFAULT false,

  notes                 text
);

CREATE INDEX idx_compliance_profiles_org_id ON compliance_profiles (org_id);

CREATE TRIGGER trg_compliance_profiles_updated_at
  BEFORE UPDATE ON compliance_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- disqualified_persons — IRC §4946 tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS disqualified_persons (
  id                uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  org_id            uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  full_name         text NOT NULL,
  relationship_type text NOT NULL
                    CHECK (relationship_type IN (
                      'substantial_contributor', 'foundation_manager',
                      '20pct_owner', 'family_member', 'corporation',
                      'partnership', 'trust', 'other'
                    )),
  title             text,
  ownership_pct     numeric(5,2),
  is_active         boolean NOT NULL DEFAULT true,
  start_date        date,
  end_date          date,
  notes             text
);

CREATE INDEX idx_disqualified_persons_org_id ON disqualified_persons (org_id);
CREATE INDEX idx_disqualified_persons_is_active ON disqualified_persons (org_id, is_active);

CREATE OR REPLACE FUNCTION sync_disqualified_person_active_state()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.end_date IS NOT NULL THEN
    NEW.is_active := false;
  ELSIF NEW.is_active = false THEN
    NEW.end_date := CURRENT_DATE;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_disqualified_persons_active_state
  BEFORE INSERT OR UPDATE OF is_active, end_date ON disqualified_persons
  FOR EACH ROW EXECUTE FUNCTION sync_disqualified_person_active_state();

CREATE TRIGGER trg_disqualified_persons_updated_at
  BEFORE UPDATE ON disqualified_persons
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- self_dealing_incidents — IRC §4941 incident log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS self_dealing_incidents (
  id                   uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  org_id               uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  disqualified_person_id uuid REFERENCES disqualified_persons(id) ON DELETE SET NULL,

  incident_date        date NOT NULL,
  description          text NOT NULL,
  transaction_type     text CHECK (transaction_type IN (
                         'sale_exchange', 'lease', 'loan', 'compensation',
                         'goods_services', 'use_of_assets', 'other'
                       )),
  amount_usd           numeric(15,2),
  status               text NOT NULL DEFAULT 'flagged'
                       CHECK (status IN ('flagged', 'confirmed', 'dismissed', 'corrected')),
  correction_date      date,
  correction_notes     text,
  reported_on_990pf    boolean NOT NULL DEFAULT false,
  notes                text
);

CREATE INDEX idx_self_dealing_org_id ON self_dealing_incidents (org_id);
CREATE INDEX idx_self_dealing_status ON self_dealing_incidents (org_id, status);

CREATE TRIGGER trg_self_dealing_incidents_updated_at
  BEFORE UPDATE ON self_dealing_incidents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- payout_history — IRC §4942 mandatory distribution tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payout_history (
  id                              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),

  portfolio_id                    uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  tax_year                        integer NOT NULL,

  net_value_non_charitable        numeric(15,2),
  minimum_investment_return       numeric(15,2),
  distributable_amount            numeric(15,2),
  qualifying_distributions_made   numeric(15,2),
  excess_distributions            numeric(15,2),
  underdistribution               numeric(15,2),

  carryover_from_prior_year       numeric(15,2),
  excess_applied_to_prior_year    numeric(15,2),

  is_finalized                    boolean NOT NULL DEFAULT false,
  notes                           text,

  UNIQUE (portfolio_id, tax_year)
);

CREATE INDEX idx_payout_history_portfolio_id ON payout_history (portfolio_id);

CREATE TRIGGER trg_payout_history_updated_at
  BEFORE UPDATE ON payout_history
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE filing_calendar ENABLE ROW LEVEL SECURITY;
CREATE POLICY "filing_calendar: org members can view + module check"
  ON filing_calendar FOR SELECT
  USING (can_view_org(org_id) AND org_has_module(org_id, 'compliance'));
CREATE POLICY "filing_calendar: org admins can manage"
  ON filing_calendar FOR ALL
  USING (is_org_admin(org_id) AND org_has_module(org_id, 'compliance'))
  WITH CHECK (is_org_admin(org_id) AND org_has_module(org_id, 'compliance'));

ALTER TABLE state_registrations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "state_registrations: org members can view + module check"
  ON state_registrations FOR SELECT
  USING (can_view_org(org_id) AND org_has_module(org_id, 'compliance'));
CREATE POLICY "state_registrations: org admins can manage"
  ON state_registrations FOR ALL
  USING (is_org_admin(org_id) AND org_has_module(org_id, 'compliance'))
  WITH CHECK (is_org_admin(org_id) AND org_has_module(org_id, 'compliance'));

ALTER TABLE compliance_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "compliance_profiles: org members can view"
  ON compliance_profiles FOR SELECT TO authenticated
  USING (can_view_org(org_id));
CREATE POLICY "compliance_profiles: org admins can manage"
  ON compliance_profiles FOR ALL TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));
CREATE POLICY "compliance_profiles: service role full access"
  ON compliance_profiles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE disqualified_persons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "disqualified_persons: org members can view"
  ON disqualified_persons FOR SELECT TO authenticated
  USING (can_view_org(org_id));
CREATE POLICY "disqualified_persons: org admins can manage"
  ON disqualified_persons FOR ALL TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));
CREATE POLICY "disqualified_persons: service role full access"
  ON disqualified_persons FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE self_dealing_incidents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "self_dealing_incidents: org members can view"
  ON self_dealing_incidents FOR SELECT TO authenticated
  USING (can_view_org(org_id));
CREATE POLICY "self_dealing_incidents: org admins can manage"
  ON self_dealing_incidents FOR ALL TO authenticated
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));
CREATE POLICY "self_dealing_incidents: service role full access"
  ON self_dealing_incidents FOR ALL TO service_role
  USING (true) WITH CHECK (true);

ALTER TABLE payout_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "payout_history: portfolio members can view"
  ON payout_history FOR SELECT TO authenticated
  USING (can_view_portfolio(portfolio_id));
CREATE POLICY "payout_history: portfolio editors can manage"
  ON payout_history FOR ALL TO authenticated
  USING (can_edit_portfolio(portfolio_id))
  WITH CHECK (can_edit_portfolio(portfolio_id));
CREATE POLICY "payout_history: service role full access"
  ON payout_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON compliance_profiles TO authenticated;
GRANT ALL ON compliance_profiles TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON disqualified_persons TO authenticated;
GRANT ALL ON disqualified_persons TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON self_dealing_incidents TO authenticated;
GRANT ALL ON self_dealing_incidents TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON payout_history TO authenticated;
GRANT ALL ON payout_history TO service_role;

-- ---------------------------------------------------------------------------
-- Compliance reporting views
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_compliance_dashboard
  WITH (security_invoker = true)
AS
SELECT
  o.id AS org_id,
  cp.foundation_type,
  cp.registered_states,
  COUNT(DISTINCT dp.id) FILTER (WHERE dp.is_active) AS active_disqualified_persons,
  COUNT(DISTINCT sd.id) FILTER (WHERE sd.status IN ('flagged', 'confirmed')) AS open_self_dealing_incidents,
  COUNT(DISTINCT fc.id) FILTER (WHERE fc.status IN ('upcoming', 'in_progress', 'extended') AND fc.due_date <= (now() + interval '90 days')) AS upcoming_filings_90d,
  COUNT(DISTINCT fc.id) FILTER (WHERE fc.status = 'overdue') AS overdue_filings
FROM organizations o
LEFT JOIN compliance_profiles cp ON cp.org_id = o.id
LEFT JOIN disqualified_persons dp ON dp.org_id = o.id
LEFT JOIN self_dealing_incidents sd ON sd.org_id = o.id
LEFT JOIN filing_calendar fc ON fc.org_id = o.id
GROUP BY o.id, cp.foundation_type, cp.registered_states;

GRANT SELECT ON v_compliance_dashboard TO authenticated, service_role;

CREATE OR REPLACE VIEW v_upcoming_filing_deadlines
  WITH (security_invoker = true)
AS
SELECT
  fc.org_id,
  fc.id,
  fc.filing_type,
  fc.description,
  fc.due_date,
  fc.status,
  fc.jurisdiction,
  (fc.due_date - CURRENT_DATE) AS days_until_due
FROM filing_calendar fc
WHERE fc.status IN ('upcoming', 'in_progress', 'extended')
  AND fc.due_date >= CURRENT_DATE
  AND fc.due_date <= CURRENT_DATE + interval '90 days'
ORDER BY fc.due_date;

GRANT SELECT ON v_upcoming_filing_deadlines TO authenticated, service_role;
