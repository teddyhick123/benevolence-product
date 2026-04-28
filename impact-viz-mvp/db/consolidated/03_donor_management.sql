-- ============================================================================
-- DONOR MANAGEMENT MODULE
-- ============================================================================
-- Description: Track contributions received and generate acknowledgments
-- Tables: donors, donor_profiles, contributions_received, donor_communications,
--         acknowledgment_letters
-- Views: v_donor_summary, v_contribution_with_donor
-- ============================================================================

-- ============================================================================
-- 1. DONORS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.donors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Donor type
  donor_type TEXT NOT NULL DEFAULT 'individual' CHECK (donor_type IN ('individual', 'foundation', 'corporation', 'government', 'other')),

  -- Individual fields
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,

  -- Organization fields (for foundation/corporation/government)
  organization_name TEXT,
  contact_name TEXT,

  -- Address
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'United States',

  -- Communication preferences
  is_anonymous BOOLEAN DEFAULT false,
  communication_preference TEXT DEFAULT 'email' CHECK (communication_preference IN ('email', 'mail', 'phone', 'none')),
  do_not_contact BOOLEAN DEFAULT false,

  -- Computed giving stats (updated via trigger)
  total_lifetime_giving NUMERIC(15,2) DEFAULT 0,
  total_ytd_giving NUMERIC(15,2) DEFAULT 0,
  first_gift_date DATE,
  last_gift_date DATE,
  gift_count INTEGER DEFAULT 0,
  largest_gift NUMERIC(15,2) DEFAULT 0,
  average_gift NUMERIC(15,2) DEFAULT 0,

  -- Notes
  notes TEXT,
  tags TEXT[] DEFAULT '{}',

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_donors_org ON public.donors(organization_id);
CREATE INDEX IF NOT EXISTS idx_donors_type ON public.donors(donor_type);
CREATE INDEX IF NOT EXISTS idx_donors_email ON public.donors(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_donors_last_name ON public.donors(last_name) WHERE last_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_donors_org_name ON public.donors(organization_name) WHERE organization_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_donors_lifetime_giving ON public.donors(organization_id, total_lifetime_giving DESC);
CREATE INDEX IF NOT EXISTS idx_donors_last_gift ON public.donors(organization_id, last_gift_date DESC NULLS LAST);

COMMENT ON TABLE public.donors IS 'People and organizations who donate to the non-profit';
COMMENT ON COLUMN public.donors.donor_type IS 'Type of donor: individual, foundation, corporation, government, other';
COMMENT ON COLUMN public.donors.is_anonymous IS 'Whether donor prefers to remain anonymous in public listings';

-- ============================================================================
-- 2. DONOR PROFILES TABLE (Extended Information)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.donor_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  donor_id UUID NOT NULL REFERENCES public.donors(id) ON DELETE CASCADE,

  -- Extended information
  employer TEXT,
  occupation TEXT,
  birth_date DATE,
  spouse_name TEXT,

  -- Relationship
  relationship_manager UUID REFERENCES auth.users(id),
  cultivation_stage TEXT CHECK (cultivation_stage IN ('prospect', 'cultivation', 'solicitation', 'stewardship')),

  -- Interests
  giving_interests TEXT[],
  preferred_programs TEXT[],

  -- Capacity
  estimated_capacity TEXT,
  capacity_rating INTEGER CHECK (capacity_rating BETWEEN 1 AND 5),

  -- Social
  linkedin_url TEXT,
  twitter_handle TEXT,

  -- Notes
  personal_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(donor_id)
);

CREATE INDEX IF NOT EXISTS idx_donor_profiles_donor ON public.donor_profiles(donor_id);

COMMENT ON TABLE public.donor_profiles IS 'Extended donor information for relationship management';

