-- ============================================================================
-- TAX OPTIMIZATION MODULE
-- ============================================================================
-- Description: Tax planning and compliance tracking
-- Tables: tax_profiles, tax_years, tax_contributions, tax_carryforwards,
--         tax_documents, foundation_990pf_data, cpa_share_links, cpa_access_logs
-- Views: v_tax_contributions_enriched, v_tax_contributions_with_limits,
--        v_portfolio_tax_summary, v_active_carryforwards
-- ============================================================================

-- ============================================================================
-- 1. TAX PROFILES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tax_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  filing_status TEXT CHECK (filing_status IN ('single', 'married_joint', 'married_separate', 'head_of_household')),
  estimated_agi NUMERIC CHECK (estimated_agi >= 0),
  carryforward_from_prior NUMERIC DEFAULT 0 CHECK (carryforward_from_prior >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(portfolio_id, tax_year)
);

CREATE INDEX IF NOT EXISTS idx_tax_profiles_portfolio_year ON public.tax_profiles(portfolio_id, tax_year);

COMMENT ON TABLE public.tax_profiles IS 'Taxpayer information including AGI estimates for deduction limit calculations';

-- ============================================================================
-- 2. TAX YEARS TABLE (Simplified year tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tax_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  is_filed BOOLEAN DEFAULT false,
  filed_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(portfolio_id, tax_year)
);

CREATE INDEX IF NOT EXISTS idx_tax_years_portfolio ON public.tax_years(portfolio_id);

COMMENT ON TABLE public.tax_years IS 'Year-specific tax data and filing status';

