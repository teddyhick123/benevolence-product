-- =============================================================================
-- 0036_seeds.sql
-- Initial seed data: module definitions and preset bundles.
-- Safe to re-run (ON CONFLICT DO UPDATE).
-- Depends on: 0002 (modules, module_presets tables)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Module definitions (canonical list)
-- ---------------------------------------------------------------------------
INSERT INTO public.modules (id, name, description, is_core, icon, sort_order, dependencies) VALUES
  ('core',             'Core',             'Basic portfolio and holding management — always enabled',                         true,  'folder',         0, '{}'),
  ('impact_tracking',  'Impact Tracking',  'KPIs, metrics, trends, and visualizations',                                      false, 'chart-bar',      1, '{}'),
  ('reporting',        'Reporting',        'Custom reports, templates, and document exports',                                 false, 'document-text',  2, '{impact_tracking}'),
  ('tax_optimization', 'Tax Optimization', 'Tax scenarios, deductions, and compliance tracking',                             false, 'calculator',     3, '{}'),
  ('grant_management', 'Grant Management', 'Due diligence, milestones, and workflow automation',                             false, 'clipboard-check',4, '{}'),
  ('donor_management', 'Donor Management', 'Track contributions received and generate acknowledgments',                      false, 'users',          5, '{}'),
  ('external_data',    'External Data',    'Charity Navigator, Candid, and news integrations',                               false, 'globe',          6, '{}'),
  ('analytics',        'Analytics',        'Projections, benchmarking, and risk analysis',                                   false, 'trending-up',    7, '{impact_tracking}'),
  ('compliance',       'Compliance',       'Filing calendar and state charitable registrations',                             false, 'shield-check',   8, '{}'),
  ('quickbooks',       'QuickBooks',       'QuickBooks Online integration for financial sync',                               false, 'refresh',        9, '{}'),
  ('ai_assistant',     'AI Assistant',     'Claude AI portfolio advisor and action executor',                                false, 'sparkles',      10, '{}')
ON CONFLICT (id) DO UPDATE SET
  name         = EXCLUDED.name,
  description  = EXCLUDED.description,
  is_core      = EXCLUDED.is_core,
  icon         = EXCLUDED.icon,
  sort_order   = EXCLUDED.sort_order,
  dependencies = EXCLUDED.dependencies;

-- ---------------------------------------------------------------------------
-- Module presets (bundles for common org types)
-- ---------------------------------------------------------------------------
INSERT INTO public.module_presets (id, name, description, module_ids, sort_order) VALUES
  ('family_foundation',   'Family Foundation',    'Private foundations managing grants and impact',
   ARRAY['impact_tracking', 'reporting', 'tax_optimization', 'grant_management', 'ai_assistant'], 1),
  ('community_foundation','Community Foundation', 'Community foundations with multiple donors and grantees',
   ARRAY['impact_tracking', 'reporting', 'grant_management', 'donor_management', 'ai_assistant'], 2),
  ('daf_sponsor',         'DAF Sponsor',          'Donor-advised fund sponsors managing contributions',
   ARRAY['impact_tracking', 'reporting', 'tax_optimization', 'donor_management', 'ai_assistant'], 3),
  ('nonprofit',           'Nonprofit',            'Nonprofits tracking their own impact and donors',
   ARRAY['impact_tracking', 'reporting', 'donor_management', 'compliance'], 4),
  ('impact_investor',     'Impact Investor',      'Impact investors tracking portfolio metrics and returns',
   ARRAY['impact_tracking', 'reporting', 'analytics', 'external_data', 'ai_assistant'], 5),
  ('minimal',             'Minimal',              'Just the basics — add more modules as needed',
   ARRAY['impact_tracking'], 6)
ON CONFLICT (id) DO UPDATE SET
  name        = EXCLUDED.name,
  description = EXCLUDED.description,
  module_ids  = EXCLUDED.module_ids,
  sort_order  = EXCLUDED.sort_order;
