-- =============================================================================
-- 0013_tax_contributions.sql
-- Charitable tax deduction tracking, AGI limit support, Form 8283 metadata,
-- carryforwards, and tax document storage.
-- Module-gated: requires org_has_module(org_id, 'tax').
-- Depends on: 0001, 0004, 0006, 0012
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Shared helper: derive org_id from portfolio_id for strict org-scoped rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_tax_org_id_from_portfolio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT p.org_id INTO v_org_id
  FROM public.portfolios p
  WHERE p.id = NEW.portfolio_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Portfolio % does not exist', NEW.portfolio_id;
  END IF;

  IF NEW.org_id IS NOT NULL AND NEW.org_id <> v_org_id THEN
    RAISE EXCEPTION 'org_id % does not match portfolio %', NEW.org_id, NEW.portfolio_id;
  END IF;

  NEW.org_id := v_org_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_holding_contribution_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_portfolio_id UUID;
  v_org_id UUID;
  v_contribution_date DATE;
BEGIN
  IF NEW.portfolio_id IS NULL AND NEW.holding_id IS NOT NULL THEN
    SELECT h.portfolio_id INTO v_portfolio_id
    FROM public.holdings h
    WHERE h.id = NEW.holding_id;
  END IF;

  IF v_portfolio_id IS NULL AND NEW.tax_contribution_id IS NOT NULL THEN
    SELECT tc.portfolio_id, tc.contribution_date
    INTO v_portfolio_id, v_contribution_date
    FROM public.tax_contributions tc
    WHERE tc.id = NEW.tax_contribution_id;
  END IF;

  NEW.portfolio_id := COALESCE(NEW.portfolio_id, v_portfolio_id);
  NEW.contribution_date := COALESCE(NEW.contribution_date, v_contribution_date, CURRENT_DATE);

  SELECT p.org_id INTO v_org_id
  FROM public.portfolios p
  WHERE p.id = NEW.portfolio_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Unable to derive portfolio/org scope for holding contribution';
  END IF;

  IF NEW.org_id IS NOT NULL AND NEW.org_id <> v_org_id THEN
    RAISE EXCEPTION 'org_id % does not match portfolio %', NEW.org_id, NEW.portfolio_id;
  END IF;

  NEW.org_id := v_org_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_tax_contribution_defaults()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  SELECT p.org_id INTO v_org_id
  FROM public.portfolios p
  WHERE p.id = NEW.portfolio_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Portfolio % does not exist', NEW.portfolio_id;
  END IF;

  IF NEW.org_id IS NOT NULL AND NEW.org_id <> v_org_id THEN
    RAISE EXCEPTION 'org_id % does not match portfolio %', NEW.org_id, NEW.portfolio_id;
  END IF;

  NEW.org_id := v_org_id;
  NEW.tax_year := COALESCE(NEW.tax_year, EXTRACT(YEAR FROM NEW.contribution_date)::INT);
  NEW.applied_to_tax_year := COALESCE(NEW.applied_to_tax_year, NEW.tax_year);
  NEW.deductible_amount := COALESCE(
    NEW.deductible_amount,
    GREATEST(NEW.amount_usd - COALESCE(NEW.quid_pro_quo_value, 0), 0)
  );

  IF NEW.agi_limit_category IS NULL THEN
    NEW.agi_limit_category := CASE
      WHEN NEW.contribution_type IN ('cash', 'check', 'wire') AND COALESCE(NEW.recipient_type, '501c3_public') <> '501c3_private_foundation'
        THEN '60_cash'
      WHEN NEW.contribution_type IN ('cash', 'check', 'wire')
        THEN '30_foundation_cash'
      WHEN COALESCE(NEW.recipient_type, '501c3_public') = '501c3_private_foundation'
        THEN '20_foundation_property'
      ELSE '30_appreciated'
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- tax_profiles — per-portfolio/year planning inputs for tax optimization.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tax_profiles (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id            UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  org_id                  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tax_year                INTEGER NOT NULL CHECK (tax_year >= 1900 AND tax_year <= 2100),
  filing_status           TEXT CHECK (filing_status IN ('single', 'married_joint', 'married_separate', 'head_of_household')),
  estimated_agi           NUMERIC(20,2) CHECK (estimated_agi >= 0),
  carryforward_from_prior NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (carryforward_from_prior >= 0),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portfolio_id, tax_year)
);

