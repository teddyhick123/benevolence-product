-- Migration: Donors table, summary view, and FK on tax_contributions

-- ============================================================================
-- 1. DONORS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.donors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Identity
  donor_type TEXT NOT NULL DEFAULT 'individual' CHECK (donor_type IN ('individual', 'organization', 'foundation', 'estate', 'trust')),
  first_name TEXT,
  last_name TEXT,
  organization_name TEXT,  -- populated when donor_type != 'individual'
  contact_name TEXT,       -- primary contact for org/foundation donors
  is_anonymous BOOLEAN NOT NULL DEFAULT false,

  -- Contact
  email TEXT,
  phone TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  city TEXT,
  state TEXT,
  postal_code TEXT,
  country TEXT DEFAULT 'United States',

  -- Classification
  donor_tier TEXT CHECK (donor_tier IN ('major', 'mid_major', 'regular', 'small', 'prospect')),
  communication_preference TEXT DEFAULT 'email' CHECK (communication_preference IN ('email', 'mail', 'phone', 'none')),
  do_not_contact BOOLEAN NOT NULL DEFAULT false,

  -- Metadata
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_donors_org ON public.donors(organization_id);
CREATE INDEX idx_donors_email ON public.donors(organization_id, email);
CREATE INDEX idx_donors_type ON public.donors(organization_id, donor_type);
CREATE INDEX idx_donors_tier ON public.donors(organization_id, donor_tier);

-- ============================================================================
-- 2. CONTRIBUTIONS RECEIVED — org-scoped inbound donations for donor tracking
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.contributions_received (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  donor_id UUID NOT NULL REFERENCES public.donors(id) ON DELETE CASCADE,

  contribution_date DATE NOT NULL,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  contribution_type TEXT NOT NULL DEFAULT 'cash' CHECK (contribution_type IN ('cash', 'check', 'wire', 'stock', 'crypto', 'real_estate', 'other_property', 'in_kind')),
  fund TEXT,                    -- restricted fund / campaign
  campaign TEXT,
  is_recurring BOOLEAN DEFAULT false,
  is_tax_deductible BOOLEAN DEFAULT true,
  quid_pro_quo_value NUMERIC DEFAULT 0 CHECK (quid_pro_quo_value >= 0),
  deductible_amount NUMERIC CHECK (deductible_amount >= 0),

  acknowledgment_status TEXT DEFAULT 'pending' CHECK (acknowledgment_status IN ('pending', 'draft', 'sent', 'not_required')),
  receipt_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contributions_received_org ON public.contributions_received(organization_id);
CREATE INDEX idx_contributions_received_donor ON public.contributions_received(donor_id);
CREATE INDEX idx_contributions_received_date ON public.contributions_received(organization_id, contribution_date);

-- ============================================================================
-- 3. FK on tax_contributions: optional link to a donor record
-- ============================================================================
ALTER TABLE public.tax_contributions
  ADD COLUMN IF NOT EXISTS donor_id UUID REFERENCES public.donors(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tax_contributions_donor ON public.tax_contributions(donor_id);

-- ============================================================================
-- 4. V_DONOR_SUMMARY VIEW
-- ============================================================================
CREATE OR REPLACE VIEW public.v_donor_summary AS
SELECT
  d.id,
  d.organization_id,
  d.donor_type,
  d.is_anonymous,
  d.first_name,
  d.last_name,
  d.organization_name,
  d.contact_name,
  d.email,
  d.phone,
  d.city,
  d.state,
  d.country,
  d.donor_tier,
  d.communication_preference,
  d.do_not_contact,
  d.tags,
  d.notes,
  d.created_at,
  d.updated_at,

  -- Computed display name
  CASE
    WHEN d.is_anonymous THEN 'Anonymous'
    WHEN d.donor_type = 'individual' THEN TRIM(COALESCE(d.first_name, '') || ' ' || COALESCE(d.last_name, ''))
    ELSE COALESCE(d.organization_name, d.contact_name, 'Unknown')
  END AS display_name,

  -- Aggregated giving metrics from contributions_received
  COALESCE(SUM(cr.amount), 0) AS total_lifetime_giving,
  COUNT(cr.id)::INTEGER AS total_gift_count,
  MAX(cr.contribution_date) AS last_gift_date,
  MIN(cr.contribution_date) AS first_gift_date,

  -- Pending receipts / ack count
  COUNT(cr.id) FILTER (WHERE cr.acknowledgment_status = 'pending')::INTEGER AS pending_acknowledgments_count,
  (COUNT(cr.id) FILTER (WHERE cr.acknowledgment_status = 'pending') > 0) AS has_pending_acknowledgments,

  -- Recency classification
  CASE
    WHEN MAX(cr.contribution_date) IS NULL THEN 'prospect'
    WHEN MAX(cr.contribution_date) >= CURRENT_DATE - INTERVAL '12 months' AND MIN(cr.contribution_date) = MAX(cr.contribution_date) THEN 'new'
    WHEN MAX(cr.contribution_date) >= CURRENT_DATE - INTERVAL '12 months' THEN 'active'
    WHEN MAX(cr.contribution_date) >= CURRENT_DATE - INTERVAL '36 months' THEN 'lapsed'
    ELSE 'lost'
  END AS recency_status,

  -- Auto-tier override if no manual tier set
  COALESCE(d.donor_tier,
    CASE
      WHEN COALESCE(SUM(cr.amount), 0) >= 10000 THEN 'major'
      WHEN COALESCE(SUM(cr.amount), 0) >= 1000 THEN 'mid_major'
      WHEN COALESCE(SUM(cr.amount), 0) >= 100 THEN 'regular'
      WHEN COALESCE(SUM(cr.amount), 0) > 0 THEN 'small'
      ELSE 'prospect'
    END
  ) AS computed_tier

FROM public.donors d
LEFT JOIN public.contributions_received cr ON cr.donor_id = d.id

GROUP BY d.id;

GRANT SELECT ON public.v_donor_summary TO authenticated;

-- ============================================================================
-- 5. TRIGGERS
-- ============================================================================
CREATE TRIGGER update_donors_updated_at BEFORE UPDATE ON public.donors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contributions_received_updated_at BEFORE UPDATE ON public.contributions_received
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 6. ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE public.donors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contributions_received ENABLE ROW LEVEL SECURITY;

-- Helper: check org membership
DROP POLICY IF EXISTS "org_members_can_read_donors" ON public.donors;
CREATE POLICY "org_members_can_read_donors" ON public.donors
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = donors.organization_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org_editors_can_insert_donors" ON public.donors;
CREATE POLICY "org_editors_can_insert_donors" ON public.donors
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = donors.organization_id AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'member')
    )
  );

DROP POLICY IF EXISTS "org_editors_can_update_donors" ON public.donors;
CREATE POLICY "org_editors_can_update_donors" ON public.donors
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = donors.organization_id AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'member')
    )
  );

DROP POLICY IF EXISTS "org_admins_can_delete_donors" ON public.donors;
CREATE POLICY "org_admins_can_delete_donors" ON public.donors
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = donors.organization_id AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  );

-- contributions_received RLS
DROP POLICY IF EXISTS "org_members_can_read_contributions" ON public.contributions_received;
CREATE POLICY "org_members_can_read_contributions" ON public.contributions_received
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = contributions_received.organization_id AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org_editors_can_manage_contributions" ON public.contributions_received;
CREATE POLICY "org_editors_can_manage_contributions" ON public.contributions_received
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = contributions_received.organization_id AND om.user_id = auth.uid()
      AND om.role IN ('owner', 'admin', 'member')
    )
  );
