-- Migration: Create organizations system for non-profit self-service data management
-- Description: Organizations can manage their own metrics/data, linked to holdings across portfolios
-- Date: 2025-02-09

-- =============================================================================
-- 1. ORGANIZATIONS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  ein TEXT UNIQUE,  -- IRS Employer ID for US nonprofits
  charity_id UUID REFERENCES public.charities(id),  -- Link to global charities DB
  logo_url TEXT,
  website TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for charity lookup
CREATE INDEX IF NOT EXISTS idx_organizations_charity_id ON public.organizations(charity_id);
CREATE INDEX IF NOT EXISTS idx_organizations_ein ON public.organizations(ein);

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_organizations_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS organizations_updated_at_trigger ON public.organizations;
CREATE TRIGGER organizations_updated_at_trigger
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_organizations_updated_at();

-- =============================================================================
-- 2. ORGANIZATION MEMBERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.organization_members (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, organization_id)
);

-- Index for looking up user's organizations
CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_org_id ON public.organization_members(organization_id);

-- =============================================================================
-- 3. ORGANIZATION HOLDINGS LINK TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.organization_holdings (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  holding_id UUID NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (organization_id, holding_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_organization_holdings_org_id ON public.organization_holdings(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_holdings_holding_id ON public.organization_holdings(holding_id);

-- =============================================================================
-- 4. ADD ORG CONTEXT TO METRIC TABLES
-- =============================================================================
-- Add submitted_by_org_id to staging_metric_facts
ALTER TABLE public.staging_metric_facts
  ADD COLUMN IF NOT EXISTS submitted_by_org_id UUID REFERENCES public.organizations(id);

CREATE INDEX IF NOT EXISTS idx_staging_metric_facts_org_id
  ON public.staging_metric_facts(submitted_by_org_id);

-- Add submitted_by_org_id to metric_facts
ALTER TABLE public.metric_facts
  ADD COLUMN IF NOT EXISTS submitted_by_org_id UUID REFERENCES public.organizations(id);

CREATE INDEX IF NOT EXISTS idx_metric_facts_org_id
  ON public.metric_facts(submitted_by_org_id);

-- =============================================================================
-- 5. HELPER FUNCTIONS
-- =============================================================================

-- Check if user is member of an organization
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = p_org_id
      AND user_id = auth.uid()
  );
$$;

-- Get user's role in an organization
CREATE OR REPLACE FUNCTION public.org_role(p_org_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.organization_members
  WHERE organization_id = p_org_id
    AND user_id = auth.uid()
  LIMIT 1;
$$;

-- Check if user can edit organization (admin or editor)
CREATE OR REPLACE FUNCTION public.can_edit_org(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.is_admin(), false)
    OR EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = p_org_id
        AND user_id = auth.uid()
        AND role IN ('admin', 'editor')
    );
$$;

-- Check if user is org admin
CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.is_admin(), false)
    OR EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE organization_id = p_org_id
        AND user_id = auth.uid()
        AND role = 'admin'
    );
$$;

-- Check if user can view org data through linked holding
CREATE OR REPLACE FUNCTION public.can_view_org_through_holding(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_holdings oh
    JOIN public.holdings h ON h.id = oh.holding_id
    JOIN public.portfolio_members pm ON pm.portfolio_id = h.portfolio_id
    WHERE oh.organization_id = p_org_id
      AND pm.user_id = auth.uid()
      AND oh.verified_at IS NOT NULL
  );
$$;

