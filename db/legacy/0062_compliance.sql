-- Migration: Filing Calendar and State Registrations tables

-- ============================================================================
-- 1. FILING_CALENDAR TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.filing_calendar (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  filing_type TEXT NOT NULL CHECK (filing_type IN ('form_990pf', 'form_990', 'form_990ez', 'state_registration', 'state_filing', 'form_8283', 'other')),
  tax_year INTEGER NOT NULL,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filed', 'overdue', 'n_a', 'extension_filed')),

  -- Details
  description TEXT,
  filing_jurisdiction TEXT,  -- 'federal' or state abbr e.g. 'CA'
  extension_due_date DATE,
  filed_date DATE,
  filed_by TEXT,
  confirmation_number TEXT,
  notes TEXT,

  -- Reminders
  reminder_days INTEGER[] DEFAULT '{30, 14, 7}',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_filing_calendar_org ON public.filing_calendar(organization_id);
CREATE INDEX idx_filing_calendar_due ON public.filing_calendar(organization_id, due_date);
CREATE INDEX idx_filing_calendar_status ON public.filing_calendar(organization_id, status);

-- ============================================================================
-- 2. STATE_REGISTRATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.state_registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  state TEXT NOT NULL,   -- two-letter state code

  -- Registration details
  registration_number TEXT,
  registered_name TEXT,
  registration_date DATE,
  expiration_date DATE,
  renewal_due_date DATE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filed', 'overdue', 'n_a', 'extension_filed')),

  -- Annual filing requirement
  annual_report_due DATE,
  annual_report_filed DATE,
  filing_fee NUMERIC CHECK (filing_fee >= 0),

  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE(organization_id, state)
);

CREATE INDEX idx_state_registrations_org ON public.state_registrations(organization_id);
CREATE INDEX idx_state_registrations_expiration ON public.state_registrations(organization_id, expiration_date);

-- ============================================================================
-- 3. TRIGGERS
-- ============================================================================
CREATE TRIGGER update_filing_calendar_updated_at BEFORE UPDATE ON public.filing_calendar
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_state_registrations_updated_at BEFORE UPDATE ON public.state_registrations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 4. ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.filing_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.state_registrations ENABLE ROW LEVEL SECURITY;

-- filing_calendar RLS
DROP POLICY IF EXISTS "org_members_can_read_filing_calendar" ON public.filing_calendar;
CREATE POLICY "org_members_can_read_filing_calendar" ON public.filing_calendar
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = filing_calendar.organization_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org_admins_can_manage_filing_calendar" ON public.filing_calendar;
CREATE POLICY "org_admins_can_manage_filing_calendar" ON public.filing_calendar
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = filing_calendar.organization_id AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- state_registrations RLS
DROP POLICY IF EXISTS "org_members_can_read_state_registrations" ON public.state_registrations;
CREATE POLICY "org_members_can_read_state_registrations" ON public.state_registrations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = state_registrations.organization_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org_admins_can_manage_state_registrations" ON public.state_registrations;
CREATE POLICY "org_admins_can_manage_state_registrations" ON public.state_registrations
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = state_registrations.organization_id AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );
