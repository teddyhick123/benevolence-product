-- ============================================================================
-- SEED DATA
-- ============================================================================
-- Description: Initial data required for system operation
-- Contents: Module definitions, module presets
-- ============================================================================

-- ============================================================================
-- 1. MODULE DEFINITIONS
-- ============================================================================
-- These define the available feature modules that can be enabled per organization
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

-- ============================================================================
-- 2. MODULE PRESETS
-- ============================================================================
-- Pre-configured module bundles for common organization types
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
