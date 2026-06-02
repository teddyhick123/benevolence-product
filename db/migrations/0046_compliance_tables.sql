-- Migration: Compliance Module Tables
-- Description: Creates compliance_profiles, disqualified_persons, self_dealing_incidents,
--              payout_history, qualifying_distributions, expenditure_responsibility_grants,
--              and views: v_compliance_dashboard, v_upcoming_filing_deadlines, v_er_grant_compliance.
--              Fixes Cm-B1 and Cm-B2.
-- Date: 2026-06-02

-- ---------------------------------------------------------------------------
-- compliance_profiles — per-org compliance configuration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.compliance_profiles (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  org_id                uuid        NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,

  foundation_type       text        CHECK (foundation_type IN ('private_foundation', 'public_charity', 'daf', 'community_foundation', 'other')),
  fiscal_year_end_month integer     CHECK (fiscal_year_end_month BETWEEN 1 AND 12),
  fiscal_year_end_day   integer     CHECK (fiscal_year_end_day BETWEEN 1 AND 31),
  state_of_incorporation text,
  registered_states     text[]      NOT NULL DEFAULT '{}',

  auto_flag_self_dealing boolean    NOT NULL DEFAULT true,
  er_grant_tracking     boolean     NOT NULL DEFAULT false,

  notes                 text
);

CREATE INDEX IF NOT EXISTS idx_compliance_profiles_org_id ON public.compliance_profiles (org_id);

ALTER TABLE public.compliance_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "compliance_profiles: org members can view"
  ON public.compliance_profiles FOR SELECT TO authenticated
  USING (public.can_view_org(org_id));

CREATE POLICY "compliance_profiles: org admins can manage"
  ON public.compliance_profiles FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "compliance_profiles: service role full access"
  ON public.compliance_profiles FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.compliance_profiles TO authenticated;
GRANT ALL ON public.compliance_profiles TO service_role;

CREATE TRIGGER set_compliance_profiles_updated_at
  BEFORE UPDATE ON public.compliance_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- disqualified_persons — IRC §4946 tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.disqualified_persons (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  org_id            uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  full_name         text        NOT NULL,
  relationship_type text        NOT NULL
                                CHECK (relationship_type IN (
                                  'substantial_contributor', 'foundation_manager',
                                  '20pct_owner', 'family_member', 'corporation',
                                  'partnership', 'trust', 'other'
                                )),
  title             text,
  ownership_pct     numeric(5,2),
  is_active         boolean     NOT NULL DEFAULT true,
  start_date        date,
  end_date          date,
  notes             text
);

CREATE INDEX IF NOT EXISTS idx_disqualified_persons_org_id    ON public.disqualified_persons (org_id);
CREATE INDEX IF NOT EXISTS idx_disqualified_persons_is_active ON public.disqualified_persons (org_id, is_active);

ALTER TABLE public.disqualified_persons ENABLE ROW LEVEL SECURITY;

CREATE POLICY "disqualified_persons: org members can view"
  ON public.disqualified_persons FOR SELECT TO authenticated
  USING (public.can_view_org(org_id));

CREATE POLICY "disqualified_persons: org admins can manage"
  ON public.disqualified_persons FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "disqualified_persons: service role full access"
  ON public.disqualified_persons FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.disqualified_persons TO authenticated;
GRANT ALL ON public.disqualified_persons TO service_role;

CREATE TRIGGER set_disqualified_persons_updated_at
  BEFORE UPDATE ON public.disqualified_persons
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- self_dealing_incidents — IRC §4941 incident log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.self_dealing_incidents (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),

  org_id               uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  disqualified_person_id uuid      REFERENCES public.disqualified_persons(id) ON DELETE SET NULL,

  incident_date        date        NOT NULL,
  description          text        NOT NULL,
  transaction_type     text        CHECK (transaction_type IN (
                                     'sale_exchange', 'lease', 'loan', 'compensation',
                                     'goods_services', 'use_of_assets', 'other'
                                   )),
  amount_usd           numeric(15,2),
  status               text        NOT NULL DEFAULT 'flagged'
                                   CHECK (status IN ('flagged', 'confirmed', 'dismissed', 'corrected')),
  correction_date      date,
  correction_notes     text,
  reported_on_990pf    boolean     NOT NULL DEFAULT false,
  notes                text
);