-- ============================================================================
-- 3. TAX CONTRIBUTIONS TABLE
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
  recipient_ein TEXT,
  recipient_type TEXT CHECK (recipient_type IN ('501c3_public', '501c3_private_foundation', 'daf', 'other')),
  is_qualified_organization BOOLEAN DEFAULT true,

  -- Contribution details
  contribution_type TEXT NOT NULL CHECK (contribution_type IN ('cash', 'check', 'wire', 'stock', 'crypto', 'real_estate', 'other_property')),
  amount_usd NUMERIC NOT NULL CHECK (amount_usd > 0),
  fmv_at_donation NUMERIC CHECK (fmv_at_donation >= 0),
  cost_basis NUMERIC CHECK (cost_basis >= 0),
  date_acquired DATE,
  property_description TEXT,

  -- Substantiation
  receipt_storage_path TEXT,
  acknowledgment_received BOOLEAN DEFAULT false,
  acknowledgment_date DATE,
  acknowledgment_storage_path TEXT,
  quid_pro_quo_value NUMERIC DEFAULT 0 CHECK (quid_pro_quo_value >= 0),

  -- Appraisal (for donations >$5,000)
  requires_appraisal BOOLEAN DEFAULT false,
  appraisal_storage_path TEXT,
  appraisal_date DATE,
  appraisal_value NUMERIC CHECK (appraisal_value >= 0),
  appraiser_name TEXT,
  appraiser_tin TEXT,

  -- Deduction tracking
  deductible_amount NUMERIC CHECK (deductible_amount >= 0),
  applied_to_tax_year INTEGER,
  agi_limit_category TEXT CHECK (agi_limit_category IN ('60_cash', '30_appreciated', '30_foundation_cash', '20_foundation_property')),

  -- Metadata
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_contributions_portfolio_year ON public.tax_contributions(portfolio_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_tax_contributions_holding ON public.tax_contributions(holding_id);
CREATE INDEX IF NOT EXISTS idx_tax_contributions_date ON public.tax_contributions(contribution_date);
CREATE INDEX IF NOT EXISTS idx_tax_contributions_recipient ON public.tax_contributions(recipient_name);

COMMENT ON TABLE public.tax_contributions IS 'Charitable contributions with IRS substantiation tracking';

-- ============================================================================
-- 4. TAX CARRYFORWARDS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tax_carryforwards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  tax_contribution_id UUID REFERENCES public.tax_contributions(id) ON DELETE SET NULL,
  originating_tax_year INTEGER NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  amount_remaining NUMERIC NOT NULL CHECK (amount_remaining >= 0 AND amount_remaining <= amount),
  agi_limit_category TEXT NOT NULL CHECK (agi_limit_category IN ('60_cash', '30_appreciated', '30_foundation_cash', '20_foundation_property')),
  expires_tax_year INTEGER NOT NULL,
  recipient_name TEXT,
  recipient_ein TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tax_carryforwards_portfolio ON public.tax_carryforwards(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_tax_carryforwards_expiration ON public.tax_carryforwards(portfolio_id, expires_tax_year);
CREATE INDEX IF NOT EXISTS idx_tax_carryforwards_remaining ON public.tax_carryforwards(portfolio_id, amount_remaining) WHERE amount_remaining > 0;

COMMENT ON TABLE public.tax_carryforwards IS 'Multi-year tracking of charitable contribution carryforwards (5-year expiration)';

-- ============================================================================
-- 5. TAX DOCUMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.tax_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  tax_contribution_id UUID REFERENCES public.tax_contributions(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL,
  document_type TEXT NOT NULL CHECK (document_type IN ('receipt', 'acknowledgment', 'appraisal', 'form_8283', 'schedule_a', 'summary_report', 'other')),
  storage_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size_bytes BIGINT CHECK (file_size_bytes >= 0),
  mime_type TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by_system BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_tax_documents_portfolio_year ON public.tax_documents(portfolio_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_tax_documents_contribution ON public.tax_documents(tax_contribution_id);
CREATE INDEX IF NOT EXISTS idx_tax_documents_type ON public.tax_documents(document_type);

COMMENT ON TABLE public.tax_documents IS 'Metadata for tax-related documents stored in Supabase Storage';

-- ============================================================================
-- 6. FOUNDATION 990-PF DATA TABLE
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

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(portfolio_id, tax_year)
);

CREATE INDEX IF NOT EXISTS idx_foundation_990pf_portfolio_year ON public.foundation_990pf_data(portfolio_id, tax_year);

COMMENT ON TABLE public.foundation_990pf_data IS 'Private foundation 990-PF specific data';

-- ============================================================================
-- 7. CPA SHARE LINKS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cpa_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  share_token TEXT NOT NULL UNIQUE,
  cpa_name TEXT,
  cpa_email TEXT,
  cpa_firm TEXT,
  tax_years INTEGER[] NOT NULL,
  expires_at TIMESTAMPTZ,
  max_accesses INTEGER,
  access_count INTEGER DEFAULT 0 NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{
    "view_contributions": true,
    "view_carryforwards": true,
    "view_donor_profile": false,
    "view_tax_summary": true,
    "download_form8283": true,
    "download_turbotax": true
  }'::jsonb,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  last_accessed_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  CONSTRAINT valid_tax_years CHECK (array_length(tax_years, 1) > 0),
  CONSTRAINT valid_max_accesses CHECK (max_accesses IS NULL OR max_accesses > 0)
);

CREATE INDEX IF NOT EXISTS idx_cpa_share_links_portfolio ON public.cpa_share_links(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_cpa_share_links_token ON public.cpa_share_links(share_token);
CREATE INDEX IF NOT EXISTS idx_cpa_share_links_expires ON public.cpa_share_links(expires_at) WHERE expires_at IS NOT NULL AND revoked_at IS NULL;

COMMENT ON TABLE public.cpa_share_links IS 'Secure share links for CPA access to tax data';

-- ============================================================================
-- 8. CPA ACCESS LOGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.cpa_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  share_link_id UUID NOT NULL REFERENCES public.cpa_share_links(id) ON DELETE CASCADE,
  accessed_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  ip_address INET,
  user_agent TEXT,
  action TEXT NOT NULL CHECK (action IN ('view', 'download_form8283', 'download_turbotax', 'download_csv')),
  resource TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cpa_access_logs_share_link ON public.cpa_access_logs(share_link_id);
CREATE INDEX IF NOT EXISTS idx_cpa_access_logs_accessed_at ON public.cpa_access_logs(accessed_at);

COMMENT ON TABLE public.cpa_access_logs IS 'Audit log of CPA access to shared tax data';

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Tax contributions with calculated fields
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
    WHEN tc.amount_usd >= 5000 AND tc.contribution_type NOT IN ('cash', 'check', 'wire') AND tc.appraisal_storage_path IS NOT NULL THEN true
    ELSE false
  END as is_compliant,
  COALESCE(tc.deductible_amount, tc.amount_usd - tc.quid_pro_quo_value) as calculated_deductible_amount
FROM public.tax_contributions tc
LEFT JOIN public.holdings h ON tc.holding_id = h.id;

COMMENT ON VIEW public.v_tax_contributions_enriched IS 'Tax contributions with compliance status';

-- Active carryforwards view
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

COMMENT ON VIEW public.v_active_carryforwards IS 'Active tax carryforwards with expiration status';

-- Portfolio tax summary
CREATE OR REPLACE VIEW public.v_portfolio_tax_summary AS
SELECT
  p.id as portfolio_id,
  p.name as portfolio_name,
  tp.tax_year,
  tp.filing_status,
  tp.estimated_agi,
  COALESCE(SUM(tc.amount_usd), 0) as total_contributions,
  COALESCE(SUM(tc.deductible_amount), 0) as total_deductible,
  COALESCE(SUM(CASE WHEN tc.agi_limit_category = '60_cash' THEN tc.amount_usd END), 0) as cash_contributions,
  COALESCE(SUM(CASE WHEN tc.agi_limit_category = '30_appreciated' THEN tc.amount_usd END), 0) as appreciated_contributions,
  (SELECT SUM(amount_remaining) FROM public.tax_carryforwards cf
   WHERE cf.portfolio_id = p.id AND cf.expires_tax_year >= tp.tax_year) as available_carryforward
FROM public.portfolios p
LEFT JOIN public.tax_profiles tp ON tp.portfolio_id = p.id
LEFT JOIN public.tax_contributions tc ON tc.portfolio_id = p.id AND tc.tax_year = tp.tax_year
GROUP BY p.id, p.name, tp.tax_year, tp.filing_status, tp.estimated_agi;

COMMENT ON VIEW public.v_portfolio_tax_summary IS 'Portfolio-level tax summary';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get donation capacity based on AGI limits
CREATE OR REPLACE FUNCTION public.get_donation_capacity(
  p_portfolio_id UUID,
  p_tax_year INTEGER DEFAULT NULL
)
RETURNS TABLE (
  category TEXT,
  agi_limit_percent INTEGER,
  annual_limit NUMERIC,
  used_amount NUMERIC,
  remaining_capacity NUMERIC
) AS $$
DECLARE
  v_year INTEGER;
  v_agi NUMERIC;
BEGIN
  v_year := COALESCE(p_tax_year, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);

  SELECT estimated_agi INTO v_agi
  FROM public.tax_profiles
  WHERE portfolio_id = p_portfolio_id AND tax_year = v_year;

  IF v_agi IS NULL THEN
    v_agi := 0;
  END IF;

  RETURN QUERY
  SELECT
    cat.category,
    cat.limit_percent,
    v_agi * cat.limit_percent / 100 as annual_limit,
    COALESCE(SUM(tc.amount_usd), 0) as used_amount,
    GREATEST(0, v_agi * cat.limit_percent / 100 - COALESCE(SUM(tc.amount_usd), 0)) as remaining_capacity
  FROM (
    VALUES ('60_cash', 60), ('30_appreciated', 30), ('30_foundation_cash', 30), ('20_foundation_property', 20)
  ) AS cat(category, limit_percent)
  LEFT JOIN public.tax_contributions tc ON tc.portfolio_id = p_portfolio_id
    AND tc.tax_year = v_year
    AND tc.agi_limit_category = cat.category
  GROUP BY cat.category, cat.limit_percent;
END;
$$ LANGUAGE plpgsql STABLE;

-- Generate share token
CREATE OR REPLACE FUNCTION public.generate_share_token()
RETURNS TEXT AS $$
  SELECT encode(gen_random_bytes(32), 'hex');
$$ LANGUAGE SQL;

-- Get valid share link
CREATE OR REPLACE FUNCTION public.get_valid_share_link(p_share_token TEXT)
RETURNS TABLE (
  id UUID,
  portfolio_id UUID,
  share_token TEXT,
  cpa_name TEXT,
  cpa_email TEXT,
  cpa_firm TEXT,
  tax_years INTEGER[],
  expires_at TIMESTAMPTZ,
  max_accesses INTEGER,
  access_count INTEGER,
  permissions JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ,
  last_accessed_at TIMESTAMPTZ
) AS $$
  SELECT
    sl.id, sl.portfolio_id, sl.share_token, sl.cpa_name, sl.cpa_email,
    sl.cpa_firm, sl.tax_years, sl.expires_at, sl.max_accesses,
    sl.access_count, sl.permissions, sl.notes, sl.created_at, sl.last_accessed_at
  FROM public.cpa_share_links sl
  WHERE sl.share_token = p_share_token
    AND sl.revoked_at IS NULL
    AND (sl.expires_at IS NULL OR sl.expires_at > NOW())
    AND (sl.max_accesses IS NULL OR sl.access_count < sl.max_accesses);
$$ LANGUAGE SQL STABLE;

-- Increment share link access
CREATE OR REPLACE FUNCTION public.increment_share_link_access(p_share_token TEXT)
RETURNS VOID AS $$
  UPDATE public.cpa_share_links
  SET access_count = access_count + 1, last_accessed_at = NOW()
  WHERE share_token = p_share_token
    AND revoked_at IS NULL
    AND (expires_at IS NULL OR expires_at > NOW());
$$ LANGUAGE SQL;

-- Revoke share link
CREATE OR REPLACE FUNCTION public.revoke_share_link(p_share_link_id UUID)
RETURNS VOID AS $$
  UPDATE public.cpa_share_links SET revoked_at = NOW() WHERE id = p_share_link_id;
$$ LANGUAGE SQL;

-- Grant execute
GRANT EXECUTE ON FUNCTION public.get_donation_capacity(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_share_token() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_valid_share_link(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_share_link_access(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_share_link(UUID) TO authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.tax_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_contributions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_carryforwards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tax_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foundation_990pf_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpa_share_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cpa_access_logs ENABLE ROW LEVEL SECURITY;

-- Tax tables use portfolio-based access
DROP POLICY IF EXISTS "tax_profiles_read" ON public.tax_profiles;
CREATE POLICY "tax_profiles_read" ON public.tax_profiles
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

DROP POLICY IF EXISTS "tax_profiles_write" ON public.tax_profiles;
CREATE POLICY "tax_profiles_write" ON public.tax_profiles
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "tax_profiles_service" ON public.tax_profiles;
CREATE POLICY "tax_profiles_service" ON public.tax_profiles
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Apply same pattern to other tax tables...

-- CPA Share Links
DROP POLICY IF EXISTS "cpa_share_links_read" ON public.cpa_share_links;
CREATE POLICY "cpa_share_links_read" ON public.cpa_share_links
  FOR SELECT TO authenticated
  USING (
    public.can_view_portfolio(portfolio_id)
    OR (share_token IS NOT NULL AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > NOW()))
  );

DROP POLICY IF EXISTS "cpa_share_links_write" ON public.cpa_share_links;
CREATE POLICY "cpa_share_links_write" ON public.cpa_share_links
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "cpa_share_links_service" ON public.cpa_share_links;
CREATE POLICY "cpa_share_links_service" ON public.cpa_share_links
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- CPA Access Logs
DROP POLICY IF EXISTS "cpa_access_logs_read" ON public.cpa_access_logs;
CREATE POLICY "cpa_access_logs_read" ON public.cpa_access_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.cpa_share_links sl
      WHERE sl.id = cpa_access_logs.share_link_id
        AND public.can_view_portfolio(sl.portfolio_id)
    )
  );

DROP POLICY IF EXISTS "cpa_access_logs_insert" ON public.cpa_access_logs;
CREATE POLICY "cpa_access_logs_insert" ON public.cpa_access_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "cpa_access_logs_service" ON public.cpa_access_logs;
CREATE POLICY "cpa_access_logs_service" ON public.cpa_access_logs
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_years TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_contributions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_carryforwards TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tax_documents TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.foundation_990pf_data TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cpa_share_links TO authenticated;
GRANT SELECT, INSERT ON public.cpa_access_logs TO authenticated;

GRANT ALL ON public.tax_profiles TO service_role;
GRANT ALL ON public.tax_years TO service_role;
GRANT ALL ON public.tax_contributions TO service_role;
GRANT ALL ON public.tax_carryforwards TO service_role;
GRANT ALL ON public.tax_documents TO service_role;
GRANT ALL ON public.foundation_990pf_data TO service_role;
GRANT ALL ON public.cpa_share_links TO service_role;
GRANT ALL ON public.cpa_access_logs TO service_role;

-- Views
GRANT SELECT ON public.v_tax_contributions_enriched TO authenticated;
GRANT SELECT ON public.v_active_carryforwards TO authenticated;
GRANT SELECT ON public.v_portfolio_tax_summary TO authenticated;
