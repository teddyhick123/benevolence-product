-- Migration: Compliance & Regulatory Module
-- Description: IRC §4942 payout tracking, §4941 self-dealing, §4945 expenditure responsibility,
--              filing calendar, state registrations, disqualified persons registry, 990-PF assembly
-- Date: 2026-03-04

-- ============================================================
-- 1. ENUMS
-- ============================================================

DO $$ BEGIN
  CREATE TYPE public.entity_type_enum AS ENUM (
    'private_foundation', 'public_charity', 'daf_sponsor'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.foundation_classification_enum AS ENUM (
    'operating', 'non_operating', 'conduit', 'exempt_operating'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.disqualified_person_relationship_enum AS ENUM (
    'founder', 'substantial_contributor', 'foundation_manager', 'twenty_pct_owner',
    'family_member', 'thirty_five_pct_owned_entity', 'government_official'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.filing_type_enum AS ENUM (
    '990_pf', '990', '990_ez', '990_n', '990_t',
    'state_annual_report', 'state_registration', 'state_renewal', 'state_990_copy',
    'form_4720', 'form_5227', 'form_8868', 'other'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.filing_status_enum AS ENUM (
    'pending', 'in_progress', 'filed', 'filed_late', 'extended', 'overdue', 'not_required'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.qualifying_distribution_category_enum AS ENUM (
    'grants_paid', 'grants_paid_er', 'program_expenses', 'admin_expenses',
    'set_aside', 'program_related_investment', 'operating_foundation_expenditure'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.self_dealing_transaction_type_enum AS ENUM (
    'sale_or_exchange', 'loan_or_extension_of_credit', 'furnishing_goods_services',
    'payment_of_compensation', 'transfer_or_use_of_assets', 'agreement_to_pay_money',
    'indirect_self_dealing'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.self_dealing_status_enum AS ENUM (
    'flagged', 'cleared', 'confirmed', 'corrected', 'excise_tax_assessed'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.state_registration_status_enum AS ENUM (
    'registered', 'renewal_pending', 'renewal_overdue', 'exempt',
    'not_registered', 'lapsed', 'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ============================================================
-- 2. ORG-SCOPED TABLES
-- ============================================================

-- 2a. compliance_profiles — one row per organization
CREATE TABLE IF NOT EXISTS public.compliance_profiles (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id                 UUID NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_type                     public.entity_type_enum NOT NULL DEFAULT 'private_foundation',
  foundation_classification       public.foundation_classification_enum,
  fiscal_year_end_month           SMALLINT NOT NULL DEFAULT 12
                                    CHECK (fiscal_year_end_month BETWEEN 1 AND 12),
  ein_confirmed                   BOOLEAN NOT NULL DEFAULT false,
  irs_determination_date          DATE,
  irs_determination_letter_url    TEXT,
  -- Public charity support test classification
  public_support_test             TEXT CHECK (public_support_test IN ('509a1', '509a2', '509a3')),
  -- DAF fields
  daf_distribution_policy_pct     NUMERIC(5,2),
  -- Multi-jurisdictional
  is_foreign_private_foundation   BOOLEAN NOT NULL DEFAULT false,
  operates_in_multiple_states     BOOLEAN NOT NULL DEFAULT false,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_compliance_profiles_org_id
  ON public.compliance_profiles(organization_id);

ALTER TABLE public.compliance_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "compliance_profiles_read" ON public.compliance_profiles;
CREATE POLICY "compliance_profiles_read" ON public.compliance_profiles
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "compliance_profiles_write" ON public.compliance_profiles;
CREATE POLICY "compliance_profiles_write" ON public.compliance_profiles
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "compliance_profiles_service" ON public.compliance_profiles;
CREATE POLICY "compliance_profiles_service" ON public.compliance_profiles
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_profiles TO authenticated;
GRANT ALL ON public.compliance_profiles TO service_role;

CREATE TRIGGER set_compliance_profiles_updated_at
  BEFORE UPDATE ON public.compliance_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2b. disqualified_persons — IRC §4946 registry
CREATE TABLE IF NOT EXISTS public.disqualified_persons (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  full_name               TEXT NOT NULL,
  relationship_type       public.disqualified_person_relationship_enum NOT NULL,
  title_or_role           TEXT,
  ein                     TEXT,
  ssn_last4               CHAR(4),
  related_to_person_id    UUID REFERENCES public.disqualified_persons(id) ON DELETE SET NULL,
  start_date              DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date                DATE,
  is_active               BOOLEAN GENERATED ALWAYS AS (
                            end_date IS NULL OR end_date > CURRENT_DATE
                          ) STORED,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_disqualified_persons_org_id
  ON public.disqualified_persons(organization_id);

CREATE INDEX IF NOT EXISTS idx_disqualified_persons_active
  ON public.disqualified_persons(organization_id)
  WHERE end_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_disqualified_persons_name_gin
  ON public.disqualified_persons USING GIN (to_tsvector('english', full_name));

ALTER TABLE public.disqualified_persons ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "disqualified_persons_read" ON public.disqualified_persons;
CREATE POLICY "disqualified_persons_read" ON public.disqualified_persons
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "disqualified_persons_write" ON public.disqualified_persons;
CREATE POLICY "disqualified_persons_write" ON public.disqualified_persons
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "disqualified_persons_service" ON public.disqualified_persons;
CREATE POLICY "disqualified_persons_service" ON public.disqualified_persons
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.disqualified_persons TO authenticated;
GRANT ALL ON public.disqualified_persons TO service_role;

CREATE TRIGGER set_disqualified_persons_updated_at
  BEFORE UPDATE ON public.disqualified_persons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2c. filing_calendar — federal + state deadlines
CREATE TABLE IF NOT EXISTS public.filing_calendar (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  filing_type         public.filing_type_enum NOT NULL,
  tax_year            SMALLINT NOT NULL,
  jurisdiction        TEXT NOT NULL DEFAULT 'federal',
  description         TEXT,
  due_date            DATE NOT NULL,
  extended_due_date   DATE,
  reminder_days       INTEGER[] NOT NULL DEFAULT '{90,30,14,7}',
  status              public.filing_status_enum NOT NULL DEFAULT 'pending',
  filed_date          DATE,
  filed_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  confirmation_number TEXT,
  document_url        TEXT,
  is_recurring        BOOLEAN NOT NULL DEFAULT false,
  recurrence_rule     TEXT,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_filing_calendar_org_id
  ON public.filing_calendar(organization_id);

CREATE INDEX IF NOT EXISTS idx_filing_calendar_due_active
  ON public.filing_calendar(organization_id, due_date)
  WHERE status NOT IN ('filed', 'not_required');

ALTER TABLE public.filing_calendar ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "filing_calendar_read" ON public.filing_calendar;
CREATE POLICY "filing_calendar_read" ON public.filing_calendar
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "filing_calendar_write" ON public.filing_calendar;
CREATE POLICY "filing_calendar_write" ON public.filing_calendar
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "filing_calendar_service" ON public.filing_calendar;
CREATE POLICY "filing_calendar_service" ON public.filing_calendar
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.filing_calendar TO authenticated;
GRANT ALL ON public.filing_calendar TO service_role;

CREATE TRIGGER set_filing_calendar_updated_at
  BEFORE UPDATE ON public.filing_calendar
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2d. self_dealing_incidents — audit log (never hard-delete)
CREATE TABLE IF NOT EXISTS public.self_dealing_incidents (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  disqualified_person_id      UUID REFERENCES public.disqualified_persons(id) ON DELETE SET NULL,
  disqualified_person_name    TEXT NOT NULL,
  incident_date               DATE NOT NULL,
  discovered_date             DATE NOT NULL DEFAULT CURRENT_DATE,
  transaction_type            public.self_dealing_transaction_type_enum NOT NULL,
  amount                      NUMERIC(15,2),
  description                 TEXT NOT NULL,
  grant_id                    UUID REFERENCES public.grant_details(id) ON DELETE SET NULL,
  status                      public.self_dealing_status_enum NOT NULL DEFAULT 'flagged',
  reviewed_by                 UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  review_notes                TEXT,
  initial_excise_tax_due      NUMERIC(15,2) GENERATED ALWAYS AS (
                                CASE WHEN amount IS NOT NULL THEN ROUND(amount * 0.10, 2) ELSE NULL END
                              ) STORED,
  correction_excise_tax_due   NUMERIC(15,2) GENERATED ALWAYS AS (
                                CASE WHEN amount IS NOT NULL THEN ROUND(amount * 2.00, 2) ELSE NULL END
                              ) STORED,
  reported_on_form_4720       BOOLEAN NOT NULL DEFAULT false,
  ai_flagged                  BOOLEAN NOT NULL DEFAULT false,
  ai_flag_reasoning           TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_self_dealing_incidents_org_id
  ON public.self_dealing_incidents(organization_id);

CREATE INDEX IF NOT EXISTS idx_self_dealing_incidents_status
  ON public.self_dealing_incidents(organization_id, status);

ALTER TABLE public.self_dealing_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "self_dealing_incidents_read" ON public.self_dealing_incidents;
CREATE POLICY "self_dealing_incidents_read" ON public.self_dealing_incidents
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "self_dealing_incidents_write" ON public.self_dealing_incidents;
CREATE POLICY "self_dealing_incidents_write" ON public.self_dealing_incidents
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "self_dealing_incidents_service" ON public.self_dealing_incidents;
CREATE POLICY "self_dealing_incidents_service" ON public.self_dealing_incidents
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.self_dealing_incidents TO authenticated;
GRANT ALL ON public.self_dealing_incidents TO service_role;

CREATE TRIGGER set_self_dealing_incidents_updated_at
  BEFORE UPDATE ON public.self_dealing_incidents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2e. state_registrations
CREATE TABLE IF NOT EXISTS public.state_registrations (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id         UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  state_code              CHAR(2) NOT NULL,
  state_name              TEXT NOT NULL,
  registration_number     TEXT,
  status                  public.state_registration_status_enum NOT NULL DEFAULT 'not_registered',
  registration_date       DATE,
  expiration_date         DATE,
  annual_report_due       DATE,
  annual_report_fee       NUMERIC(10,2),
  annual_report_filed     DATE,
  solicits_in_state       BOOLEAN NOT NULL DEFAULT false,
  gross_revenue_in_state  NUMERIC(15,2),
  exempt_threshold        NUMERIC(15,2),
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(organization_id, state_code)
);

CREATE INDEX IF NOT EXISTS idx_state_registrations_org_id
  ON public.state_registrations(organization_id);

CREATE INDEX IF NOT EXISTS idx_state_registrations_expiry_active
  ON public.state_registrations(organization_id, expiration_date)
  WHERE status NOT IN ('exempt', 'not_registered', 'lapsed');

ALTER TABLE public.state_registrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "state_registrations_read" ON public.state_registrations;
CREATE POLICY "state_registrations_read" ON public.state_registrations
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "state_registrations_write" ON public.state_registrations;
CREATE POLICY "state_registrations_write" ON public.state_registrations
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "state_registrations_service" ON public.state_registrations;
CREATE POLICY "state_registrations_service" ON public.state_registrations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.state_registrations TO authenticated;
GRANT ALL ON public.state_registrations TO service_role;

CREATE TRIGGER set_state_registrations_updated_at
  BEFORE UPDATE ON public.state_registrations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 3. PORTFOLIO-SCOPED TABLES
-- ============================================================

-- 3a. expenditure_responsibility_grants — IRC §4945 ER tracking
CREATE TABLE IF NOT EXISTS public.expenditure_responsibility_grants (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id                UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  grant_id                    UUID NOT NULL UNIQUE REFERENCES public.grant_details(id) ON DELETE CASCADE,
  grantee_is_public_charity   BOOLEAN NOT NULL DEFAULT false,
  grantee_ein                 TEXT,
  grantee_501c3_verified      BOOLEAN NOT NULL DEFAULT false,
  grantee_501c3_verified_at   TIMESTAMPTZ,
  er_agreement_required       BOOLEAN GENERATED ALWAYS AS (NOT grantee_is_public_charity) STORED,
  er_agreement_signed_date    DATE,
  er_agreement_url            TEXT,
  er_reports_required         BOOLEAN NOT NULL DEFAULT true,
  er_report_frequency         TEXT CHECK (er_report_frequency IN ('annual', 'semi_annual', 'quarterly', 'upon_expenditure')),
  er_reports_required_count   SMALLINT NOT NULL DEFAULT 0,
  er_reports_received_count   SMALLINT NOT NULL DEFAULT 0,
  terminal_report_required    BOOLEAN NOT NULL DEFAULT true,
  terminal_report_received    BOOLEAN NOT NULL DEFAULT false,
  terminal_report_date        DATE,
  er_status                   TEXT NOT NULL DEFAULT 'pending'
                                CHECK (er_status IN ('pending', 'compliant', 'deficient', 'waived')),
  notes                       TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_er_grants_portfolio_id
  ON public.expenditure_responsibility_grants(portfolio_id);

CREATE INDEX IF NOT EXISTS idx_er_grants_grant_id
  ON public.expenditure_responsibility_grants(grant_id);

CREATE INDEX IF NOT EXISTS idx_er_grants_status
  ON public.expenditure_responsibility_grants(portfolio_id, er_status);

ALTER TABLE public.expenditure_responsibility_grants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "er_grants_read" ON public.expenditure_responsibility_grants;
CREATE POLICY "er_grants_read" ON public.expenditure_responsibility_grants
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_members pm
      WHERE pm.portfolio_id = portfolio_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "er_grants_write" ON public.expenditure_responsibility_grants;
CREATE POLICY "er_grants_write" ON public.expenditure_responsibility_grants
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "er_grants_service" ON public.expenditure_responsibility_grants;
CREATE POLICY "er_grants_service" ON public.expenditure_responsibility_grants
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenditure_responsibility_grants TO authenticated;
GRANT ALL ON public.expenditure_responsibility_grants TO service_role;

CREATE TRIGGER set_er_grants_updated_at
  BEFORE UPDATE ON public.expenditure_responsibility_grants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3b. qualifying_distributions — itemized payout ledger
CREATE TABLE IF NOT EXISTS public.qualifying_distributions (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id            UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  tax_year                SMALLINT NOT NULL,
  grant_payment_id        UUID REFERENCES public.grant_payments(id) ON DELETE SET NULL,
  holding_id              UUID REFERENCES public.holdings(id) ON DELETE SET NULL,
  category                public.qualifying_distribution_category_enum NOT NULL,
  description             TEXT NOT NULL,
  gross_amount            NUMERIC(15,2) NOT NULL CHECK (gross_amount >= 0),
  qualifying_amount       NUMERIC(15,2) NOT NULL CHECK (qualifying_amount >= 0),
  excluded_amount         NUMERIC(15,2) GENERATED ALWAYS AS (gross_amount - qualifying_amount) STORED,
  distribution_date       DATE NOT NULL,
  approved_by_board       BOOLEAN NOT NULL DEFAULT false,
  board_approval_date     DATE,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_qualifying_distributions_portfolio_year
  ON public.qualifying_distributions(portfolio_id, tax_year);

CREATE INDEX IF NOT EXISTS idx_qualifying_distributions_date
  ON public.qualifying_distributions(distribution_date);

CREATE INDEX IF NOT EXISTS idx_qualifying_distributions_category
  ON public.qualifying_distributions(portfolio_id, tax_year, category);

ALTER TABLE public.qualifying_distributions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "qualifying_distributions_read" ON public.qualifying_distributions;
CREATE POLICY "qualifying_distributions_read" ON public.qualifying_distributions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_members pm
      WHERE pm.portfolio_id = portfolio_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "qualifying_distributions_write" ON public.qualifying_distributions;
CREATE POLICY "qualifying_distributions_write" ON public.qualifying_distributions
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "qualifying_distributions_service" ON public.qualifying_distributions;
CREATE POLICY "qualifying_distributions_service" ON public.qualifying_distributions
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.qualifying_distributions TO authenticated;
GRANT ALL ON public.qualifying_distributions TO service_role;

CREATE TRIGGER set_qualifying_distributions_updated_at
  BEFORE UPDATE ON public.qualifying_distributions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3c. payout_history — canonical annual §4942 ledger
CREATE TABLE IF NOT EXISTS public.payout_history (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id                    UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  tax_year                        SMALLINT NOT NULL,
  -- Asset base for MIR calculation
  avg_fair_market_value           NUMERIC(18,2) NOT NULL DEFAULT 0,
  investment_assets               NUMERIC(18,2) NOT NULL DEFAULT 0,
  cash_and_equivalents            NUMERIC(18,2) NOT NULL DEFAULT 0,
  corpus_add_back                 NUMERIC(18,2) NOT NULL DEFAULT 0,
  acquisition_indebtedness        NUMERIC(18,2) NOT NULL DEFAULT 0,
  net_value_non_charitable        NUMERIC(18,2) NOT NULL DEFAULT 0,
  -- MIR = net_value_non_charitable * 0.05
  minimum_investment_return       NUMERIC(18,2) GENERATED ALWAYS AS (
                                    ROUND(net_value_non_charitable * 0.05, 2)
                                  ) STORED,
  -- Distributable amount = MIR - excise_tax_paid
  excise_tax_paid                 NUMERIC(18,2) NOT NULL DEFAULT 0,
  distributable_amount            NUMERIC(18,2) GENERATED ALWAYS AS (
                                    ROUND((net_value_non_charitable * 0.05) - excise_tax_paid, 2)
                                  ) STORED,
  -- Actual distributions
  qualifying_distributions_total  NUMERIC(18,2) NOT NULL DEFAULT 0,
  grants_total                    NUMERIC(18,2) NOT NULL DEFAULT 0,
  program_expenses_total          NUMERIC(18,2) NOT NULL DEFAULT 0,
  admin_qualifying_total          NUMERIC(18,2) NOT NULL DEFAULT 0,
  set_asides_total                NUMERIC(18,2) NOT NULL DEFAULT 0,
  -- Surplus or deficit
  surplus_or_deficit              NUMERIC(18,2) GENERATED ALWAYS AS (
                                    ROUND(qualifying_distributions_total - ((net_value_non_charitable * 0.05) - excise_tax_paid), 2)
                                  ) STORED,
  -- Carryover
  carryover_from_prior_years      NUMERIC(18,2) NOT NULL DEFAULT 0,
  carryover_to_next_year          NUMERIC(18,2) NOT NULL DEFAULT 0,
  carryover_expires_year          SMALLINT,
  -- Lock row when year is complete
  is_year_complete                BOOLEAN NOT NULL DEFAULT false,
  notes                           TEXT,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(portfolio_id, tax_year)
);

CREATE INDEX IF NOT EXISTS idx_payout_history_portfolio_year
  ON public.payout_history(portfolio_id, tax_year);

ALTER TABLE public.payout_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payout_history_read" ON public.payout_history;
CREATE POLICY "payout_history_read" ON public.payout_history
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_members pm
      WHERE pm.portfolio_id = portfolio_id
        AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "payout_history_write" ON public.payout_history;
CREATE POLICY "payout_history_write" ON public.payout_history
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "payout_history_service" ON public.payout_history;
CREATE POLICY "payout_history_service" ON public.payout_history
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payout_history TO authenticated;
GRANT ALL ON public.payout_history TO service_role;

CREATE TRIGGER set_payout_history_updated_at
  BEFORE UPDATE ON public.payout_history
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================
-- 4. VIEWS
-- ============================================================

-- 4a. v_compliance_dashboard — org-level health summary
CREATE OR REPLACE VIEW public.v_compliance_dashboard AS
SELECT
  o.id                                                   AS organization_id,
  o.name                                                 AS organization_name,
  -- Filing overdue count
  (SELECT COUNT(*)
     FROM public.filing_calendar fc
    WHERE fc.organization_id = o.id
      AND fc.status = 'overdue')                         AS filings_overdue,
  -- Filings due within 30 days
  (SELECT COUNT(*)
     FROM public.filing_calendar fc
    WHERE fc.organization_id = o.id
      AND fc.status NOT IN ('filed', 'not_required', 'overdue')
      AND fc.due_date <= CURRENT_DATE + INTERVAL '30 days'
      AND fc.due_date > CURRENT_DATE)                   AS filings_due_soon,
  -- Self-dealing incidents flagged
  (SELECT COUNT(*)
     FROM public.self_dealing_incidents sdi
    WHERE sdi.organization_id = o.id
      AND sdi.status = 'flagged')                       AS incidents_flagged,
  -- Self-dealing confirmed
  (SELECT COUNT(*)
     FROM public.self_dealing_incidents sdi
    WHERE sdi.organization_id = o.id
      AND sdi.status = 'confirmed')                     AS incidents_confirmed,
  -- State renewals overdue
  (SELECT COUNT(*)
     FROM public.state_registrations sr
    WHERE sr.organization_id = o.id
      AND sr.status = 'renewal_overdue')                AS state_renewals_overdue,
  -- Active disqualified persons
  (SELECT COUNT(*)
     FROM public.disqualified_persons dp
    WHERE dp.organization_id = o.id
      AND dp.is_active = true)                          AS active_disqualified_persons,
  -- Compliance health score (0-100)
  GREATEST(0, 100
    - COALESCE((SELECT COUNT(*) FROM public.filing_calendar fc
                WHERE fc.organization_id = o.id AND fc.status = 'overdue'), 0) * 15
    - COALESCE((SELECT COUNT(*) FROM public.self_dealing_incidents sdi
                WHERE sdi.organization_id = o.id AND sdi.status IN ('flagged', 'confirmed')), 0) * 20
    - COALESCE((SELECT COUNT(*) FROM public.state_registrations sr
                WHERE sr.organization_id = o.id AND sr.status = 'renewal_overdue'), 0) * 10
  )::INTEGER                                            AS compliance_health_score
FROM public.organizations o;

-- 4b. v_payout_status — real-time §4942 progress per portfolio per year
CREATE OR REPLACE VIEW public.v_payout_status AS
SELECT
  ph.portfolio_id,
  ph.tax_year,
  ph.distributable_amount,
  ph.minimum_investment_return,
  ph.net_value_non_charitable,
  -- Sum qualifying distributions recorded for this year
  COALESCE((
    SELECT SUM(qd.qualifying_amount)
      FROM public.qualifying_distributions qd
     WHERE qd.portfolio_id = ph.portfolio_id
       AND qd.tax_year = ph.tax_year
  ), 0)                                                 AS distributions_to_date,
  -- Shortfall
  GREATEST(0, ph.distributable_amount - COALESCE((
    SELECT SUM(qd.qualifying_amount)
      FROM public.qualifying_distributions qd
     WHERE qd.portfolio_id = ph.portfolio_id
       AND qd.tax_year = ph.tax_year
  ), 0))                                                AS shortfall,
  -- Pct complete
  CASE
    WHEN ph.distributable_amount > 0
    THEN LEAST(100, ROUND(
      COALESCE((
        SELECT SUM(qd.qualifying_amount)
          FROM public.qualifying_distributions qd
         WHERE qd.portfolio_id = ph.portfolio_id
           AND qd.tax_year = ph.tax_year
      ), 0) / ph.distributable_amount * 100, 1
    ))
    ELSE 100
  END                                                   AS pct_complete,
  -- Days remaining in fiscal year (approximate: uses Dec 31 of tax_year)
  GREATEST(0, (DATE(ph.tax_year || '-12-31') - CURRENT_DATE)::INTEGER)
                                                        AS days_remaining
FROM public.payout_history ph;

-- 4c. v_upcoming_filing_deadlines
CREATE OR REPLACE VIEW public.v_upcoming_filing_deadlines AS
SELECT
  fc.*,
  CASE
    WHEN fc.due_date <= CURRENT_DATE                        THEN 'overdue'
    WHEN fc.due_date <= CURRENT_DATE + INTERVAL '7 days'   THEN 'critical'
    WHEN fc.due_date <= CURRENT_DATE + INTERVAL '14 days'  THEN 'high'
    WHEN fc.due_date <= CURRENT_DATE + INTERVAL '30 days'  THEN 'medium'
    ELSE 'low'
  END AS urgency,
  (fc.due_date - CURRENT_DATE)::INTEGER AS days_until_due
FROM public.filing_calendar fc
WHERE fc.status NOT IN ('filed', 'not_required')
  AND (fc.due_date <= CURRENT_DATE + INTERVAL '90 days' OR fc.status = 'overdue')
ORDER BY fc.due_date ASC;

-- 4d. v_er_grant_compliance — ER tracking joined with grants
CREATE OR REPLACE VIEW public.v_er_grant_compliance AS
SELECT
  erg.*,
  gd.holding_id,
  h.name                                                AS grantee_name,
  h.funds_allocated                                     AS grant_amount,
  -- Computed compliance flags
  (erg.er_agreement_required AND erg.er_agreement_signed_date IS NULL)
                                                        AS agreement_missing,
  (erg.er_reports_required AND erg.er_reports_received_count < erg.er_reports_required_count)
                                                        AS reports_deficient,
  (erg.terminal_report_required AND NOT erg.terminal_report_received
    AND gd.grant_period_end IS NOT NULL AND gd.grant_period_end < CURRENT_DATE)
                                                        AS terminal_report_overdue
FROM public.expenditure_responsibility_grants erg
JOIN public.grant_details gd ON gd.id = erg.grant_id
JOIN public.holdings h ON h.id = gd.holding_id;
