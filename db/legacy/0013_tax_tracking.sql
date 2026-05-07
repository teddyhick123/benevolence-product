-- Migration: Tax Tracking and Compliance System
-- This migration adds comprehensive tax tracking for charitable contributions

-- ============================================================================
-- 1. TAX PROFILES - Store user tax information for AGI limit calculations
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tax_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  filing_status TEXT CHECK (filing_status IN ('single', 'married_joint', 'married_separate', 'head_of_household')),
  estimated_agi NUMERIC CHECK (estimated_agi >= 0),
  carryforward_from_prior NUMERIC DEFAULT 0 CHECK (carryforward_from_prior >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(portfolio_id, tax_year)
);

CREATE INDEX idx_tax_profiles_portfolio_year ON public.tax_profiles(portfolio_id, tax_year);

-- ============================================================================
-- 2. TAX CONTRIBUTIONS - Enhanced contribution tracking with tax metadata
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tax_contributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_contribution_id UUID REFERENCES public.holding_contributions(id) ON DELETE SET NULL,
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  holding_id UUID REFERENCES public.holdings(id) ON DELETE SET NULL,
  tax_year INTEGER NOT NULL,
  contribution_date DATE NOT NULL,

  -- Recipient information
  recipient_name TEXT NOT NULL,
  recipient_ein TEXT, -- Employer Identification Number (format: XX-XXXXXXX)
  recipient_type TEXT CHECK (recipient_type IN ('501c3_public', '501c3_private_foundation', 'daf', 'other')),
  is_qualified_organization BOOLEAN DEFAULT true,

  -- Contribution details
  contribution_type TEXT NOT NULL CHECK (contribution_type IN ('cash', 'check', 'wire', 'stock', 'crypto', 'real_estate', 'other_property')),
  amount_usd NUMERIC NOT NULL CHECK (amount_usd > 0),
  fmv_at_donation NUMERIC CHECK (fmv_at_donation >= 0), -- Fair Market Value at time of donation (non-cash)
  cost_basis NUMERIC CHECK (cost_basis >= 0), -- Original cost basis
  date_acquired DATE, -- For determining long-term vs short-term capital gains
  property_description TEXT, -- Description of donated property

  -- Substantiation
  receipt_storage_path TEXT, -- Path in Supabase Storage
  acknowledgment_received BOOLEAN DEFAULT false,
  acknowledgment_date DATE,
  acknowledgment_storage_path TEXT,
  quid_pro_quo_value NUMERIC DEFAULT 0 CHECK (quid_pro_quo_value >= 0), -- Value of goods/services received

  -- Appraisal (for donations >$5,000)
  requires_appraisal BOOLEAN DEFAULT false,
  appraisal_storage_path TEXT,
  appraisal_date DATE,
  appraisal_value NUMERIC CHECK (appraisal_value >= 0),
  appraiser_name TEXT,
  appraiser_tin TEXT, -- Tax Identification Number

  -- Deduction tracking
  deductible_amount NUMERIC CHECK (deductible_amount >= 0), -- May differ from amount if quid pro quo
  applied_to_tax_year INTEGER, -- May differ from contribution year due to carryforward
  agi_limit_category TEXT CHECK (agi_limit_category IN ('60_cash', '30_appreciated', '30_foundation_cash', '20_foundation_property')),

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tax_contributions_portfolio_year ON public.tax_contributions(portfolio_id, tax_year);
CREATE INDEX idx_tax_contributions_holding ON public.tax_contributions(holding_id);
CREATE INDEX idx_tax_contributions_date ON public.tax_contributions(contribution_date);
CREATE INDEX idx_tax_contributions_recipient ON public.tax_contributions(recipient_name);