-- ============================================================================
-- 3. CONTRIBUTIONS RECEIVED TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.contributions_received (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  donor_id UUID REFERENCES public.donors(id) ON DELETE SET NULL,

  -- Contribution details
  contribution_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  contribution_type TEXT NOT NULL DEFAULT 'cash' CHECK (contribution_type IN (
    'cash', 'check', 'credit_card', 'wire', 'ach',
    'stock', 'crypto', 'real_estate', 'in_kind', 'other'
  )),

  -- For non-cash contributions
  non_cash_description TEXT,
  fair_market_value NUMERIC(15,2),

  -- Designation
  designation TEXT,  -- e.g., "General Fund", "Building Campaign"
  is_restricted BOOLEAN DEFAULT false,
  restriction_description TEXT,

  -- IRS requirements
  quid_pro_quo_value NUMERIC(15,2) DEFAULT 0,
  tax_deductible_amount NUMERIC(15,2) GENERATED ALWAYS AS (
    GREATEST(0, amount - COALESCE(quid_pro_quo_value, 0))
  ) STORED,

  -- Receipt tracking
  receipt_status TEXT DEFAULT 'pending' CHECK (receipt_status IN ('pending', 'generated', 'sent')),
  receipt_number TEXT,
  receipt_generated_at TIMESTAMPTZ,
  receipt_sent_at TIMESTAMPTZ,

  -- Acknowledgment tracking
  acknowledgment_status TEXT DEFAULT 'pending' CHECK (acknowledgment_status IN ('pending', 'draft', 'sent', 'delivered')),
  acknowledgment_sent_at TIMESTAMPTZ,

  -- Payment reference
  payment_reference TEXT,
  payment_method_detail TEXT,

  -- Campaign/appeal tracking
  campaign TEXT,
  appeal_code TEXT,

  -- Notes
  notes TEXT,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_contributions_org ON public.contributions_received(organization_id);
CREATE INDEX IF NOT EXISTS idx_contributions_donor ON public.contributions_received(donor_id);
CREATE INDEX IF NOT EXISTS idx_contributions_date ON public.contributions_received(organization_id, contribution_date DESC);
CREATE INDEX IF NOT EXISTS idx_contributions_type ON public.contributions_received(contribution_type);
CREATE INDEX IF NOT EXISTS idx_contributions_receipt_status ON public.contributions_received(organization_id, receipt_status) WHERE receipt_status != 'sent';
CREATE INDEX IF NOT EXISTS idx_contributions_ack_status ON public.contributions_received(organization_id, acknowledgment_status) WHERE acknowledgment_status != 'delivered';
CREATE INDEX IF NOT EXISTS idx_contributions_campaign ON public.contributions_received(organization_id, campaign) WHERE campaign IS NOT NULL;

COMMENT ON TABLE public.contributions_received IS 'Individual donations received by the organization';
COMMENT ON COLUMN public.contributions_received.quid_pro_quo_value IS 'IRS requirement: value of goods/services provided in exchange';
COMMENT ON COLUMN public.contributions_received.tax_deductible_amount IS 'Computed tax-deductible portion';

-- ============================================================================
-- 4. ACKNOWLEDGMENT LETTERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.acknowledgment_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  donor_id UUID REFERENCES public.donors(id) ON DELETE SET NULL,
  contribution_id UUID REFERENCES public.contributions_received(id) ON DELETE SET NULL,

  -- Letter type
  letter_type TEXT NOT NULL CHECK (letter_type IN (
    'tax_receipt', 'thank_you', 'annual_summary', 'welcome', 'custom'
  )),

  -- Letter content
  subject TEXT,
  body TEXT NOT NULL,

  -- IRS required fields (for tax receipts)
  org_name TEXT,
  org_ein TEXT,
  org_address TEXT,
  contribution_amount NUMERIC(15,2),
  contribution_date DATE,
  goods_services_statement TEXT,

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent', 'delivered')),

  -- Sending
  sent_via TEXT CHECK (sent_via IN ('email', 'mail', 'both')),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,

  -- Template
  template_id UUID,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_ack_letters_org ON public.acknowledgment_letters(organization_id);
CREATE INDEX IF NOT EXISTS idx_ack_letters_donor ON public.acknowledgment_letters(donor_id);
CREATE INDEX IF NOT EXISTS idx_ack_letters_contribution ON public.acknowledgment_letters(contribution_id);
CREATE INDEX IF NOT EXISTS idx_ack_letters_status ON public.acknowledgment_letters(organization_id, status) WHERE status != 'delivered';

COMMENT ON TABLE public.acknowledgment_letters IS 'Thank-you letters and tax receipts sent to donors';

-- ============================================================================
-- 5. DONOR COMMUNICATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.donor_communications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  donor_id UUID NOT NULL REFERENCES public.donors(id) ON DELETE CASCADE,

  -- Communication details
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  comm_type TEXT NOT NULL CHECK (comm_type IN ('email', 'phone', 'meeting', 'letter', 'event', 'other')),

  -- Content
  subject TEXT,
  summary TEXT NOT NULL,
  full_content TEXT,

  -- Timing
  occurred_at TIMESTAMPTZ DEFAULT NOW(),

  -- Follow-up
  follow_up_required BOOLEAN DEFAULT false,
  follow_up_date DATE,
  follow_up_notes TEXT,

  -- Staff
  logged_by UUID REFERENCES auth.users(id),
  assigned_to UUID REFERENCES auth.users(id),

  -- Metadata
  attachments JSONB DEFAULT '[]',
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_donor_comms_org ON public.donor_communications(organization_id);
CREATE INDEX IF NOT EXISTS idx_donor_comms_donor ON public.donor_communications(donor_id);
CREATE INDEX IF NOT EXISTS idx_donor_comms_date ON public.donor_communications(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_donor_comms_followup ON public.donor_communications(follow_up_date) WHERE follow_up_required = true;

COMMENT ON TABLE public.donor_communications IS 'Communication log with donors';

-- ============================================================================
-- VIEWS
-- ============================================================================

-- Donor summary with giving statistics and tier classification
CREATE OR REPLACE VIEW public.v_donor_summary AS
SELECT
  d.id as donor_id,
  d.organization_id,
  d.donor_type,
  CASE
    WHEN d.donor_type = 'individual' THEN CONCAT(d.first_name, ' ', d.last_name)
    ELSE d.organization_name
  END as display_name,
  d.email,
  d.is_anonymous,
  d.total_lifetime_giving,
  d.total_ytd_giving,
  d.first_gift_date,
  d.last_gift_date,
  d.gift_count,
  d.largest_gift,
  d.average_gift,
  -- Donor tier classification
  CASE
    WHEN d.total_lifetime_giving >= 100000 THEN 'major'
    WHEN d.total_lifetime_giving >= 10000 THEN 'leadership'
    WHEN d.gift_count >= 12 THEN 'sustainer'
    ELSE 'supporter'
  END as donor_tier,
  -- Recency status
  CASE
    WHEN d.last_gift_date >= CURRENT_DATE - INTERVAL '12 months' THEN 'active'
    WHEN d.last_gift_date >= CURRENT_DATE - INTERVAL '24 months' THEN 'lapsed'
    ELSE 'inactive'
  END as recency_status,
  CURRENT_DATE - d.last_gift_date as days_since_last_gift,
  EXISTS (
    SELECT 1 FROM public.contributions_received c
    WHERE c.donor_id = d.id AND c.receipt_status = 'pending'
  ) as has_pending_receipts,
  EXISTS (
    SELECT 1 FROM public.contributions_received c
    WHERE c.donor_id = d.id AND c.acknowledgment_status = 'pending'
  ) as has_pending_acknowledgments
FROM public.donors d;

COMMENT ON VIEW public.v_donor_summary IS 'Donor summary with giving statistics, tier, and recency';

-- Contribution with donor info
CREATE OR REPLACE VIEW public.v_contribution_with_donor AS
SELECT
  c.id as contribution_id,
  c.organization_id,
  c.donor_id,
  c.contribution_date,
  c.amount,
  c.contribution_type,
  c.designation,
  c.is_restricted,
  c.tax_deductible_amount,
  c.receipt_status,
  c.receipt_number,
  c.acknowledgment_status,
  c.campaign,
  c.appeal_code,
  c.created_at,
  d.donor_type,
  CASE
    WHEN d.donor_type = 'individual' THEN CONCAT(d.first_name, ' ', d.last_name)
    ELSE d.organization_name
  END as donor_name,
  d.email as donor_email,
  d.is_anonymous
FROM public.contributions_received c
LEFT JOIN public.donors d ON c.donor_id = d.id;

COMMENT ON VIEW public.v_contribution_with_donor IS 'Contributions with donor information';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Update donor giving stats (called by trigger)
CREATE OR REPLACE FUNCTION public.update_donor_giving_stats()
RETURNS TRIGGER AS $$
DECLARE
  v_donor_id UUID;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_donor_id := OLD.donor_id;
  ELSE
    v_donor_id := NEW.donor_id;
  END IF;

  IF v_donor_id IS NULL THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
  END IF;

  UPDATE public.donors
  SET
    total_lifetime_giving = COALESCE((
      SELECT SUM(amount) FROM public.contributions_received WHERE donor_id = v_donor_id
    ), 0),
    total_ytd_giving = COALESCE((
      SELECT SUM(amount) FROM public.contributions_received
      WHERE donor_id = v_donor_id AND EXTRACT(YEAR FROM contribution_date) = EXTRACT(YEAR FROM CURRENT_DATE)
    ), 0),
    first_gift_date = (SELECT MIN(contribution_date) FROM public.contributions_received WHERE donor_id = v_donor_id),
    last_gift_date = (SELECT MAX(contribution_date) FROM public.contributions_received WHERE donor_id = v_donor_id),
    gift_count = COALESCE((SELECT COUNT(*) FROM public.contributions_received WHERE donor_id = v_donor_id), 0),
    largest_gift = COALESCE((SELECT MAX(amount) FROM public.contributions_received WHERE donor_id = v_donor_id), 0),
    average_gift = COALESCE((SELECT AVG(amount) FROM public.contributions_received WHERE donor_id = v_donor_id), 0),
    updated_at = NOW()
  WHERE id = v_donor_id;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update donor stats
DROP TRIGGER IF EXISTS update_donor_stats_on_contribution ON public.contributions_received;
CREATE TRIGGER update_donor_stats_on_contribution
  AFTER INSERT OR UPDATE OR DELETE ON public.contributions_received
  FOR EACH ROW
  EXECUTE FUNCTION public.update_donor_giving_stats();

-- Generate receipt number
CREATE OR REPLACE FUNCTION public.generate_receipt_number(
  p_org_id UUID,
  p_year INTEGER DEFAULT NULL
)
RETURNS TEXT AS $$
DECLARE
  v_year INTEGER;
  v_seq INTEGER;
BEGIN
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);

  SELECT COALESCE(MAX(
    CASE
      WHEN receipt_number ~ ('^' || v_year || '-[0-9]+$') THEN
        SUBSTRING(receipt_number FROM '-([0-9]+)$')::INTEGER
      ELSE 0
    END
  ), 0) + 1
  INTO v_seq
  FROM public.contributions_received
  WHERE organization_id = p_org_id AND receipt_number LIKE v_year || '-%';

  RETURN v_year || '-' || LPAD(v_seq::TEXT, 5, '0');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.generate_receipt_number IS 'Generate unique receipt number in format YYYY-NNNNN';

-- Get donor annual summary
CREATE OR REPLACE FUNCTION public.get_donor_annual_summary(
  p_donor_id UUID,
  p_year INTEGER DEFAULT NULL
)
RETURNS TABLE (
  year INTEGER,
  total_contributions NUMERIC(15,2),
  total_tax_deductible NUMERIC(15,2),
  contribution_count INTEGER,
  contributions JSONB
) AS $$
DECLARE
  v_year INTEGER;
BEGIN
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER);

  RETURN QUERY
  SELECT
    v_year as year,
    COALESCE(SUM(c.amount), 0) as total_contributions,
    COALESCE(SUM(c.tax_deductible_amount), 0) as total_tax_deductible,
    COUNT(*)::INTEGER as contribution_count,
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', c.id,
      'date', c.contribution_date,
      'amount', c.amount,
      'type', c.contribution_type,
      'tax_deductible', c.tax_deductible_amount,
      'designation', c.designation,
      'receipt_number', c.receipt_number
    ) ORDER BY c.contribution_date), '[]'::jsonb) as contributions
  FROM public.contributions_received c
  WHERE c.donor_id = p_donor_id
    AND EXTRACT(YEAR FROM c.contribution_date) = v_year;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.get_donor_annual_summary IS 'Get annual giving summary for a donor';

