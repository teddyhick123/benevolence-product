-- Organizations: top-level entity above portfolios
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  ein TEXT,
  org_type TEXT CHECK (org_type IN ('private_foundation', 'daf', 'community_foundation', 'family_office', 'operating_nonprofit', 'other')),
  fiscal_year_end DATE,
  state_of_incorporation TEXT,
  modules JSONB DEFAULT '{"portfolio": true, "tax": true, "grants": true, "compliance": false, "donors": false, "quickbooks": false}'::jsonb,
  branding JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- Organization members
CREATE TABLE IF NOT EXISTS public.organization_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(org_id, user_id)
);

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- RLS policies for organizations
DROP POLICY IF EXISTS "org_members_can_read" ON public.organizations;
CREATE POLICY "org_members_can_read" ON public.organizations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE org_id = organizations.id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "org_admins_can_update" ON public.organizations;
CREATE POLICY "org_admins_can_update" ON public.organizations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE org_id = organizations.id AND user_id = auth.uid()
      AND role IN ('owner', 'admin')
    )
  );

-- RLS for organization_members
DROP POLICY IF EXISTS "members_can_read_own_org" ON public.organization_members;
CREATE POLICY "members_can_read_own_org" ON public.organization_members
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "admins_can_manage_members" ON public.organization_members;
CREATE POLICY "admins_can_manage_members" ON public.organization_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.org_id = organization_members.org_id
        AND om.user_id = auth.uid()
        AND om.role IN ('owner', 'admin')
    )
  );

-- Helper RPCs
CREATE OR REPLACE FUNCTION public.org_role(p_org_id UUID)
RETURNS TEXT
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT role FROM public.organization_members
  WHERE org_id = p_org_id AND user_id = auth.uid()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = p_org_id AND user_id = auth.uid()
    AND role IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.can_edit_org(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE org_id = p_org_id AND user_id = auth.uid()
    AND role IN ('owner', 'admin', 'member')
  );
$$;