-- Grant execute permissions
REVOKE ALL ON FUNCTION public.is_org_member(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.org_role(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.org_role(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.can_edit_org(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.can_edit_org(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.is_org_admin(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.is_org_admin(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.can_view_org_through_holding(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.can_view_org_through_holding(UUID) TO authenticated;

-- =============================================================================
-- 6. ROW LEVEL SECURITY
-- =============================================================================

-- Organizations: readable by members or portfolio members with linked holdings
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_read" ON public.organizations;
CREATE POLICY "org_read" ON public.organizations
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(id)
    OR public.can_view_org_through_holding(id)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "org_insert" ON public.organizations;
CREATE POLICY "org_insert" ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (true);  -- Anyone can create an org (they become admin)

DROP POLICY IF EXISTS "org_update" ON public.organizations;
CREATE POLICY "org_update" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(id))
  WITH CHECK (public.is_org_admin(id));

DROP POLICY IF EXISTS "org_delete" ON public.organizations;
CREATE POLICY "org_delete" ON public.organizations
  FOR DELETE TO authenticated
  USING (public.is_org_admin(id));

-- Service role bypass
DROP POLICY IF EXISTS "org_service" ON public.organizations;
CREATE POLICY "org_service" ON public.organizations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Organization Members: readable by org members
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_read" ON public.organization_members;
CREATE POLICY "org_members_read" ON public.organization_members
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "org_members_insert" ON public.organization_members;
CREATE POLICY "org_members_insert" ON public.organization_members
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "org_members_update" ON public.organization_members;
CREATE POLICY "org_members_update" ON public.organization_members
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "org_members_delete" ON public.organization_members;
CREATE POLICY "org_members_delete" ON public.organization_members
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "org_members_service" ON public.organization_members;
CREATE POLICY "org_members_service" ON public.organization_members
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Organization Holdings: readable by org members and portfolio members
ALTER TABLE public.organization_holdings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_holdings_read" ON public.organization_holdings;
CREATE POLICY "org_holdings_read" ON public.organization_holdings
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    OR EXISTS (
      SELECT 1 FROM public.holdings h
      JOIN public.portfolio_members pm ON pm.portfolio_id = h.portfolio_id
      WHERE h.id = holding_id AND pm.user_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "org_holdings_insert" ON public.organization_holdings;
CREATE POLICY "org_holdings_insert" ON public.organization_holdings
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "org_holdings_update" ON public.organization_holdings;
CREATE POLICY "org_holdings_update" ON public.organization_holdings
  FOR UPDATE TO authenticated
  USING (
    -- Org admin can request link, portfolio owner can verify
    public.is_org_admin(organization_id)
    OR EXISTS (
      SELECT 1 FROM public.holdings h
      JOIN public.portfolio_members pm ON pm.portfolio_id = h.portfolio_id
      WHERE h.id = holding_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    public.is_org_admin(organization_id)
    OR EXISTS (
      SELECT 1 FROM public.holdings h
      JOIN public.portfolio_members pm ON pm.portfolio_id = h.portfolio_id
      WHERE h.id = holding_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "org_holdings_delete" ON public.organization_holdings;
CREATE POLICY "org_holdings_delete" ON public.organization_holdings
  FOR DELETE TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR EXISTS (
      SELECT 1 FROM public.holdings h
      JOIN public.portfolio_members pm ON pm.portfolio_id = h.portfolio_id
      WHERE h.id = holding_id
        AND pm.user_id = auth.uid()
        AND pm.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "org_holdings_service" ON public.organization_holdings;
CREATE POLICY "org_holdings_service" ON public.organization_holdings
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- =============================================================================
-- 7. GRANTS
-- =============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_holdings TO authenticated;
GRANT ALL ON public.organizations TO service_role;
GRANT ALL ON public.organization_members TO service_role;
GRANT ALL ON public.organization_holdings TO service_role;

-- =============================================================================
-- 8. COMMENTS
-- =============================================================================
COMMENT ON TABLE public.organizations IS 'Non-profit organizations that can self-manage their impact data';
COMMENT ON TABLE public.organization_members IS 'Users who can manage organization data with role-based access';
COMMENT ON TABLE public.organization_holdings IS 'Links organizations to holdings across portfolios for data sharing';
COMMENT ON COLUMN public.staging_metric_facts.submitted_by_org_id IS 'Organization that submitted this metric (for org-submitted data workflow)';
COMMENT ON COLUMN public.metric_facts.submitted_by_org_id IS 'Organization that submitted this metric (for tracking data provenance)';