CREATE INDEX IF NOT EXISTS idx_tax_profiles_portfolio_year ON public.tax_profiles(portfolio_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_tax_profiles_org_id ON public.tax_profiles(org_id);

CREATE TRIGGER trg_tax_profiles_org_id
  BEFORE INSERT OR UPDATE OF portfolio_id, org_id ON public.tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_tax_org_id_from_portfolio();

CREATE TRIGGER trg_tax_profiles_updated_at
  BEFORE UPDATE ON public.tax_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tax_years — AGI and tax planning detail per year.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tax_years (
  id                                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id                      UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  org_id                            UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tax_year                          INTEGER NOT NULL CHECK (tax_year >= 1900 AND tax_year <= 2100),
  adjusted_gross_income             NUMERIC(20,2) CHECK (adjusted_gross_income >= 0),
  filing_status                     TEXT CHECK (filing_status IN (
                                      'single',
                                      'married_joint',
                                      'married_separate',
                                      'married_filing_jointly',
                                      'married_filing_separately',
                                      'head_of_household',
                                      'qualifying_widow'
                                    )),
  agi_limit_60_pct                  NUMERIC(20,2) GENERATED ALWAYS AS (adjusted_gross_income * 0.60) STORED,
  agi_limit_50_pct                  NUMERIC(20,2) GENERATED ALWAYS AS (adjusted_gross_income * 0.50) STORED,
  agi_limit_30_pct                  NUMERIC(20,2) GENERATED ALWAYS AS (adjusted_gross_income * 0.30) STORED,
  agi_limit_20_pct                  NUMERIC(20,2) GENERATED ALWAYS AS (adjusted_gross_income * 0.20) STORED,
  standard_deduction                NUMERIC(20,2) CHECK (standard_deduction >= 0),
  amt_exposure                      BOOLEAN NOT NULL DEFAULT false,
  amt_notes                         TEXT,
  total_contributions_60_pct        NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (total_contributions_60_pct >= 0),
  total_contributions_50_pct        NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (total_contributions_50_pct >= 0),
  total_contributions_30_pct        NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (total_contributions_30_pct >= 0),
  total_contributions_20_pct        NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (total_contributions_20_pct >= 0),
  carryforward_from_prior_years     NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (carryforward_from_prior_years >= 0),
  notes                             TEXT,
  created_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portfolio_id, tax_year)
);

