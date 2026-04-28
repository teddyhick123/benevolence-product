-- ============================================================================
-- CORE MODULE - Required for all deployments
-- ============================================================================
-- Description: Core tables, functions, and policies for the Benevolence platform
-- Tables: profiles, portfolios, portfolio_members, portfolio_settings, holdings,
--         organizations, organization_members, organization_holdings,
--         modules, module_presets, organization_modules, admins, uploads,
--         widgets, holding_widgets
-- ============================================================================

-- ============================================================================
-- EXTENSIONS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUMS
-- ============================================================================

-- Holding status enum
DO $$ BEGIN
  CREATE TYPE holding_status AS ENUM ('Active', 'Completed', 'Pending', 'Cancelled');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Asset type enum (comprehensive)
DO $$ BEGIN
  CREATE TYPE asset_type_enum AS ENUM (
    'cash',
    'equity',
    'fixed_income',
    'real_estate',
    'private_equity',
    'hedge_fund',
    'venture_capital',
    'direct_investment',
    'foundation_grant',
    'daf_grant',
    'charity_donation',
    'impact_investment',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 1. PROFILES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID,  -- Default portfolio
  display_name TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'User profiles linked to Supabase auth';
COMMENT ON COLUMN public.profiles.portfolio_id IS 'Users default/last-viewed portfolio';

-- ============================================================================
-- 2. PORTFOLIOS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_family TEXT,
  base_currency TEXT DEFAULT 'USD',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.portfolios IS 'Investment/grant portfolios';

-- Add FK after portfolios exists
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_portfolio_id_fkey,
  ADD CONSTRAINT profiles_portfolio_id_fkey
    FOREIGN KEY (portfolio_id) REFERENCES public.portfolios(id);

-- ============================================================================
-- 3. PORTFOLIO MEMBERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.portfolio_members (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, portfolio_id)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_members_portfolio ON public.portfolio_members(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_members_user ON public.portfolio_members(user_id);

COMMENT ON TABLE public.portfolio_members IS 'User-portfolio membership with roles';

-- ============================================================================
-- 4. PORTFOLIO SETTINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.portfolio_settings (
  portfolio_id UUID PRIMARY KEY REFERENCES public.portfolios(id) ON DELETE CASCADE,
  show_map BOOLEAN DEFAULT true,
  widgets JSONB DEFAULT '["kpi_waci", "sector_emissions"]'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.portfolio_settings IS 'Portfolio display configuration';

-- ============================================================================
-- 5. ADMINS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.admins IS 'Platform administrators with elevated privileges';

-- ============================================================================
-- 6. HOLDINGS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID REFERENCES public.portfolios(id) ON DELETE CASCADE,

  -- Basic info
  name TEXT,
  status holding_status DEFAULT 'Active',
  funds_allocated NUMERIC,
  as_of DATE,

  -- Classification
  asset_type asset_type_enum,
  asset_subtype TEXT,
  asset_class TEXT,
  sector TEXT,
  country TEXT,

  -- Extended info
  custodian TEXT,
  valuation_method TEXT,
  description TEXT,
  theory_of_action TEXT,
  cost_per_outcome NUMERIC,
  cost_per_outcome_unit TEXT,
  website TEXT,

  -- Contact info
  primary_contact_name TEXT,
  primary_contact_email TEXT,
  contact_notes TEXT,

  -- Location
  location_city TEXT,
  location_state TEXT,
  location_country TEXT,

  -- External links
  charity_id UUID,  -- Links to charities table

  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holdings_portfolio ON public.holdings(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_holdings_status ON public.holdings(status);
CREATE INDEX IF NOT EXISTS idx_holdings_sector ON public.holdings(sector);
CREATE INDEX IF NOT EXISTS idx_holdings_asset_type ON public.holdings(asset_type);
CREATE INDEX IF NOT EXISTS idx_holdings_charity ON public.holdings(charity_id) WHERE charity_id IS NOT NULL;

COMMENT ON TABLE public.holdings IS 'Individual holdings within portfolios';

-- ============================================================================
-- 7. ORGANIZATIONS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  ein TEXT UNIQUE,  -- IRS Employer ID for US nonprofits
  charity_id UUID,  -- Link to global charities DB (if exists)
  logo_url TEXT,
  website TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_ein ON public.organizations(ein);
CREATE INDEX IF NOT EXISTS idx_organizations_charity_id ON public.organizations(charity_id);

COMMENT ON TABLE public.organizations IS 'Non-profit organizations that can self-manage their impact data';

-- ============================================================================
-- 8. ORGANIZATION MEMBERS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.organization_members (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_members_user_id ON public.organization_members(user_id);
CREATE INDEX IF NOT EXISTS idx_organization_members_org_id ON public.organization_members(organization_id);

COMMENT ON TABLE public.organization_members IS 'Users who can manage organization data with role-based access';

-- ============================================================================
-- 9. ORGANIZATION HOLDINGS LINK TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.organization_holdings (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  holding_id UUID NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  verified_at TIMESTAMPTZ,
  verified_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (organization_id, holding_id)
);

CREATE INDEX IF NOT EXISTS idx_organization_holdings_org_id ON public.organization_holdings(organization_id);
CREATE INDEX IF NOT EXISTS idx_organization_holdings_holding_id ON public.organization_holdings(holding_id);

COMMENT ON TABLE public.organization_holdings IS 'Links organizations to holdings across portfolios for data sharing';

-- ============================================================================
-- 10. MODULES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.modules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_core BOOLEAN DEFAULT false,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  dependencies TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.modules IS 'Available feature modules that can be enabled per organization';
COMMENT ON COLUMN public.modules.is_core IS 'Core modules are always enabled and cannot be disabled';
COMMENT ON COLUMN public.modules.dependencies IS 'Array of module IDs that must be enabled before this module';

-- ============================================================================
-- 11. MODULE PRESETS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.module_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  module_ids TEXT[] NOT NULL,
  sort_order INTEGER DEFAULT 0
);

COMMENT ON TABLE public.module_presets IS 'Pre-configured module bundles for common organization types';

-- ============================================================================
-- 12. ORGANIZATION MODULES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.organization_modules (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  enabled_at TIMESTAMPTZ DEFAULT NOW(),
  enabled_by UUID REFERENCES auth.users(id),
  config JSONB DEFAULT '{}'::jsonb,
  PRIMARY KEY (organization_id, module_id)
);

CREATE INDEX IF NOT EXISTS idx_org_modules_org_id ON public.organization_modules(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_modules_module_id ON public.organization_modules(module_id);

COMMENT ON TABLE public.organization_modules IS 'Tracks which modules are enabled for each organization';

-- ============================================================================
-- 13. UPLOADS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.uploads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT,
  file_ext TEXT,
  bytes BIGINT,
  uploaded_by UUID,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued|processing|done|error
  job_id UUID,
  portfolio_id UUID REFERENCES public.portfolios(id),
  holding_id UUID REFERENCES public.holdings(id),
  ai_mode BOOLEAN,
  selected_metrics TEXT[],
  storage_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uploads_portfolio ON public.uploads(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_uploads_holding ON public.uploads(holding_id);
CREATE INDEX IF NOT EXISTS idx_uploads_status ON public.uploads(status);

COMMENT ON TABLE public.uploads IS 'File upload tracking and processing status';

-- ============================================================================
-- 14. WIDGETS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT,
  config JSONB,
  position INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_widgets_portfolio ON public.widgets(portfolio_id);

COMMENT ON TABLE public.widgets IS 'Custom dashboard widgets';

-- ============================================================================
-- 15. HOLDING WIDGETS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.holding_widgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holding_id UUID NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  widget_type TEXT NOT NULL,
  position INTEGER DEFAULT 0,
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holding_widgets_holding ON public.holding_widgets(holding_id);

COMMENT ON TABLE public.holding_widgets IS 'Per-holding widget configurations';

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Generic updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Check if user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins WHERE user_id = auth.uid()
  );
$$;

-- Check if user can edit portfolio
CREATE OR REPLACE FUNCTION public.can_edit_portfolio(p_portfolio_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.is_admin(), false)
    OR EXISTS (
      SELECT 1 FROM public.portfolio_members m
      WHERE m.portfolio_id = p_portfolio_id
        AND m.user_id = auth.uid()
        AND m.role IN ('editor', 'owner')
    );
$$;

-- Check if user can view portfolio
CREATE OR REPLACE FUNCTION public.can_view_portfolio(p_portfolio_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(public.is_admin(), false)
    OR EXISTS (
      SELECT 1 FROM public.portfolio_members m
      WHERE m.portfolio_id = p_portfolio_id
        AND m.user_id = auth.uid()
    );
$$;

-- Get user's role in portfolio
CREATE OR REPLACE FUNCTION public.role_for_portfolio(p_portfolio_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN public.is_admin() THEN 'admin'
    ELSE (SELECT m.role FROM public.portfolio_members m
          WHERE m.portfolio_id = p_portfolio_id AND m.user_id = auth.uid()
          LIMIT 1)
  END;
$$;

-- Count owners for portfolio (safety check)
CREATE OR REPLACE FUNCTION public.owner_count_for_portfolio(p_portfolio_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::INTEGER FROM public.portfolio_members
  WHERE portfolio_id = p_portfolio_id AND role = 'owner';
$$;

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
    WHERE organization_id = p_org_id AND user_id = auth.uid()
  );
$$;

-- Get user's role in organization
CREATE OR REPLACE FUNCTION public.org_role(p_org_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.organization_members
  WHERE organization_id = p_org_id AND user_id = auth.uid()
  LIMIT 1;
$$;

-- Check if user can edit organization
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

-- Check if user can view org through linked holding
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

-- Check if org has a specific module enabled
CREATE OR REPLACE FUNCTION public.org_has_module(p_org_id UUID, p_module_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.modules m
    LEFT JOIN public.organization_modules om
      ON om.module_id = m.id AND om.organization_id = p_org_id
    WHERE m.id = p_module_id
      AND (m.is_core = true OR om.organization_id IS NOT NULL)
  );
$$;

-- Get all enabled modules for an organization
CREATE OR REPLACE FUNCTION public.get_org_modules(p_org_id UUID)
RETURNS TABLE(module_id TEXT, name TEXT, description TEXT, config JSONB)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    m.id as module_id,
    m.name,
    m.description,
    COALESCE(om.config, '{}'::jsonb) as config
  FROM public.modules m
  LEFT JOIN public.organization_modules om
    ON om.module_id = m.id AND om.organization_id = p_org_id
  WHERE m.is_core = true OR om.organization_id IS NOT NULL
  ORDER BY m.sort_order;
$$;

-- ============================================================================
-- GRANT EXECUTE ON FUNCTIONS
-- ============================================================================
REVOKE ALL ON FUNCTION public.is_admin() FROM public;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

REVOKE ALL ON FUNCTION public.can_edit_portfolio(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.can_edit_portfolio(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.can_view_portfolio(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.can_view_portfolio(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.role_for_portfolio(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.role_for_portfolio(UUID) TO authenticated;

REVOKE ALL ON FUNCTION public.owner_count_for_portfolio(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.owner_count_for_portfolio(UUID) TO authenticated;

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

REVOKE ALL ON FUNCTION public.org_has_module(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.org_has_module(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_has_module(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.get_org_modules(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.get_org_modules(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_modules(UUID) TO service_role;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Organizations updated_at
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

-- Holdings updated_at
DROP TRIGGER IF EXISTS holdings_updated_at ON public.holdings;
CREATE TRIGGER holdings_updated_at
  BEFORE UPDATE ON public.holdings
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- Portfolios updated_at
DROP TRIGGER IF EXISTS portfolios_updated_at ON public.portfolios;
CREATE TRIGGER portfolios_updated_at
  BEFORE UPDATE ON public.portfolios
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all core tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.portfolio_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_holdings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.module_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.widgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.holding_widgets ENABLE ROW LEVEL SECURITY;

-- ==================== PROFILES ====================
DROP POLICY IF EXISTS "profiles_own" ON public.profiles;
CREATE POLICY "profiles_own" ON public.profiles
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "profiles_service" ON public.profiles;
CREATE POLICY "profiles_service" ON public.profiles
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================== PORTFOLIOS ====================
DROP POLICY IF EXISTS "portfolios_read" ON public.portfolios;
CREATE POLICY "portfolios_read" ON public.portfolios
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.portfolio_members m
      WHERE m.portfolio_id = portfolios.id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "portfolios_insert" ON public.portfolios;
CREATE POLICY "portfolios_insert" ON public.portfolios
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "portfolios_update" ON public.portfolios;
CREATE POLICY "portfolios_update" ON public.portfolios
  FOR UPDATE TO authenticated
  USING (public.can_edit_portfolio(id))
  WITH CHECK (public.can_edit_portfolio(id));

DROP POLICY IF EXISTS "portfolios_delete" ON public.portfolios;
CREATE POLICY "portfolios_delete" ON public.portfolios
  FOR DELETE TO authenticated
  USING (public.is_admin() OR EXISTS (
    SELECT 1 FROM public.portfolio_members m
    WHERE m.portfolio_id = portfolios.id AND m.user_id = auth.uid() AND m.role = 'owner'
  ));

DROP POLICY IF EXISTS "portfolios_service" ON public.portfolios;
CREATE POLICY "portfolios_service" ON public.portfolios
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================== PORTFOLIO MEMBERS ====================
DROP POLICY IF EXISTS "portfolio_members_read" ON public.portfolio_members;
CREATE POLICY "portfolio_members_read" ON public.portfolio_members
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.portfolio_members m2
      WHERE m2.portfolio_id = portfolio_members.portfolio_id AND m2.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "portfolio_members_insert" ON public.portfolio_members;
CREATE POLICY "portfolio_members_insert" ON public.portfolio_members
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.can_edit_portfolio(portfolio_id)
    OR user_id = auth.uid()  -- Users can add themselves
  );

DROP POLICY IF EXISTS "portfolio_members_update" ON public.portfolio_members;
CREATE POLICY "portfolio_members_update" ON public.portfolio_members
  FOR UPDATE TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "portfolio_members_delete" ON public.portfolio_members;
CREATE POLICY "portfolio_members_delete" ON public.portfolio_members
  FOR DELETE TO authenticated
  USING (public.can_edit_portfolio(portfolio_id) OR user_id = auth.uid());

DROP POLICY IF EXISTS "portfolio_members_service" ON public.portfolio_members;
CREATE POLICY "portfolio_members_service" ON public.portfolio_members
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================== HOLDINGS ====================
DROP POLICY IF EXISTS "holdings_read" ON public.holdings;
CREATE POLICY "holdings_read" ON public.holdings
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR EXISTS (
      SELECT 1 FROM public.portfolio_members m
      WHERE m.portfolio_id = holdings.portfolio_id AND m.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "holdings_write" ON public.holdings;
CREATE POLICY "holdings_write" ON public.holdings
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "holdings_service" ON public.holdings;
CREATE POLICY "holdings_service" ON public.holdings
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================== ORGANIZATIONS ====================
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
  WITH CHECK (true);

DROP POLICY IF EXISTS "org_update" ON public.organizations;
CREATE POLICY "org_update" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(id))
  WITH CHECK (public.is_org_admin(id));

DROP POLICY IF EXISTS "org_delete" ON public.organizations;
CREATE POLICY "org_delete" ON public.organizations
  FOR DELETE TO authenticated
  USING (public.is_org_admin(id));

DROP POLICY IF EXISTS "org_service" ON public.organizations;
CREATE POLICY "org_service" ON public.organizations
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================== ORGANIZATION MEMBERS ====================
DROP POLICY IF EXISTS "org_members_read" ON public.organization_members;
CREATE POLICY "org_members_read" ON public.organization_members
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_admin());

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

-- ==================== ORGANIZATION HOLDINGS ====================
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
    public.is_org_admin(organization_id)
    OR EXISTS (
      SELECT 1 FROM public.holdings h
      JOIN public.portfolio_members pm ON pm.portfolio_id = h.portfolio_id
      WHERE h.id = holding_id AND pm.user_id = auth.uid() AND pm.role IN ('owner', 'editor')
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
      WHERE h.id = holding_id AND pm.user_id = auth.uid() AND pm.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "org_holdings_service" ON public.organization_holdings;
CREATE POLICY "org_holdings_service" ON public.organization_holdings
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================== MODULES ====================
DROP POLICY IF EXISTS "modules_read" ON public.modules;
CREATE POLICY "modules_read" ON public.modules
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "modules_service" ON public.modules;
CREATE POLICY "modules_service" ON public.modules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================== MODULE PRESETS ====================
DROP POLICY IF EXISTS "presets_read" ON public.module_presets;
CREATE POLICY "presets_read" ON public.module_presets
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "presets_service" ON public.module_presets;
CREATE POLICY "presets_service" ON public.module_presets
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================== ORGANIZATION MODULES ====================
DROP POLICY IF EXISTS "org_modules_read" ON public.organization_modules;
CREATE POLICY "org_modules_read" ON public.organization_modules
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_admin());

DROP POLICY IF EXISTS "org_modules_insert" ON public.organization_modules;
CREATE POLICY "org_modules_insert" ON public.organization_modules
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "org_modules_update" ON public.organization_modules;
CREATE POLICY "org_modules_update" ON public.organization_modules
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "org_modules_delete" ON public.organization_modules;
CREATE POLICY "org_modules_delete" ON public.organization_modules
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS "org_modules_service" ON public.organization_modules;
CREATE POLICY "org_modules_service" ON public.organization_modules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================== ADMINS ====================
DROP POLICY IF EXISTS "admins_read" ON public.admins;
CREATE POLICY "admins_read" ON public.admins
  FOR SELECT TO authenticated
  USING (public.is_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS "admins_service" ON public.admins;
CREATE POLICY "admins_service" ON public.admins
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================== UPLOADS ====================
DROP POLICY IF EXISTS "uploads_read" ON public.uploads;
CREATE POLICY "uploads_read" ON public.uploads
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR uploaded_by = auth.uid()
    OR public.can_view_portfolio(portfolio_id)
  );

DROP POLICY IF EXISTS "uploads_insert" ON public.uploads;
CREATE POLICY "uploads_insert" ON public.uploads
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "uploads_update" ON public.uploads;
CREATE POLICY "uploads_update" ON public.uploads
  FOR UPDATE TO authenticated
  USING (uploaded_by = auth.uid() OR public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "uploads_service" ON public.uploads;
CREATE POLICY "uploads_service" ON public.uploads
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================== WIDGETS ====================
DROP POLICY IF EXISTS "widgets_read" ON public.widgets;
CREATE POLICY "widgets_read" ON public.widgets
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

DROP POLICY IF EXISTS "widgets_write" ON public.widgets;
CREATE POLICY "widgets_write" ON public.widgets
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

DROP POLICY IF EXISTS "widgets_service" ON public.widgets;
CREATE POLICY "widgets_service" ON public.widgets
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ==================== HOLDING WIDGETS ====================
DROP POLICY IF EXISTS "holding_widgets_read" ON public.holding_widgets;
CREATE POLICY "holding_widgets_read" ON public.holding_widgets
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.holdings h
      JOIN public.portfolio_members pm ON pm.portfolio_id = h.portfolio_id
      WHERE h.id = holding_widgets.holding_id AND pm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "holding_widgets_write" ON public.holding_widgets;
CREATE POLICY "holding_widgets_write" ON public.holding_widgets
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.holdings h
      WHERE h.id = holding_widgets.holding_id AND public.can_edit_portfolio(h.portfolio_id)
    )
  );

DROP POLICY IF EXISTS "holding_widgets_service" ON public.holding_widgets;
CREATE POLICY "holding_widgets_service" ON public.holding_widgets
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ============================================================================
-- GRANTS
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolios TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holdings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_holdings TO authenticated;
GRANT SELECT ON public.modules TO authenticated;
GRANT SELECT ON public.module_presets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_modules TO authenticated;
GRANT SELECT ON public.admins TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uploads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.widgets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.holding_widgets TO authenticated;

-- Service role gets full access
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.portfolios TO service_role;
GRANT ALL ON public.portfolio_members TO service_role;
GRANT ALL ON public.portfolio_settings TO service_role;
GRANT ALL ON public.holdings TO service_role;
GRANT ALL ON public.organizations TO service_role;
GRANT ALL ON public.organization_members TO service_role;
GRANT ALL ON public.organization_holdings TO service_role;
GRANT ALL ON public.modules TO service_role;
GRANT ALL ON public.module_presets TO service_role;
GRANT ALL ON public.organization_modules TO service_role;
GRANT ALL ON public.admins TO service_role;
GRANT ALL ON public.uploads TO service_role;
GRANT ALL ON public.widgets TO service_role;
GRANT ALL ON public.holding_widgets TO service_role;