CREATE INDEX IF NOT EXISTS idx_self_dealing_org_id ON public.self_dealing_incidents (org_id);
CREATE INDEX IF NOT EXISTS idx_self_dealing_status ON public.self_dealing_incidents (org_id, status);

ALTER TABLE public.self_dealing_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "self_dealing_incidents: org members can view"
  ON public.self_dealing_incidents FOR SELECT TO authenticated
  USING (public.can_view_org(org_id));

CREATE POLICY "self_dealing_incidents: org admins can manage"
  ON public.self_dealing_incidents FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "self_dealing_incidents: service role full access"
  ON public.self_dealing_incidents FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.self_dealing_incidents TO authenticated;
GRANT ALL ON public.self_dealing_incidents TO service_role;

CREATE TRIGGER set_self_dealing_incidents_updated_at
  BEFORE UPDATE ON public.self_dealing_incidents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- payout_history — IRC §4942 mandatory distribution tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payout_history (
  id                              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                      timestamptz NOT NULL DEFAULT now(),
  updated_at                      timestamptz NOT NULL DEFAULT now(),

  portfolio_id                    uuid        NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  tax_year                        integer     NOT NULL,

  net_value_non_charitable        numeric(15,2),
  minimum_investment_return       numeric(15,2),
  distributable_amount            numeric(15,2),
  qualifying_distributions_made   numeric(15,2),
  excess_distributions            numeric(15,2),
  underdistribution               numeric(15,2),

  carryover_from_prior_year       numeric(15,2),
  excess_applied_to_prior_year    numeric(15,2),

  is_finalized                    boolean     NOT NULL DEFAULT false,
  notes                           text,

  UNIQUE (portfolio_id, tax_year)
);

CREATE INDEX IF NOT EXISTS idx_payout_history_portfolio_id ON public.payout_history (portfolio_id);

ALTER TABLE public.payout_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payout_history: portfolio members can view"
  ON public.payout_history FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

CREATE POLICY "payout_history: portfolio editors can manage"
  ON public.payout_history FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

CREATE POLICY "payout_history: service role full access"
  ON public.payout_history FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payout_history TO authenticated;
GRANT ALL ON public.payout_history TO service_role;

CREATE TRIGGER set_payout_history_updated_at
  BEFORE UPDATE ON public.payout_history
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- qualifying_distributions — per-grant/payment qualifying distribution records
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qualifying_distributions (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  portfolio_id        uuid        NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  grant_id            uuid        REFERENCES public.grants(id) ON DELETE SET NULL,
  tax_year            integer     NOT NULL,
  distribution_date   date        NOT NULL,
  qualifying_amount   numeric(15,2) NOT NULL CHECK (qualifying_amount > 0),
  distribution_type   text        CHECK (distribution_type IN (
                                    'grant', 'program_expense', 'asset_purchase',
                                    'set_aside', 'other'
                                  )),
  description         text,
  notes               text
);

CREATE INDEX IF NOT EXISTS idx_qualifying_distributions_portfolio_id ON public.qualifying_distributions (portfolio_id);
CREATE INDEX IF NOT EXISTS idx_qualifying_distributions_tax_year     ON public.qualifying_distributions (portfolio_id, tax_year);

ALTER TABLE public.qualifying_distributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qualifying_distributions: portfolio members can view"
  ON public.qualifying_distributions FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

CREATE POLICY "qualifying_distributions: portfolio editors can manage"
  ON public.qualifying_distributions FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

CREATE POLICY "qualifying_distributions: service role full access"
  ON public.qualifying_distributions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.qualifying_distributions TO authenticated;
GRANT ALL ON public.qualifying_distributions TO service_role;

