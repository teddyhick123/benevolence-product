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