-- ============================================================================
-- 3. TAX CARRYFORWARDS - Multi-year carryforward tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tax_carryforwards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  tax_contribution_id UUID REFERENCES public.tax_contributions(id) ON DELETE SET NULL,
  originating_tax_year INTEGER NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  amount_remaining NUMERIC NOT NULL CHECK (amount_remaining >= 0 AND amount_remaining <= amount),
  agi_limit_category TEXT NOT NULL CHECK (agi_limit_category IN ('60_cash', '30_appreciated', '30_foundation_cash', '20_foundation_property')),
  expires_tax_year INTEGER NOT NULL, -- Original year + 5
  recipient_name TEXT,
  recipient_ein TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_tax_carryforwards_portfolio ON public.tax_carryforwards(portfolio_id);
CREATE INDEX idx_tax_carryforwards_expiration ON public.tax_carryforwards(portfolio_id, expires_tax_year);
CREATE INDEX idx_tax_carryforwards_remaining ON public.tax_carryforwards(portfolio_id, amount_remaining) WHERE amount_remaining > 0;

-- ============================================================================
-- 4. DAF GRANTS - Track Donor-Advised Fund contributions and grants
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.daf_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  daf_name TEXT NOT NULL, -- e.g., "Fidelity Charitable", "Schwab Charitable"
  daf_account_number TEXT,

  -- Contribution to DAF (the deductible event)
  contribution_date DATE NOT NULL,
  contribution_amount NUMERIC NOT NULL CHECK (contribution_amount > 0),
  contribution_type TEXT CHECK (contribution_type IN ('cash', 'stock', 'crypto', 'other')),
  tax_contribution_id UUID REFERENCES public.tax_contributions(id) ON DELETE SET NULL,

  -- Grant from DAF to charity (not separately deductible)
  grant_date DATE,
  grant_recipient TEXT,
  grant_recipient_ein TEXT,
  grant_amount NUMERIC CHECK (grant_amount > 0),
  holding_id UUID REFERENCES public.holdings(id) ON DELETE SET NULL, -- Link if tracked as holding

  status TEXT NOT NULL DEFAULT 'contributed' CHECK (status IN ('contributed', 'granted', 'partially_granted')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_daf_grants_portfolio ON public.daf_grants(portfolio_id);
CREATE INDEX idx_daf_grants_contribution_date ON public.daf_grants(contribution_date);
CREATE INDEX idx_daf_grants_grant_date ON public.daf_grants(grant_date);

-- ============================================================================
-- 5. FOUNDATION 990-PF DATA - Private foundation specific tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.foundation_990pf_data (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,

  -- Excise tax calculation
  net_investment_income NUMERIC DEFAULT 0 CHECK (net_investment_income >= 0),
  excise_tax_rate NUMERIC DEFAULT 1.39 CHECK (excise_tax_rate >= 0 AND excise_tax_rate <= 100),
  excise_tax_amount NUMERIC CHECK (excise_tax_amount >= 0),

  -- Minimum distribution requirement (5% of assets)
  fair_market_value_assets NUMERIC CHECK (fair_market_value_assets >= 0),
  required_payout NUMERIC CHECK (required_payout >= 0),
  actual_payout NUMERIC CHECK (actual_payout >= 0),
  payout_deficit NUMERIC DEFAULT 0,

  -- Self-dealing tracking
  has_self_dealing BOOLEAN DEFAULT false,
  self_dealing_notes TEXT,

  -- Additional foundation metrics
  total_grants NUMERIC DEFAULT 0 CHECK (total_grants >= 0),
  total_expenses NUMERIC DEFAULT 0 CHECK (total_expenses >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(portfolio_id, tax_year)
);

CREATE INDEX idx_foundation_990pf_portfolio_year ON public.foundation_990pf_data(portfolio_id, tax_year);

-- ============================================================================
-- 6. TAX DOCUMENTS - Document storage metadata
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tax_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  tax_contribution_id UUID REFERENCES public.tax_contributions(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('receipt', 'acknowledgment', 'appraisal', 'form_8283', 'schedule_a', 'summary_report', 'other')),
  storage_path TEXT NOT NULL, -- Path in Supabase Storage bucket
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT CHECK (file_size_bytes >= 0),
  mime_type TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by_system BOOLEAN DEFAULT false, -- true for system-generated reports/forms
  metadata JSONB DEFAULT '{}'::jsonb -- Additional metadata (OCR results, etc.)
);

CREATE INDEX idx_tax_documents_portfolio_year ON public.tax_documents(portfolio_id, tax_year);
CREATE INDEX idx_tax_documents_contribution ON public.tax_documents(tax_contribution_id);
CREATE INDEX idx_tax_documents_type ON public.tax_documents(document_type);

-- ============================================================================
-- 7. TRIGGERS - Auto-update timestamps
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_tax_profiles_updated_at BEFORE UPDATE ON public.tax_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tax_contributions_updated_at BEFORE UPDATE ON public.tax_contributions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tax_carryforwards_updated_at BEFORE UPDATE ON public.tax_carryforwards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daf_grants_updated_at BEFORE UPDATE ON public.daf_grants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_foundation_990pf_data_updated_at BEFORE UPDATE ON public.foundation_990pf_data
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 8. ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================================

-- Enable RLS on all new tables
ALTER TABLE public.tax_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_carryforwards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daf_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foundation_990pf_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_documents ENABLE ROW LEVEL SECURITY;

-- Tax Profiles: Users can view/edit their portfolio's tax profiles
CREATE POLICY "Users can view tax profiles for portfolios they are members of"
  ON public.tax_profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_members pm
      WHERE pm.portfolio_id = tax_profiles.portfolio_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert tax profiles for portfolios they can edit"
  ON public.tax_profiles FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.portfolio_members pm
      WHERE pm.portfolio_id = tax_profiles.portfolio_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'editor')
    )
  );

