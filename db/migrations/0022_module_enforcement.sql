-- =============================================================================
-- 0022_module_enforcement.sql
-- Module-level enforcement helpers: trigger to validate module flags,
-- pg_catalog-level function to list all active modules for an org,
-- and a convenience view for the settings UI.
-- Depends on: 0001, 0002
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Known modules and their descriptions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS module_definitions (
  slug            text PRIMARY KEY,
  label           text NOT NULL,
  description     text,
  depends_on      text[],         -- other module slugs that must be enabled first
  is_core         boolean NOT NULL DEFAULT false  -- core modules cannot be disabled
);

INSERT INTO module_definitions (slug, label, description, depends_on, is_core) VALUES
  ('portfolio',    'Portfolio Management', 'Core holdings and investment tracking', NULL, true),
  ('donors',       'Donor CRM',           'Donor management and acknowledgment letters', NULL, false),
  ('tax',          'Tax Center',          'Tax deduction tracking and Form 8283', ARRAY['portfolio'], false),
  ('compliance',   'Compliance',          'Filing calendar and state registrations', NULL, false),
  ('quickbooks',   'QuickBooks Sync',     'QuickBooks Online integration', ARRAY['portfolio'], false),
  ('import',       'Data Import',         'AI-assisted data import', NULL, false),
  ('reports',      'Reports',             'Shareable impact and portfolio reports', ARRAY['portfolio'], false),
  ('ai_assistant', 'AI Assistant',        'Claude AI portfolio advisor', ARRAY['portfolio'], false)
ON CONFLICT (slug) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  depends_on  = EXCLUDED.depends_on,
  is_core     = EXCLUDED.is_core;

-- Additional module definitions (grant_management, impact_tracking, analytics, external_data)
INSERT INTO module_definitions (slug, label, description, depends_on, is_core) VALUES
  ('grant_management', 'Grant Management', 'Due diligence workflows, payments, and grantee reporting', NULL, false),
  ('impact_tracking',  'Impact Tracking',  'KPIs, metrics, and impact visualizations', NULL, false),
  ('analytics',        'Analytics',        'Projections, benchmarks, risk scoring, and AI insights', ARRAY['impact_tracking'], false),
  ('external_data',    'External Data',    'Charity Navigator, Candid, and news integrations', NULL, false)
ON CONFLICT (slug) DO UPDATE SET
  label       = EXCLUDED.label,
  description = EXCLUDED.description,
  depends_on  = EXCLUDED.depends_on,
  is_core     = EXCLUDED.is_core;

-- ---------------------------------------------------------------------------
-- Validate module flags when organizations.modules is updated
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION validate_org_modules()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  mod_slug text;
  dep      text;
BEGIN
  -- Core modules must always be enabled
  IF NOT (NEW.modules->>'portfolio')::boolean THEN
    RAISE EXCEPTION 'Module "portfolio" is core and cannot be disabled.';
  END IF;

  -- Check that dependency modules are enabled when a module is turned on
  FOR mod_slug IN SELECT slug FROM module_definitions WHERE NOT is_core AND depends_on IS NOT NULL LOOP
    IF (NEW.modules->>mod_slug)::boolean THEN
      FOR dep IN SELECT unnest(depends_on) FROM module_definitions WHERE slug = mod_slug LOOP
        IF NOT COALESCE((NEW.modules->>dep)::boolean, false) THEN
          RAISE EXCEPTION 'Module "%" requires module "%" to be enabled first.', mod_slug, dep;
        END IF;
      END LOOP;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_org_modules
  BEFORE INSERT OR UPDATE OF modules ON organizations
  FOR EACH ROW EXECUTE FUNCTION validate_org_modules();

-- ---------------------------------------------------------------------------
-- v_org_modules — exploded view of modules per org for settings UI
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_org_modules AS
SELECT
  o.id            AS org_id,
  o.name          AS org_name,
  md.slug,
  md.label,
  md.description,
  md.depends_on,
  md.is_core,
  COALESCE((o.modules->>md.slug)::boolean, false) AS is_enabled
FROM organizations o
CROSS JOIN module_definitions md
ORDER BY md.is_core DESC, md.slug;

-- ---------------------------------------------------------------------------
-- Helper: returns list of enabled module slugs for an org
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION org_enabled_modules(p_org_id uuid)
RETURNS text[]
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT array_agg(key)
  FROM (
    SELECT key, value FROM jsonb_each(
      (SELECT modules FROM organizations WHERE id = p_org_id)
    )
  ) kv
  WHERE value::boolean;
$$;

-- module_definitions is not sensitive — all authenticated users can read
ALTER TABLE module_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "module_definitions: authenticated can read"
  ON module_definitions FOR SELECT
  USING (auth.uid() IS NOT NULL);
CREATE POLICY "module_definitions: no user write"
  ON module_definitions FOR INSERT WITH CHECK (false);
CREATE POLICY "module_definitions: no user update"
  ON module_definitions FOR UPDATE USING (false);
CREATE POLICY "module_definitions: service role can manage"
  ON module_definitions FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT ON module_definitions TO authenticated;
GRANT ALL ON module_definitions TO service_role;