-- Grant execute
GRANT EXECUTE ON FUNCTION public.update_donor_giving_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_receipt_number(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_donor_annual_summary(UUID, INTEGER) TO authenticated;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.donors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donor_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contributions_received ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.acknowledgment_letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.donor_communications ENABLE ROW LEVEL SECURITY;

-- Donors
DROP POLICY IF EXISTS "donors_read" ON public.donors;
CREATE POLICY "donors_read" ON public.donors
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "donors_write" ON public.donors;
CREATE POLICY "donors_write" ON public.donors
  FOR ALL TO authenticated
  USING (public.can_edit_org(organization_id))
  WITH CHECK (public.can_edit_org(organization_id));

DROP POLICY IF EXISTS "donors_service" ON public.donors;
CREATE POLICY "donors_service" ON public.donors
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Donor Profiles
DROP POLICY IF EXISTS "donor_profiles_read" ON public.donor_profiles;
CREATE POLICY "donor_profiles_read" ON public.donor_profiles
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.donors d
      WHERE d.id = donor_profiles.donor_id AND public.is_org_member(d.organization_id)
    )
  );

DROP POLICY IF EXISTS "donor_profiles_write" ON public.donor_profiles;
CREATE POLICY "donor_profiles_write" ON public.donor_profiles
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.donors d
      WHERE d.id = donor_profiles.donor_id AND public.can_edit_org(d.organization_id)
    )
  );

