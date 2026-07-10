-- Migration: Modular AI Platform - Organization Module Configuration
-- Description: Enables organizations to configure which AI tools/features are available
-- Date: 2025-02-17

-- =============================================================================
-- 1. MODULES TABLE - Available modules in the system
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.modules (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_core BOOLEAN DEFAULT false,
  icon TEXT,
  sort_order INTEGER DEFAULT 0,
  dependencies TEXT[] DEFAULT '{}',  -- Array of module IDs this depends on
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.modules IS 'Available feature modules that can be enabled per organization';
COMMENT ON COLUMN public.modules.is_core IS 'Core modules are always enabled and cannot be disabled';
COMMENT ON COLUMN public.modules.dependencies IS 'Array of module IDs that must be enabled before this module';

-- =============================================================================
-- 2. ORGANIZATION MODULES TABLE - Which modules each org has enabled
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.organization_modules (
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL REFERENCES public.modules(id) ON DELETE CASCADE,
  enabled_at TIMESTAMPTZ DEFAULT NOW(),
  enabled_by UUID REFERENCES auth.users(id),
  config JSONB DEFAULT '{}'::jsonb,
  PRIMARY KEY (organization_id, module_id)
);

COMMENT ON TABLE public.organization_modules IS 'Tracks which modules are enabled for each organization';
COMMENT ON COLUMN public.organization_modules.config IS 'Module-specific configuration options';

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_org_modules_org_id
  ON public.organization_modules(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_modules_module_id
  ON public.organization_modules(module_id);

-- =============================================================================
-- 3. HELPER FUNCTIONS
-- =============================================================================

-- Check if an organization has a specific module enabled
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

-- Grant execute permissions
REVOKE ALL ON FUNCTION public.org_has_module(UUID, TEXT) FROM public;
GRANT EXECUTE ON FUNCTION public.org_has_module(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.org_has_module(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.get_org_modules(UUID) FROM public;
GRANT EXECUTE ON FUNCTION public.get_org_modules(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_modules(UUID) TO service_role;

-- =============================================================================
-- 4. ROW LEVEL SECURITY
-- =============================================================================

-- Modules table: readable by all authenticated users
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "modules_read" ON public.modules;
CREATE POLICY "modules_read" ON public.modules
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "modules_service" ON public.modules;
CREATE POLICY "modules_service" ON public.modules
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Organization modules: manageable by org admins
ALTER TABLE public.organization_modules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_modules_read" ON public.organization_modules;
CREATE POLICY "org_modules_read" ON public.organization_modules
  FOR SELECT TO authenticated
  USING (
    public.is_org_member(organization_id)
    OR public.is_admin()
  );

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

-- =============================================================================
-- 5. GRANTS
-- =============================================================================
GRANT SELECT ON public.modules TO authenticated;
GRANT ALL ON public.modules TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_modules TO authenticated;
GRANT ALL ON public.organization_modules TO service_role;

-- =============================================================================
-- 6. SEED MODULE DEFINITIONS
-- =============================================================================
INSERT INTO public.modules (id, name, description, is_core, icon, sort_order, dependencies) VALUES
  ('core', 'Core', 'Basic portfolio and holding management - always enabled', true, 'folder', 0, '{}'),
  ('impact_tracking', 'Impact Tracking', 'KPIs, metrics, trends, and visualizations', false, 'chart-bar', 1, '{}'),
  ('reporting', 'Reporting', 'Custom reports, templates, and document exports', false, 'document-text', 2, '{impact_tracking}'),
  ('tax_optimization', 'Tax Optimization', 'Tax scenarios, deductions, and compliance tracking', false, 'calculator', 3, '{}'),
  ('grant_management', 'Grant Management', 'Due diligence, milestones, and workflow automation', false, 'clipboard-check', 4, '{}'),
  ('donor_management', 'Donor Management', 'Track contributions received and generate acknowledgments', false, 'users', 5, '{}'),
  ('external_data', 'External Data', 'Charity Navigator, Candid, and news integrations', false, 'globe', 6, '{}'),
  ('analytics', 'Analytics', 'Projections, benchmarking, and risk analysis', false, 'trending-up', 7, '{impact_tracking}')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_core = EXCLUDED.is_core,
  icon = EXCLUDED.icon,
  sort_order = EXCLUDED.sort_order,
  dependencies = EXCLUDED.dependencies;

-- =============================================================================
-- 7. MODULE PRESETS (Common configurations)
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.module_presets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  module_ids TEXT[] NOT NULL,
  sort_order INTEGER DEFAULT 0
);

COMMENT ON TABLE public.module_presets IS 'Pre-configured module bundles for common organization types';

ALTER TABLE public.module_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "presets_read" ON public.module_presets
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "presets_service" ON public.module_presets
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.module_presets TO authenticated;
GRANT ALL ON public.module_presets TO service_role;

-- Seed presets
INSERT INTO public.module_presets (id, name, description, module_ids, sort_order) VALUES
  ('family_foundation', 'Family Foundation', 'For private family foundations managing grants and impact',
   ARRAY['impact_tracking', 'reporting', 'tax_optimization', 'grant_management'], 1),
  ('community_foundation', 'Community Foundation', 'For community foundations with multiple donors and grantees',
   ARRAY['impact_tracking', 'reporting', 'grant_management', 'donor_management'], 2),
  ('daf_sponsor', 'DAF Sponsor', 'For donor-advised fund sponsors managing contributions',
   ARRAY['impact_tracking', 'reporting', 'tax_optimization', 'donor_management'], 3),
  ('nonprofit', 'Nonprofit Organization', 'For nonprofits tracking their own impact and donors',
   ARRAY['impact_tracking', 'reporting', 'donor_management'], 4),
  ('impact_investor', 'Impact Investor', 'For impact investors tracking portfolio metrics and returns',
   ARRAY['impact_tracking', 'reporting', 'analytics', 'external_data'], 5),
  ('minimal', 'Minimal Setup', 'Just the basics - add more modules as needed',
   ARRAY['impact_tracking'], 6)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  module_ids = EXCLUDED.module_ids,
  sort_order = EXCLUDED.sort_order;