CREATE POLICY "Users can update tax profiles for portfolios they can edit"
  ON public.tax_profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_members pm
      WHERE pm.portfolio_id = tax_profiles.portfolio_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'editor')
    )
  );

CREATE POLICY "Users can delete tax profiles for portfolios they own"
  ON public.tax_profiles FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_members pm
      WHERE pm.portfolio_id = tax_profiles.portfolio_id
      AND pm.user_id = auth.uid()
      AND pm.role = 'owner'
    )
  );

-- Tax Contributions: Same pattern as tax profiles
CREATE POLICY "Users can view tax contributions for their portfolios"
  ON public.tax_contributions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_members pm
      WHERE pm.portfolio_id = tax_contributions.portfolio_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert tax contributions for portfolios they can edit"
  ON public.tax_contributions FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.portfolio_members pm
      WHERE pm.portfolio_id = tax_contributions.portfolio_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'editor')
    )
  );

CREATE POLICY "Users can update tax contributions for portfolios they can edit"
  ON public.tax_contributions FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_members pm
      WHERE pm.portfolio_id = tax_contributions.portfolio_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'editor')
    )
  );

CREATE POLICY "Users can delete tax contributions for portfolios they own"
  ON public.tax_contributions FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_members pm
      WHERE pm.portfolio_id = tax_contributions.portfolio_id
      AND pm.user_id = auth.uid()
      AND pm.role = 'owner'
    )
  );

-- Apply same RLS policies to other tables
-- Tax Carryforwards
CREATE POLICY "Users can view tax carryforwards for their portfolios"
  ON public.tax_carryforwards FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_members pm
      WHERE pm.portfolio_id = tax_carryforwards.portfolio_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage tax carryforwards for portfolios they can edit"
  ON public.tax_carryforwards FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_members pm
      WHERE pm.portfolio_id = tax_carryforwards.portfolio_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'editor')
    )
  );

-- DAF Grants
CREATE POLICY "Users can view daf grants for their portfolios"
  ON public.daf_grants FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_members pm
      WHERE pm.portfolio_id = daf_grants.portfolio_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage daf grants for portfolios they can edit"
  ON public.daf_grants FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_members pm
      WHERE pm.portfolio_id = daf_grants.portfolio_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'editor')
    )
  );

