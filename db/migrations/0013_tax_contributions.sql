-- =============================================================================
-- 0013_tax_contributions.sql
-- Charitable tax deduction tracking, Form 8283 support, carryforward.
-- Module-gated: requires org_has_module(org_id, 'tax').
-- Depends on: 0001, 0004, 0006, 0012
-- =============================================================================

-- ---------------------------------------------------------------------------
-- tax_contributions — one row per deductible gift/contribution
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tax_contributions (
  id                  uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  portfolio_id        uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  org_id              uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Link to holding when contribution is tracked as a position
  holding_id          uuid REFERENCES holdings(id) ON DELETE SET NULL,

  -- Contribution details
  contribution_date   date NOT NULL,
  recipient_name      text NOT NULL,
  recipient_ein       text,
  contribution_type   text NOT NULL DEFAULT 'cash',
  -- 'cash', 'securities', 'property', 'vehicle', 'cryptocurrency', 'qcd', 'daf_grant'

  -- Amounts
  fair_market_value   numeric(20,2) NOT NULL,
  cost_basis          numeric(20,2),  -- for non-cash
  deductible_amount   numeric(20,2),  -- may differ from FMV (e.g. if partly quid pro quo)
  currency            text NOT NULL DEFAULT 'USD',

  -- Tax regime modifiers (OBBB 2026 / pre-TCJA / CARES Act)
  agi_limit_pct       numeric(5,2),   -- e.g. 60.0 for cash, 30.0 for appreciated property
  tax_year            int NOT NULL DEFAULT date_part('year', CURRENT_DATE)::int,
  is_carryforward     boolean NOT NULL DEFAULT false,  -- true if this row is a carryforward entry
  carryforward_year   int,            -- original year if is_carryforward = true

  -- Form 8283 fields (non-cash contributions > $500)
  form8283_required   boolean GENERATED ALWAYS AS (
                        contribution_type != 'cash' AND fair_market_value > 500
                      ) STORED,
  appraisal_date      date,
  appraiser_name      text,
  appraiser_ein       text,
  description_of_property text,

  -- QCD-specific
  is_qcd              boolean NOT NULL DEFAULT false,  -- qualified charitable distribution
  qcd_distribution_amount numeric(20,2),

  -- Documents
  acknowledgment_letter_url text,
  receipt_url         text,

  notes               text,
  external_id         text,
  source_system       text
);

CREATE INDEX idx_tax_contributions_portfolio_id    ON tax_contributions (portfolio_id);
CREATE INDEX idx_tax_contributions_org_id          ON tax_contributions (org_id);
CREATE INDEX idx_tax_contributions_holding_id      ON tax_contributions (holding_id) WHERE holding_id IS NOT NULL;
CREATE INDEX idx_tax_contributions_tax_year        ON tax_contributions (tax_year);
CREATE INDEX idx_tax_contributions_contribution_date ON tax_contributions (contribution_date DESC);
CREATE INDEX idx_tax_contributions_recipient_ein   ON tax_contributions (recipient_ein) WHERE recipient_ein IS NOT NULL;

CREATE TRIGGER trg_tax_contributions_updated_at
  BEFORE UPDATE ON tax_contributions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- tax_documents — Form 990s, Form 8283, acknowledgment letters, etc.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tax_documents (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  portfolio_id    uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  contribution_id uuid REFERENCES tax_contributions(id) ON DELETE SET NULL,

  document_type   text NOT NULL,
  -- 'form_8283', 'acknowledgment_letter', 'appraisal', '990', '990-pf', 'receipt', 'other'
  tax_year        int,
  storage_path    text NOT NULL,
  storage_bucket  text NOT NULL DEFAULT 'tax-documents',
  filename        text NOT NULL,
  notes           text
);

CREATE INDEX idx_tax_documents_portfolio_id    ON tax_documents (portfolio_id);
CREATE INDEX idx_tax_documents_contribution_id ON tax_documents (contribution_id) WHERE contribution_id IS NOT NULL;
CREATE INDEX idx_tax_documents_tax_year        ON tax_documents (tax_year);

CREATE TRIGGER trg_tax_documents_updated_at
  BEFORE UPDATE ON tax_documents
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- v_tax_deduction_summary — per-portfolio, per-year deduction totals
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_tax_deduction_summary AS
SELECT
  tc.portfolio_id,
  tc.org_id,
  tc.tax_year,
  SUM(tc.deductible_amount) FILTER (WHERE tc.contribution_type = 'cash')
    AS cash_deductions,
  SUM(tc.deductible_amount) FILTER (WHERE tc.contribution_type != 'cash' AND NOT tc.is_qcd)
    AS noncash_deductions,
  SUM(tc.deductible_amount) FILTER (WHERE tc.is_qcd)
    AS qcd_total,
  SUM(tc.deductible_amount)
    AS total_deductions,
  COUNT(*) AS contribution_count
FROM tax_contributions tc
GROUP BY tc.portfolio_id, tc.org_id, tc.tax_year;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE tax_contributions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_contributions: portfolio admins only + module check"
  ON tax_contributions FOR SELECT
  USING (
    user_portfolio_role(portfolio_id) IN ('admin','owner')
    AND org_has_module(org_id, 'tax')
  );
CREATE POLICY "tax_contributions: portfolio admins can manage + module check"
  ON tax_contributions FOR ALL
  USING (
    user_portfolio_role(portfolio_id) IN ('admin','owner')
    AND org_has_module(org_id, 'tax')
  )
  WITH CHECK (
    user_portfolio_role(portfolio_id) IN ('admin','owner')
    AND org_has_module(org_id, 'tax')
  );

ALTER TABLE tax_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tax_documents: portfolio admins only + module check"
  ON tax_documents FOR SELECT
  USING (
    user_portfolio_role(portfolio_id) IN ('admin','owner')
    AND org_has_module(org_id, 'tax')
  );
CREATE POLICY "tax_documents: portfolio admins can manage"
  ON tax_documents FOR ALL
  USING (
    user_portfolio_role(portfolio_id) IN ('admin','owner')
    AND org_has_module(org_id, 'tax')
  )
  WITH CHECK (
    user_portfolio_role(portfolio_id) IN ('admin','owner')
    AND org_has_module(org_id, 'tax')
  );