DROP POLICY IF EXISTS "donor_profiles_service" ON public.donor_profiles;
CREATE POLICY "donor_profiles_service" ON public.donor_profiles
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Contributions Received
DROP POLICY IF EXISTS "contributions_read" ON public.contributions_received;
CREATE POLICY "contributions_read" ON public.contributions_received
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "contributions_write" ON public.contributions_received;
CREATE POLICY "contributions_write" ON public.contributions_received
  FOR ALL TO authenticated
  USING (public.can_edit_org(organization_id))
  WITH CHECK (public.can_edit_org(organization_id));

DROP POLICY IF EXISTS "contributions_service" ON public.contributions_received;
CREATE POLICY "contributions_service" ON public.contributions_received
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Acknowledgment Letters
DROP POLICY IF EXISTS "ack_letters_read" ON public.acknowledgment_letters;
CREATE POLICY "ack_letters_read" ON public.acknowledgment_letters
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "ack_letters_write" ON public.acknowledgment_letters;
CREATE POLICY "ack_letters_write" ON public.acknowledgment_letters
  FOR ALL TO authenticated
  USING (public.can_edit_org(organization_id))
  WITH CHECK (public.can_edit_org(organization_id));

DROP POLICY IF EXISTS "ack_letters_service" ON public.acknowledgment_letters;
CREATE POLICY "ack_letters_service" ON public.acknowledgment_letters
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Donor Communications
DROP POLICY IF EXISTS "donor_comms_read" ON public.donor_communications;
CREATE POLICY "donor_comms_read" ON public.donor_communications
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS "donor_comms_write" ON public.donor_communications;
CREATE POLICY "donor_comms_write" ON public.donor_communications
  FOR ALL TO authenticated
  USING (public.can_edit_org(organization_id))
  WITH CHECK (public.can_edit_org(organization_id));

DROP POLICY IF EXISTS "donor_comms_service" ON public.donor_communications;
CREATE POLICY "donor_comms_service" ON public.donor_communications
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.donors TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.donor_profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.contributions_received TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.acknowledgment_letters TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.donor_communications TO authenticated;

GRANT ALL ON public.donors TO service_role;
GRANT ALL ON public.donor_profiles TO service_role;
GRANT ALL ON public.contributions_received TO service_role;
GRANT ALL ON public.acknowledgment_letters TO service_role;
GRANT ALL ON public.donor_communications TO service_role;

-- Views
GRANT SELECT ON public.v_donor_summary TO authenticated;
GRANT SELECT ON public.v_contribution_with_donor TO authenticated;