CREATE INDEX IF NOT EXISTS idx_tax_years_portfolio_year ON public.tax_years(portfolio_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_tax_years_org_id ON public.tax_years(org_id);
CREATE INDEX IF NOT EXISTS idx_tax_years_year ON public.tax_years(tax_year);

CREATE TRIGGER trg_tax_years_org_id
  BEFORE INSERT OR UPDATE OF portfolio_id, org_id ON public.tax_years
  FOR EACH ROW EXECUTE FUNCTION public.set_tax_org_id_from_portfolio();

CREATE TRIGGER trg_tax_years_updated_at
  BEFORE UPDATE ON public.tax_years
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tax_contributions — one row per deductible gift/contribution.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tax_contributions (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id                UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  org_id                      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  holding_id                  UUID REFERENCES public.holdings(id) ON DELETE SET NULL,
  holding_contribution_id     UUID,
  tax_year                    INTEGER NOT NULL CHECK (tax_year >= 1900 AND tax_year <= 2100),
  contribution_date           DATE NOT NULL,

  recipient_name              TEXT NOT NULL,
  recipient_ein               TEXT,
  recipient_type              TEXT CHECK (recipient_type IN ('501c3_public', '501c3_private_foundation', 'daf', 'other')),
  is_qualified_organization   BOOLEAN NOT NULL DEFAULT true,

  contribution_type           TEXT NOT NULL CHECK (contribution_type IN ('cash', 'check', 'wire', 'stock', 'crypto', 'real_estate', 'other_property')),
  amount_usd                  NUMERIC(20,2) NOT NULL CHECK (amount_usd > 0),
  fmv_at_donation             NUMERIC(20,2) CHECK (fmv_at_donation >= 0),
  fair_market_value           NUMERIC(20,2) GENERATED ALWAYS AS (COALESCE(fmv_at_donation, amount_usd)) STORED,
  cost_basis                  NUMERIC(20,2) CHECK (cost_basis >= 0),
  date_acquired               DATE,
  property_description        TEXT,
  description_of_property     TEXT GENERATED ALWAYS AS (property_description) STORED,
  currency                    TEXT NOT NULL DEFAULT 'USD',

  receipt_storage_path        TEXT,
  acknowledgment_received     BOOLEAN NOT NULL DEFAULT false,
  acknowledgment_date         DATE,
  acknowledgment_storage_path TEXT,
  quid_pro_quo_value          NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (quid_pro_quo_value >= 0),

  requires_appraisal          BOOLEAN NOT NULL DEFAULT false,
  appraisal_storage_path      TEXT,
  appraisal_date              DATE,
  appraisal_value             NUMERIC(20,2) CHECK (appraisal_value >= 0),
  appraiser_name              TEXT,
  appraiser_tin               TEXT,
  appraiser_ein               TEXT,
  form8283_required           BOOLEAN GENERATED ALWAYS AS (
                                contribution_type NOT IN ('cash', 'check', 'wire')
                                AND COALESCE(fmv_at_donation, amount_usd) > 500
                              ) STORED,

  qcd_qualified               BOOLEAN NOT NULL DEFAULT false,
  is_qcd                      BOOLEAN GENERATED ALWAYS AS (qcd_qualified) STORED,
  qcd_distribution_amount     NUMERIC(20,2) CHECK (qcd_distribution_amount >= 0),

  deductible_amount           NUMERIC(20,2) CHECK (deductible_amount >= 0),
  applied_to_tax_year         INTEGER CHECK (applied_to_tax_year >= 1900 AND applied_to_tax_year <= 2100),
  agi_limit_category          TEXT CHECK (agi_limit_category IN ('60_cash', '50_conservation', '30_appreciated', '30_foundation_cash', '20_foundation_property')),
  agi_limit_percentage        NUMERIC(5,2) GENERATED ALWAYS AS (
                                CASE agi_limit_category
                                  WHEN '60_cash' THEN 60
                                  WHEN '50_conservation' THEN 50
                                  WHEN '30_appreciated' THEN 30
                                  WHEN '30_foundation_cash' THEN 30
                                  WHEN '20_foundation_property' THEN 20
                                  ELSE NULL
                                END
                              ) STORED,

  is_carryforward             BOOLEAN NOT NULL DEFAULT false,
  carryforward_year           INTEGER,
  notes                       TEXT,
  external_id                 TEXT,
  source_system               TEXT,
  qb_exported_at              TIMESTAMPTZ,
  qb_journal_entry_id         TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_contributions_portfolio_year ON public.tax_contributions(portfolio_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_tax_contributions_org_id ON public.tax_contributions(org_id);
CREATE INDEX IF NOT EXISTS idx_tax_contributions_holding_id ON public.tax_contributions(holding_id) WHERE holding_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tax_contributions_date ON public.tax_contributions(contribution_date DESC);
CREATE INDEX IF NOT EXISTS idx_tax_contributions_recipient_ein ON public.tax_contributions(recipient_ein) WHERE recipient_ein IS NOT NULL;

CREATE TRIGGER trg_tax_contributions_defaults
  BEFORE INSERT OR UPDATE OF portfolio_id, org_id, contribution_date, tax_year, amount_usd, quid_pro_quo_value, deductible_amount, recipient_type, contribution_type, agi_limit_category
  ON public.tax_contributions
  FOR EACH ROW EXECUTE FUNCTION public.set_tax_contribution_defaults();

CREATE TRIGGER trg_tax_contributions_updated_at
  BEFORE UPDATE ON public.tax_contributions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- holding_contributions — optional link between investment holdings and tax gifts.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.holding_contributions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id        UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  holding_id          UUID REFERENCES public.holdings(id) ON DELETE SET NULL,
  tax_contribution_id UUID REFERENCES public.tax_contributions(id) ON DELETE CASCADE,
  amount_usd          NUMERIC(20,2) NOT NULL CHECK (amount_usd > 0),
  contribution_date   DATE NOT NULL,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holding_contributions_portfolio ON public.holding_contributions(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_holding_contributions_holding ON public.holding_contributions(holding_id) WHERE holding_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_holding_contributions_tax_contribution ON public.holding_contributions(tax_contribution_id) WHERE tax_contribution_id IS NOT NULL;

CREATE TRIGGER trg_holding_contributions_scope
  BEFORE INSERT OR UPDATE OF portfolio_id, org_id, holding_id, tax_contribution_id, contribution_date
  ON public.holding_contributions
  FOR EACH ROW EXECUTE FUNCTION public.set_holding_contribution_scope();

CREATE TRIGGER trg_holding_contributions_updated_at
  BEFORE UPDATE ON public.holding_contributions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tax_carryforwards — multi-year unused deduction carryforwards.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tax_carryforwards (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id          UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tax_contribution_id   UUID REFERENCES public.tax_contributions(id) ON DELETE SET NULL,
  originating_tax_year  INTEGER NOT NULL CHECK (originating_tax_year >= 1900 AND originating_tax_year <= 2100),
  amount                NUMERIC(20,2) NOT NULL CHECK (amount >= 0),
  amount_remaining      NUMERIC(20,2) NOT NULL CHECK (amount_remaining >= 0 AND amount_remaining <= amount),
  amount_used_in_year   NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (amount_used_in_year >= 0),
  used_in_year          INTEGER,
  agi_limit_category    TEXT NOT NULL CHECK (agi_limit_category IN ('60_cash', '50_conservation', '30_appreciated', '30_foundation_cash', '20_foundation_property')),
  expires_tax_year      INTEGER NOT NULL CHECK (expires_tax_year >= 1900 AND expires_tax_year <= 2100),
  recipient_name        TEXT,
  recipient_ein         TEXT,
  auto_generated        BOOLEAN NOT NULL DEFAULT false,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_carryforwards_portfolio ON public.tax_carryforwards(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_tax_carryforwards_expiration ON public.tax_carryforwards(portfolio_id, expires_tax_year);
CREATE INDEX IF NOT EXISTS idx_tax_carryforwards_remaining ON public.tax_carryforwards(portfolio_id, amount_remaining) WHERE amount_remaining > 0;

CREATE TRIGGER trg_tax_carryforwards_org_id
  BEFORE INSERT OR UPDATE OF portfolio_id, org_id ON public.tax_carryforwards
  FOR EACH ROW EXECUTE FUNCTION public.set_tax_org_id_from_portfolio();

CREATE TRIGGER trg_tax_carryforwards_updated_at
  BEFORE UPDATE ON public.tax_carryforwards
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- DAF grants and foundation 990-PF data.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.daf_grants (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id          UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  daf_name              TEXT NOT NULL,
  daf_account_number    TEXT,
  contribution_date     DATE NOT NULL,
  contribution_amount   NUMERIC(20,2) NOT NULL CHECK (contribution_amount > 0),
  contribution_type     TEXT CHECK (contribution_type IN ('cash', 'check', 'wire', 'stock', 'crypto', 'real_estate', 'other_property')),
  tax_contribution_id   UUID REFERENCES public.tax_contributions(id) ON DELETE SET NULL,
  grant_date            DATE,
  grant_recipient       TEXT,
  grant_recipient_ein   TEXT,
  grant_amount          NUMERIC(20,2) CHECK (grant_amount > 0),
  holding_id            UUID REFERENCES public.holdings(id) ON DELETE SET NULL,
  status                TEXT NOT NULL DEFAULT 'contributed' CHECK (status IN ('contributed', 'granted', 'partially_granted')),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daf_grants_portfolio ON public.daf_grants(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_daf_grants_org_id ON public.daf_grants(org_id);
CREATE INDEX IF NOT EXISTS idx_daf_grants_contribution_date ON public.daf_grants(contribution_date);

CREATE TRIGGER trg_daf_grants_org_id
  BEFORE INSERT OR UPDATE OF portfolio_id, org_id ON public.daf_grants
  FOR EACH ROW EXECUTE FUNCTION public.set_tax_org_id_from_portfolio();

CREATE TRIGGER trg_daf_grants_updated_at
  BEFORE UPDATE ON public.daf_grants
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.foundation_990pf_data (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id              UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  org_id                    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tax_year                  INTEGER NOT NULL CHECK (tax_year >= 1900 AND tax_year <= 2100),
  net_investment_income     NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (net_investment_income >= 0),
  excise_tax_rate           NUMERIC(5,2) NOT NULL DEFAULT 1.39 CHECK (excise_tax_rate >= 0 AND excise_tax_rate <= 100),
  excise_tax_amount         NUMERIC(20,2) CHECK (excise_tax_amount >= 0),
  fair_market_value_assets  NUMERIC(20,2) CHECK (fair_market_value_assets >= 0),
  required_payout           NUMERIC(20,2) CHECK (required_payout >= 0),
  actual_payout             NUMERIC(20,2) CHECK (actual_payout >= 0),
  payout_deficit            NUMERIC(20,2) NOT NULL DEFAULT 0,
  has_self_dealing          BOOLEAN NOT NULL DEFAULT false,
  self_dealing_notes        TEXT,
  total_grants              NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (total_grants >= 0),
  total_expenses            NUMERIC(20,2) NOT NULL DEFAULT 0 CHECK (total_expenses >= 0),
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (portfolio_id, tax_year)
);

CREATE INDEX IF NOT EXISTS idx_foundation_990pf_portfolio_year ON public.foundation_990pf_data(portfolio_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_foundation_990pf_org_id ON public.foundation_990pf_data(org_id);

CREATE TRIGGER trg_foundation_990pf_org_id
  BEFORE INSERT OR UPDATE OF portfolio_id, org_id ON public.foundation_990pf_data
  FOR EACH ROW EXECUTE FUNCTION public.set_tax_org_id_from_portfolio();

CREATE TRIGGER trg_foundation_990pf_updated_at
  BEFORE UPDATE ON public.foundation_990pf_data
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- tax_documents — receipt, acknowledgment, appraisal, and generated forms.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tax_documents (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id          UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  tax_contribution_id   UUID REFERENCES public.tax_contributions(id) ON DELETE CASCADE,
  tax_year              INTEGER NOT NULL CHECK (tax_year >= 1900 AND tax_year <= 2100),
  document_type         TEXT NOT NULL CHECK (document_type IN ('receipt', 'acknowledgment', 'appraisal', 'form_8283', 'schedule_a', 'summary_report', 'other')),
  storage_path          TEXT NOT NULL,
  storage_bucket        TEXT NOT NULL DEFAULT 'tax-documents',
  file_name             TEXT NOT NULL,
  file_size_bytes       BIGINT CHECK (file_size_bytes >= 0),
  mime_type             TEXT,
  uploaded_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by_system   BOOLEAN NOT NULL DEFAULT false,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_documents_portfolio_year ON public.tax_documents(portfolio_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_tax_documents_org_id ON public.tax_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_tax_documents_contribution ON public.tax_documents(tax_contribution_id) WHERE tax_contribution_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tax_documents_type ON public.tax_documents(document_type);

CREATE TRIGGER trg_tax_documents_org_id
  BEFORE INSERT OR UPDATE OF portfolio_id, org_id ON public.tax_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_tax_org_id_from_portfolio();

CREATE TRIGGER trg_tax_documents_updated_at
  BEFORE UPDATE ON public.tax_documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Views and calculation helpers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_tax_contributions_enriched AS
SELECT
  tc.*,
  h.name AS holding_name,
  CASE
    WHEN tc.amount_usd < 250 THEN 'bank_record'
    WHEN tc.amount_usd < 500 THEN 'acknowledgment'
    WHEN tc.amount_usd < 5000 AND tc.contribution_type NOT IN ('cash', 'check', 'wire') THEN 'form_8283_section_a'
    WHEN tc.amount_usd >= 5000 AND tc.contribution_type NOT IN ('cash', 'check', 'wire') THEN 'form_8283_section_b_appraisal'
    ELSE 'acknowledgment'
  END AS substantiation_requirement,
  CASE
    WHEN tc.amount_usd < 250 THEN true
    WHEN tc.amount_usd >= 250 AND tc.acknowledgment_received THEN true
    WHEN tc.amount_usd >= 5000 AND tc.contribution_type NOT IN ('cash', 'check', 'wire') AND tc.appraisal_storage_path IS NOT NULL THEN true
    ELSE false
  END AS is_compliant,
  COALESCE(tc.deductible_amount, GREATEST(tc.amount_usd - COALESCE(tc.quid_pro_quo_value, 0), 0)) AS calculated_deductible_amount
FROM public.tax_contributions tc
LEFT JOIN public.holdings h ON h.id = tc.holding_id;

CREATE OR REPLACE VIEW public.v_tax_contributions_with_limits AS
SELECT
  v.*,
  v.deductible_amount AS original_deductible_amount,
  ty.adjusted_gross_income AS agi,
  ty.filing_status,
  CASE
    WHEN ty.adjusted_gross_income IS NOT NULL AND v.agi_limit_percentage IS NOT NULL
      THEN ty.adjusted_gross_income * (v.agi_limit_percentage / 100.0)
    ELSE NULL
  END AS agi_limit_amount,
  CASE
    WHEN ty.adjusted_gross_income IS NOT NULL AND v.agi_limit_percentage IS NOT NULL
      THEN LEAST(v.calculated_deductible_amount, ty.adjusted_gross_income * (v.agi_limit_percentage / 100.0))
    ELSE v.calculated_deductible_amount
  END AS deductible_this_year,
  CASE
    WHEN ty.adjusted_gross_income IS NOT NULL AND v.agi_limit_percentage IS NOT NULL
      THEN GREATEST(v.calculated_deductible_amount - (ty.adjusted_gross_income * (v.agi_limit_percentage / 100.0)), 0)
    ELSE 0
  END AS excess_for_carryforward,
  CASE
    WHEN ty.adjusted_gross_income IS NOT NULL AND v.agi_limit_percentage IS NOT NULL
      THEN v.calculated_deductible_amount <= ty.adjusted_gross_income * (v.agi_limit_percentage / 100.0)
    ELSE NULL
  END AS within_agi_limit,
  CASE
    WHEN v.cost_basis IS NOT NULL AND v.fmv_at_donation IS NOT NULL
      THEN GREATEST(v.fmv_at_donation - v.cost_basis, 0)
    ELSE 0
  END AS capital_gains_avoided,
  CASE
    WHEN v.cost_basis IS NOT NULL AND v.fmv_at_donation IS NOT NULL
      THEN GREATEST(v.fmv_at_donation - v.cost_basis, 0) * 0.20
    ELSE 0
  END AS estimated_tax_savings,
  CASE WHEN v.qcd_qualified THEN v.amount_usd ELSE 0 END AS qcd_tax_benefit,
  (v.agi_limit_percentage IS NOT NULL) AS carryforward_eligible,
  5 AS carryforward_years
FROM public.v_tax_contributions_enriched v
LEFT JOIN public.tax_years ty
  ON ty.portfolio_id = v.portfolio_id
 AND ty.tax_year = v.tax_year;

CREATE OR REPLACE VIEW public.v_tax_deduction_summary AS
SELECT
  tc.portfolio_id,
  tc.org_id,
  tc.tax_year,
  SUM(COALESCE(tc.deductible_amount, tc.amount_usd)) FILTER (WHERE tc.contribution_type IN ('cash', 'check', 'wire')) AS cash_deductions,
  SUM(COALESCE(tc.deductible_amount, tc.amount_usd)) FILTER (WHERE tc.contribution_type NOT IN ('cash', 'check', 'wire') AND NOT tc.qcd_qualified) AS noncash_deductions,
  SUM(COALESCE(tc.deductible_amount, tc.amount_usd)) FILTER (WHERE tc.qcd_qualified) AS qcd_total,
  SUM(COALESCE(tc.deductible_amount, tc.amount_usd)) AS total_deductions,
  COUNT(*) AS contribution_count
FROM public.tax_contributions tc
GROUP BY tc.portfolio_id, tc.org_id, tc.tax_year;

CREATE OR REPLACE VIEW public.v_portfolio_tax_summary AS
SELECT
  ty.portfolio_id,
  ty.tax_year,
  ty.adjusted_gross_income AS agi,
  ty.filing_status,
  ty.standard_deduction,
  ty.agi_limit_60_pct,
  ty.agi_limit_50_pct,
  ty.agi_limit_30_pct,
  ty.agi_limit_20_pct,
  COUNT(tc.id) AS total_contributions_count,
  COALESCE(SUM(tc.amount_usd), 0) AS total_contributed,
  COALESCE(SUM(CASE WHEN tc.agi_limit_percentage = 60 THEN tc.amount_usd ELSE 0 END), 0) AS contributed_60_pct,
  COALESCE(SUM(CASE WHEN tc.agi_limit_percentage = 50 THEN tc.amount_usd ELSE 0 END), 0) AS contributed_50_pct,
  COALESCE(SUM(CASE WHEN tc.agi_limit_percentage = 30 THEN tc.amount_usd ELSE 0 END), 0) AS contributed_30_pct,
  COALESCE(SUM(CASE WHEN tc.agi_limit_percentage = 20 THEN tc.amount_usd ELSE 0 END), 0) AS contributed_20_pct,
  COALESCE(SUM(COALESCE(tc.deductible_amount, tc.amount_usd)), 0) AS total_deductible_this_year,
  COALESCE(SUM(
    CASE
      WHEN ty.adjusted_gross_income IS NOT NULL AND tc.agi_limit_percentage IS NOT NULL
        THEN GREATEST(COALESCE(tc.deductible_amount, tc.amount_usd) - (ty.adjusted_gross_income * (tc.agi_limit_percentage / 100.0)), 0)
      ELSE 0
    END
  ), 0) AS total_excess_carryforward,
  COALESCE(SUM(
    CASE
      WHEN tc.cost_basis IS NOT NULL AND tc.fmv_at_donation IS NOT NULL
        THEN GREATEST(tc.fmv_at_donation - tc.cost_basis, 0)
      ELSE 0
    END
  ), 0) AS total_capital_gains_avoided,
  COALESCE(SUM(CASE WHEN tc.qcd_qualified THEN tc.amount_usd ELSE 0 END), 0) AS total_qcd_amount,
  COUNT(CASE WHEN tc.qcd_qualified THEN 1 END) AS qcd_count,
  CASE
    WHEN ty.agi_limit_60_pct > 0 THEN (COALESCE(SUM(CASE WHEN tc.agi_limit_percentage = 60 THEN tc.amount_usd ELSE 0 END), 0) / ty.agi_limit_60_pct) * 100
    ELSE NULL
  END AS utilization_60_pct,
  CASE
    WHEN ty.agi_limit_30_pct > 0 THEN (COALESCE(SUM(CASE WHEN tc.agi_limit_percentage = 30 THEN tc.amount_usd ELSE 0 END), 0) / ty.agi_limit_30_pct) * 100
    ELSE NULL
  END AS utilization_30_pct,
  ty.carryforward_from_prior_years,
  CASE
    WHEN ty.agi_limit_60_pct IS NOT NULL THEN ty.agi_limit_60_pct - COALESCE(SUM(CASE WHEN tc.agi_limit_percentage = 60 THEN tc.amount_usd ELSE 0 END), 0)
    ELSE NULL
  END AS remaining_capacity_60_pct,
  CASE
    WHEN ty.agi_limit_30_pct IS NOT NULL THEN ty.agi_limit_30_pct - COALESCE(SUM(CASE WHEN tc.agi_limit_percentage = 30 THEN tc.amount_usd ELSE 0 END), 0)
    ELSE NULL
  END AS remaining_capacity_30_pct,
  ty.notes,
  ty.created_at,
  ty.updated_at
FROM public.tax_years ty
LEFT JOIN public.tax_contributions tc
  ON tc.portfolio_id = ty.portfolio_id
 AND tc.tax_year = ty.tax_year
GROUP BY
  ty.id,
  ty.portfolio_id,
  ty.tax_year,
  ty.adjusted_gross_income,
  ty.filing_status,
  ty.standard_deduction,
  ty.agi_limit_60_pct,
  ty.agi_limit_50_pct,
  ty.agi_limit_30_pct,
  ty.agi_limit_20_pct,
  ty.carryforward_from_prior_years,
  ty.notes,
  ty.created_at,
  ty.updated_at;

CREATE OR REPLACE VIEW public.v_carryforward_schedule AS
SELECT
  cf.id,
  cf.portfolio_id,
  cf.tax_contribution_id,
  cf.originating_tax_year,
  cf.expires_tax_year,
  cf.amount AS original_amount,
  cf.amount_remaining,
  cf.amount - cf.amount_remaining AS amount_used,
  cf.agi_limit_category,
  cf.recipient_name,
  cf.auto_generated,
  cf.expires_tax_year - EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER AS years_until_expiry,
  CASE
    WHEN cf.expires_tax_year < EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER THEN 'expired'
    WHEN cf.amount_remaining <= 0 THEN 'fully_used'
    WHEN cf.amount_remaining < cf.amount THEN 'partially_used'
    ELSE 'available'
  END AS status,
  tc.contribution_type,
  h.asset_type,
  cf.notes,
  cf.created_at,
  cf.updated_at
FROM public.tax_carryforwards cf
LEFT JOIN public.tax_contributions tc ON tc.id = cf.tax_contribution_id
LEFT JOIN public.holdings h ON h.id = tc.holding_id;

CREATE OR REPLACE VIEW public.v_active_carryforwards AS
SELECT *
FROM public.v_carryforward_schedule
WHERE amount_remaining > 0
  AND expires_tax_year >= EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;

CREATE OR REPLACE FUNCTION public.get_donation_capacity(
  p_portfolio_id UUID,
  p_tax_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER
)
RETURNS TABLE (
  tax_year INTEGER,
  agi NUMERIC,
  limit_60_pct NUMERIC,
  used_60_pct NUMERIC,
  remaining_60_pct NUMERIC,
  limit_30_pct NUMERIC,
  used_30_pct NUMERIC,
  remaining_30_pct NUMERIC,
  limit_20_pct NUMERIC,
  used_20_pct NUMERIC,
  remaining_20_pct NUMERIC,
  limit_50_pct NUMERIC,
  used_50_pct NUMERIC,
  remaining_50_pct NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF NOT public.can_view_portfolio(p_portfolio_id) THEN
    RAISE EXCEPTION 'Insufficient permissions to view portfolio %', p_portfolio_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    s.tax_year,
    s.agi,
    s.agi_limit_60_pct,
    s.contributed_60_pct,
    s.remaining_capacity_60_pct,
    s.agi_limit_30_pct,
    s.contributed_30_pct,
    s.remaining_capacity_30_pct,
    s.agi_limit_20_pct,
    s.contributed_20_pct,
    s.agi_limit_20_pct - s.contributed_20_pct,
    s.agi_limit_50_pct,
    s.contributed_50_pct,
    s.agi_limit_50_pct - s.contributed_50_pct
  FROM public.v_portfolio_tax_summary s
  WHERE s.portfolio_id = p_portfolio_id
    AND s.tax_year = p_tax_year;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.tax_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holding_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_carryforwards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daf_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foundation_990pf_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_profiles_read" ON public.tax_profiles
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'));
CREATE POLICY "tax_profiles_write" ON public.tax_profiles
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'))
  WITH CHECK (public.can_edit_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'));
CREATE POLICY "tax_profiles_service" ON public.tax_profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tax_years_read" ON public.tax_years
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'));
CREATE POLICY "tax_years_write" ON public.tax_years
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'))
  WITH CHECK (public.can_edit_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'));
CREATE POLICY "tax_years_service" ON public.tax_years
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tax_contributions_read" ON public.tax_contributions
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'));
CREATE POLICY "tax_contributions_write" ON public.tax_contributions
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'))
  WITH CHECK (public.can_edit_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'));
CREATE POLICY "tax_contributions_service" ON public.tax_contributions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "holding_contributions_read" ON public.holding_contributions
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'));
CREATE POLICY "holding_contributions_write" ON public.holding_contributions
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'))
  WITH CHECK (public.can_edit_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'));
CREATE POLICY "holding_contributions_service" ON public.holding_contributions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tax_carryforwards_read" ON public.tax_carryforwards
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'));
CREATE POLICY "tax_carryforwards_write" ON public.tax_carryforwards
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'))
  WITH CHECK (public.can_edit_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'));
CREATE POLICY "tax_carryforwards_service" ON public.tax_carryforwards
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "daf_grants_read" ON public.daf_grants
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'));
CREATE POLICY "daf_grants_write" ON public.daf_grants
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'))
  WITH CHECK (public.can_edit_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'));
CREATE POLICY "daf_grants_service" ON public.daf_grants
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "foundation_990pf_data_read" ON public.foundation_990pf_data
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'));
CREATE POLICY "foundation_990pf_data_write" ON public.foundation_990pf_data
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'))
  WITH CHECK (public.can_edit_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'));
CREATE POLICY "foundation_990pf_data_service" ON public.foundation_990pf_data
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "tax_documents_read" ON public.tax_documents
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'));
CREATE POLICY "tax_documents_write" ON public.tax_documents
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'))
  WITH CHECK (public.can_edit_portfolio(portfolio_id) AND public.org_has_module(org_id, 'tax'));
CREATE POLICY "tax_documents_service" ON public.tax_documents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ---------------------------------------------------------------------------
-- Storage: private tax-documents bucket
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('tax-documents', 'tax-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to read documents tied to portfolios they can view
CREATE POLICY "tax_documents_storage_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'tax-documents'
    AND EXISTS (
      SELECT 1 FROM public.tax_documents td
      WHERE td.storage_path = name
        AND public.can_view_portfolio(td.portfolio_id)
        AND public.org_has_module(td.org_id, 'tax')
    )
  );

-- Allow authenticated users to write documents tied to portfolios they can edit
CREATE POLICY "tax_documents_storage_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tax-documents'
    AND EXISTS (
      SELECT 1 FROM public.tax_documents td
      WHERE td.storage_path = name
        AND public.can_edit_portfolio(td.portfolio_id)
        AND public.org_has_module(td.org_id, 'tax')
    )
  );

-- Allow authenticated users to delete documents tied to portfolios they can edit
CREATE POLICY "tax_documents_storage_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'tax-documents'
    AND EXISTS (
      SELECT 1 FROM public.tax_documents td
      WHERE td.storage_path = name
        AND public.can_edit_portfolio(td.portfolio_id)
        AND public.org_has_module(td.org_id, 'tax')
    )
  );

-- Service role has full access for server-side cleanup and generation
CREATE POLICY "tax_documents_storage_service" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'tax-documents')
  WITH CHECK (bucket_id = 'tax-documents');

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_years TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_contributions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holding_contributions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_carryforwards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daf_grants TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foundation_990pf_data TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_documents TO authenticated;

GRANT ALL ON public.tax_profiles TO service_role;
GRANT ALL ON public.tax_years TO service_role;
GRANT ALL ON public.tax_contributions TO service_role;
GRANT ALL ON public.holding_contributions TO service_role;
GRANT ALL ON public.tax_carryforwards TO service_role;
GRANT ALL ON public.daf_grants TO service_role;
GRANT ALL ON public.foundation_990pf_data TO service_role;
GRANT ALL ON public.tax_documents TO service_role;

GRANT SELECT ON public.v_tax_contributions_enriched TO authenticated, service_role;
GRANT SELECT ON public.v_tax_contributions_with_limits TO authenticated, service_role;
GRANT SELECT ON public.v_tax_deduction_summary TO authenticated, service_role;
GRANT SELECT ON public.v_portfolio_tax_summary TO authenticated, service_role;
GRANT SELECT ON public.v_carryforward_schedule TO authenticated, service_role;
GRANT SELECT ON public.v_active_carryforwards TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_donation_capacity(UUID, INTEGER) TO authenticated, service_role;

COMMENT ON TABLE public.tax_profiles IS 'Per-portfolio/year tax planning inputs used by tax optimization workflows.';
COMMENT ON TABLE public.tax_contributions IS 'Charitable contribution records with substantiation, appraisal, QCD, and AGI-limit metadata.';
COMMENT ON TABLE public.tax_carryforwards IS 'Multi-year charitable deduction carryforward tracking.';
COMMENT ON TABLE public.tax_documents IS 'Tax-related document metadata stored in Supabase Storage.';
