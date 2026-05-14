-- =============================================================================
-- 0036_seeds.sql
-- Initial seed data: module definitions and preset bundles.
-- Safe to re-run (ON CONFLICT DO UPDATE).
-- Depends on: 0022 (module_definitions)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Module definitions (canonical database slugs)
-- ---------------------------------------------------------------------------
INSERT INTO public.module_definitions (slug, label, description, depends_on, is_core) VALUES
  ('portfolio',        'Portfolio Management', 'Core portfolio and holding management',                         NULL, true),
  ('impact_tracking',  'Impact Tracking',      'KPIs, metrics, trends, and visualizations',                    NULL, false),
  ('reports',          'Reports',              'Custom reports, templates, and document exports',               ARRAY['portfolio'], false),
  ('tax',              'Tax Center',           'Tax scenarios, deductions, and compliance tracking',             ARRAY['portfolio'], false),
  ('grant_management', 'Grant Management',     'Due diligence, milestones, and workflow automation',             NULL, false),
  ('donors',           'Donor Management',     'Track contributions received and generate acknowledgments',      NULL, false),
  ('pledges',          'Pledge Tracking',      'Donor commitment tracking with installment schedules',           ARRAY['donors'], false),
  ('external_data',    'External Data',        'Charity Navigator, Candid, and news integrations',               NULL, false),
  ('analytics',        'Analytics',            'Projections, benchmarking, and risk analysis',                   ARRAY['impact_tracking'], false),
  ('compliance',       'Compliance',           'Filing calendar and state charitable registrations',             NULL, false),
  ('quickbooks',       'QuickBooks',           'QuickBooks Online integration for financial sync',               ARRAY['portfolio'], false),
  ('import',           'Data Import',          'AI-assisted data import from Blackbaud and other systems',       NULL, false),
  ('ai_assistant',     'AI Assistant',         'Claude AI portfolio advisor and action executor',                ARRAY['portfolio'], false)
ON CONFLICT (slug) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  depends_on  = EXCLUDED.depends_on,
  is_core     = EXCLUDED.is_core;

-- ---------------------------------------------------------------------------
-- Module presets (bundles for common org types)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.module_presets (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  description text,
  module_ids  text[] NOT NULL DEFAULT '{}',
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.module_presets ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "module_presets_read" ON public.module_presets
    FOR SELECT TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "module_presets_service" ON public.module_presets
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT ON public.module_presets TO authenticated;
GRANT ALL ON public.module_presets TO service_role;

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
