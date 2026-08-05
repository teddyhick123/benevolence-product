-- =============================================================================
-- 0023_admin_superuser_policies.sql
-- Superuser / service-role access patterns for admin operations.
-- These policies exist to support:
--   1. The Next.js admin panel (/admin/*)
--   2. Supabase service-role operations (background jobs, webhooks)
--   3. Deployment provisioning scripts
--
-- IMPORTANT: These policies supplement (do not replace) the per-table RLS
-- policies defined in earlier migrations. They are additive.
-- Depends on: 0001-0022
-- =============================================================================

-- ---------------------------------------------------------------------------
-- app_admin role — for application-level admin users (not DB superusers)
-- An org owner can be designated as app_admin via the profiles table.
-- ---------------------------------------------------------------------------
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_app_admin boolean NOT NULL DEFAULT false;

-- Create a function that checks app admin status without joining profiles
-- (used in RLS so we avoid policy recursion)
CREATE OR REPLACE FUNCTION is_app_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_app_admin FROM profiles WHERE id = auth.uid()),
    false
  );
$$;

-- Atomically claim the first app-admin account. The transaction-scoped lock
-- prevents concurrent first-run requests from promoting more than one user.
CREATE OR REPLACE FUNCTION bootstrap_app_admin()
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('bootstrap_app_admin'));

  IF EXISTS (SELECT 1 FROM profiles WHERE is_app_admin) THEN
    RETURN false;
  END IF;

  UPDATE profiles SET is_app_admin = true WHERE id = v_user_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RAISE EXCEPTION 'Authenticated user profile not found';
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION bootstrap_app_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION bootstrap_app_admin() TO authenticated;

-- ---------------------------------------------------------------------------
-- Grant app admins read access to all orgs (for support/onboarding view)
-- ---------------------------------------------------------------------------

-- organizations: app admins can see all
CREATE POLICY "organizations: app admin can view all"
  ON organizations FOR SELECT
  USING (is_app_admin());

-- organization_members: app admins can manage all
CREATE POLICY "organization_members: app admin full access"
  ON organization_members FOR ALL
  USING (is_app_admin())
  WITH CHECK (is_app_admin());

-- profiles: app admins can view all (for user lookup)
CREATE POLICY "profiles: app admin can view all"
  ON profiles FOR SELECT
  USING (is_app_admin());

-- portfolios: app admins can view all
CREATE POLICY "portfolios: app admin can view all"
  ON portfolios FOR SELECT
  USING (is_app_admin());

-- App admins manage portfolio membership from the global admin console.
CREATE POLICY "portfolio_members: app admin full access"
  ON portfolio_members FOR ALL
  USING (is_app_admin())
  WITH CHECK (is_app_admin());

-- audit_log: app admins can read
CREATE POLICY "audit_log: app admin can read"
  ON audit_log FOR SELECT
  USING (is_app_admin());

-- Import workbench: app admins operate across organizations from /admin/imports.
-- Give their authenticated session the same explicit access the panel requires
-- instead of forcing ordinary reads and corrections through the service role.
CREATE POLICY "import_mapping_profiles: app admin full access"
  ON import_mapping_profiles FOR ALL TO authenticated
  USING (is_app_admin())
  WITH CHECK (is_app_admin());

CREATE POLICY "import_jobs: app admin full access"
  ON import_jobs FOR ALL TO authenticated
  USING (is_app_admin())
  WITH CHECK (is_app_admin());

CREATE POLICY "import_ai_suggestions: app admin full access"
  ON import_ai_suggestions FOR ALL TO authenticated
  USING (is_app_admin())
  WITH CHECK (is_app_admin());

CREATE POLICY "staging_import_donors: app admin full access"
  ON staging_import_donors FOR ALL TO authenticated
  USING (is_app_admin())
  WITH CHECK (is_app_admin());

CREATE POLICY "staging_import_investees: app admin full access"
  ON staging_import_investees FOR ALL TO authenticated
  USING (is_app_admin())
  WITH CHECK (is_app_admin());

CREATE POLICY "staging_import_holdings: app admin full access"
  ON staging_import_holdings FOR ALL TO authenticated
  USING (is_app_admin())
  WITH CHECK (is_app_admin());

CREATE POLICY "staging_import_contributions: app admin full access"
  ON staging_import_contributions FOR ALL TO authenticated
  USING (is_app_admin())
  WITH CHECK (is_app_admin());

CREATE POLICY "staging_import_metrics: app admin full access"
  ON staging_import_metrics FOR ALL TO authenticated
  USING (is_app_admin())
  WITH CHECK (is_app_admin());

CREATE POLICY "import_audit_log: app admin full access"
  ON import_audit_log FOR ALL TO authenticated
  USING (is_app_admin())
  WITH CHECK (is_app_admin());

CREATE POLICY "imports bucket: app admin full access"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'imports' AND public.is_app_admin())
  WITH CHECK (bucket_id = 'imports' AND public.is_app_admin());

-- ---------------------------------------------------------------------------
-- org_type_config helpers — per-org type default modules
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_type_defaults (
  org_type        org_type_enum PRIMARY KEY,
  default_modules jsonb NOT NULL,
  description     text
);

INSERT INTO org_type_defaults (org_type, default_modules, description) VALUES
  ('private_foundation', '{"portfolio":true,"donors":false,"tax":true,"compliance":true,"quickbooks":false,"import":true,"reports":true,"ai_assistant":true}',
   'Private foundations: tax-heavy, compliance required, no donor CRM by default'),
  ('family_office',      '{"portfolio":true,"donors":false,"tax":true,"compliance":false,"quickbooks":true,"import":true,"reports":true,"ai_assistant":true}',
   'Family offices: investment-focused, QB sync, no compliance calendar'),
  ('daf_sponsor',        '{"portfolio":true,"donors":true,"tax":true,"compliance":true,"quickbooks":false,"import":true,"reports":true,"ai_assistant":true}',
   'DAF sponsors: full donor CRM, compliance, grant tracking'),
  ('community_foundation','{"portfolio":true,"donors":true,"tax":false,"compliance":true,"quickbooks":false,"import":true,"reports":true,"ai_assistant":true}',
   'Community foundations: donor CRM and compliance, less personal tax'),
  ('nonprofit',          '{"portfolio":true,"donors":true,"tax":false,"compliance":true,"quickbooks":true,"import":true,"reports":true,"ai_assistant":false}',
   'Nonprofits: donor CRM, QB sync, state compliance'),
  ('individual',         '{"portfolio":true,"donors":false,"tax":true,"compliance":false,"quickbooks":false,"import":false,"reports":false,"ai_assistant":true}',
   'Individual philanthropists: portfolio + tax, minimal overhead'),
  ('corporation',        '{"portfolio":true,"donors":false,"tax":true,"compliance":false,"quickbooks":true,"import":true,"reports":true,"ai_assistant":false}',
   'Corporate giving programs: QB sync, tax, reporting')
ON CONFLICT (org_type) DO UPDATE SET
  default_modules = EXCLUDED.default_modules,
  description     = EXCLUDED.description;

-- Helper: get default modules for an org type (used by provisioning scripts)
CREATE OR REPLACE FUNCTION default_modules_for_org_type(p_org_type org_type_enum)
RETURNS jsonb
LANGUAGE sql STABLE
AS $$
  SELECT default_modules FROM org_type_defaults WHERE org_type = p_org_type;
$$;

ALTER TABLE org_type_defaults ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_type_defaults: authenticated can read"
  ON org_type_defaults FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "org_type_defaults: no user write"
  ON org_type_defaults FOR INSERT WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- Organization provisioning RPC — called by deployment scripts
-- Creates an org + first owner member + default modules in one transaction
-- Must be called via service role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION provision_organization(
  p_name          text,
  p_org_type      org_type_enum,
  p_owner_user_id uuid,
  p_ein           text DEFAULT NULL,
  p_modules       jsonb DEFAULT NULL   -- if null, uses org type defaults
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id    uuid;
  v_modules   jsonb;
BEGIN
  -- Resolve modules: explicit override, or org-type defaults
  v_modules := COALESCE(
    p_modules,
    default_modules_for_org_type(p_org_type),
    '{"portfolio":true}'::jsonb
  );

  -- Insert org
  INSERT INTO organizations (name, org_type, ein, modules)
  VALUES (p_name, p_org_type, p_ein, v_modules)
  RETURNING id INTO v_org_id;

  -- Add owner membership
  INSERT INTO organization_members (org_id, user_id, role, accepted_at)
  VALUES (v_org_id, p_owner_user_id, 'owner', now());

  -- Log the provisioning
  INSERT INTO audit_log (org_id, actor_id, action, new_values)
  VALUES (v_org_id, p_owner_user_id, 'org.provision',
          jsonb_build_object('name', p_name, 'org_type', p_org_type, 'modules', v_modules));

  RETURN v_org_id;
END;
$$;

-- REVOKE public access — only service role can call this
REVOKE ALL ON FUNCTION provision_organization FROM PUBLIC;
GRANT EXECUTE ON FUNCTION provision_organization(text, org_type_enum, uuid, text, jsonb) TO service_role;