-- Foundation 990-PF Data
CREATE POLICY "Users can view foundation data for their portfolios"
  ON public.foundation_990pf_data FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_members pm
      WHERE pm.portfolio_id = foundation_990pf_data.portfolio_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage foundation data for portfolios they can edit"
  ON public.foundation_990pf_data FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_members pm
      WHERE pm.portfolio_id = foundation_990pf_data.portfolio_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'editor')
    )
  );

-- Tax Documents
CREATE POLICY "Users can view tax documents for their portfolios"
  ON public.tax_documents FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_members pm
      WHERE pm.portfolio_id = tax_documents.portfolio_id
      AND pm.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage tax documents for portfolios they can edit"
  ON public.tax_documents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.portfolio_members pm
      WHERE pm.portfolio_id = tax_documents.portfolio_id
      AND pm.user_id = auth.uid()
      AND pm.role IN ('owner', 'editor')
    )
  );

-- ============================================================================
-- 9. HELPER VIEWS
-- ============================================================================

-- View: Tax contributions with calculated fields
CREATE OR REPLACE VIEW public.v_tax_contributions_enriched AS
SELECT
  tc.*,
  h.name as holding_name,
  CASE
    WHEN tc.amount_usd < 250 THEN 'bank_record'
    WHEN tc.amount_usd < 500 THEN 'acknowledgment'
    WHEN tc.amount_usd < 5000 AND tc.contribution_type NOT IN ('cash', 'check', 'wire') THEN 'form_8283_section_a'
    WHEN tc.amount_usd >= 5000 AND tc.contribution_type NOT IN ('cash', 'check', 'wire') THEN 'form_8283_section_b_appraisal'
    ELSE 'acknowledgment'
  END as substantiation_requirement,
  CASE
    WHEN tc.amount_usd < 250 THEN true
    WHEN tc.amount_usd >= 250 AND tc.acknowledgment_received THEN true
    WHEN tc.amount_usd >= 5000 AND tc.contribution_type NOT IN ('cash', 'check', 'wire')
         AND tc.appraisal_storage_path IS NOT NULL THEN true
    ELSE false
  END as is_compliant,
  COALESCE(tc.deductible_amount, tc.amount_usd - tc.quid_pro_quo_value) as calculated_deductible_amount
FROM public.tax_contributions tc
LEFT JOIN public.holdings h ON tc.holding_id = h.id;

-- View: Active carryforwards
CREATE OR REPLACE VIEW public.v_active_carryforwards AS
SELECT
  cf.*,
  (cf.expires_tax_year - EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER) as years_until_expiration,
  CASE
    WHEN cf.amount_remaining = 0 THEN 'fully_used'
    WHEN cf.expires_tax_year <= EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER THEN 'expired'
    WHEN cf.expires_tax_year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER THEN 'expiring_this_year'
    WHEN cf.expires_tax_year = EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER + 1 THEN 'expiring_next_year'
    ELSE 'active'
  END as status
FROM public.tax_carryforwards cf
WHERE cf.amount_remaining > 0
  AND cf.expires_tax_year >= EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER;

-- Grant read access on views
GRANT SELECT ON public.v_tax_contributions_enriched TO authenticated;
GRANT SELECT ON public.v_active_carryforwards TO authenticated;

-- ============================================================================
-- 10. COMMENTS FOR DOCUMENTATION
-- ============================================================================
COMMENT ON TABLE public.tax_profiles IS 'Stores tax profile information for portfolio owners including AGI estimates for deduction limit calculations';
COMMENT ON TABLE public.tax_contributions IS 'Enhanced charitable contribution tracking with IRS substantiation requirements and tax metadata';
COMMENT ON TABLE public.tax_carryforwards IS 'Multi-year tracking of charitable contribution carryforwards (5-year expiration)';
COMMENT ON TABLE public.daf_grants IS 'Donor-Advised Fund contribution and grant tracking';
COMMENT ON TABLE public.foundation_990pf_data IS 'Private foundation 990-PF specific data including excise tax and payout requirements';
COMMENT ON TABLE public.tax_documents IS 'Metadata for tax-related documents stored in Supabase Storage';