CREATE TRIGGER set_qualifying_distributions_updated_at
  BEFORE UPDATE ON public.qualifying_distributions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- expenditure_responsibility_grants — IRC §4945 ER grant tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.expenditure_responsibility_grants (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),

  portfolio_id                uuid        NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  grant_id                    uuid        NOT NULL UNIQUE REFERENCES public.grants(id) ON DELETE CASCADE,

  grantee_ein                 text,
  grantee_is_public_charity   boolean     NOT NULL DEFAULT false,
  grantee_501c3_verified      boolean     NOT NULL DEFAULT false,
  grantee_501c3_verified_at   date,

  er_agreement_signed_date    date,
  er_agreement_url            text,

  er_reports_required         boolean     NOT NULL DEFAULT true,
  er_report_frequency         text        CHECK (er_report_frequency IN ('monthly', 'quarterly', 'semi_annual', 'annual')),
  er_reports_required_count   integer     NOT NULL DEFAULT 0,
  er_reports_received_count   integer     NOT NULL DEFAULT 0,

  terminal_report_required    boolean     NOT NULL DEFAULT true,
  terminal_report_received    boolean     NOT NULL DEFAULT false,
  terminal_report_date        date,

  er_status                   text        NOT NULL DEFAULT 'pending_agreement'
                                          CHECK (er_status IN (
                                            'pending_agreement', 'active', 'reporting_overdue',
                                            'completed', 'terminated'
                                          )),
  notes                       text
);

CREATE INDEX IF NOT EXISTS idx_er_grants_portfolio_id ON public.expenditure_responsibility_grants (portfolio_id);
CREATE INDEX IF NOT EXISTS idx_er_grants_status       ON public.expenditure_responsibility_grants (portfolio_id, er_status);

ALTER TABLE public.expenditure_responsibility_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "er_grants: portfolio members can view"
  ON public.expenditure_responsibility_grants FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

CREATE POLICY "er_grants: portfolio editors can manage"
  ON public.expenditure_responsibility_grants FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

CREATE POLICY "er_grants: service role full access"
  ON public.expenditure_responsibility_grants FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenditure_responsibility_grants TO authenticated;
GRANT ALL ON public.expenditure_responsibility_grants TO service_role;

CREATE TRIGGER set_er_grants_updated_at
  BEFORE UPDATE ON public.expenditure_responsibility_grants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- v_compliance_dashboard — aggregate compliance health per org
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_compliance_dashboard
  WITH (security_invoker = true)
AS
SELECT
  o.id                                                          AS org_id,
  cp.foundation_type,
  cp.registered_states,
  COUNT(DISTINCT dp.id) FILTER (WHERE dp.is_active)            AS active_disqualified_persons,
  COUNT(DISTINCT sd.id) FILTER (WHERE sd.status IN ('flagged', 'confirmed')) AS open_self_dealing_incidents,
  COUNT(DISTINCT fc.id) FILTER (WHERE fc.status = 'pending' AND fc.due_date <= (now() + interval '90 days'))
                                                                AS upcoming_filings_90d,
  COUNT(DISTINCT fc.id) FILTER (WHERE fc.status = 'overdue')   AS overdue_filings
FROM public.organizations              o
LEFT JOIN public.compliance_profiles   cp ON cp.org_id = o.id
LEFT JOIN public.disqualified_persons  dp ON dp.org_id = o.id
LEFT JOIN public.self_dealing_incidents sd ON sd.org_id = o.id
LEFT JOIN public.filing_calendar       fc ON fc.org_id = o.id
GROUP BY o.id, cp.foundation_type, cp.registered_states;

GRANT SELECT ON public.v_compliance_dashboard TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- v_upcoming_filing_deadlines — next 90-day filing window per org
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_upcoming_filing_deadlines
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
  (fc.due_date - CURRENT_DATE)                                  AS days_until_due
FROM public.filing_calendar fc
WHERE fc.status IN ('pending', 'in_progress')
  AND fc.due_date >= CURRENT_DATE
  AND fc.due_date <= CURRENT_DATE + interval '90 days'
ORDER BY fc.due_date;

GRANT SELECT ON public.v_upcoming_filing_deadlines TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- v_er_grant_compliance — ER grant status per portfolio
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_er_grant_compliance
  WITH (security_invoker = true)
AS
SELECT
  er.portfolio_id,
  er.id,
  er.grant_id,
  g.name                                                        AS grant_name,
  er.grantee_ein,
  er.grantee_is_public_charity,
  er.grantee_501c3_verified,
  er.er_agreement_signed_date,
  er.er_reports_required_count,
  er.er_reports_received_count,
  (er.er_reports_required_count - er.er_reports_received_count) AS reports_outstanding,
  er.terminal_report_required,
  er.terminal_report_received,
  er.er_status,
  er.notes
FROM public.expenditure_responsibility_grants er
JOIN public.grants g ON g.id = er.grant_id;

GRANT SELECT ON public.v_er_grant_compliance TO authenticated, service_role;
