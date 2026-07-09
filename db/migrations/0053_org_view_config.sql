-- =============================================================================
-- db/migrations/0053_org_view_config.sql
-- Migration: Phase 5 Configurable Views and Vocabulary
-- Date: 2026-07-08
--
-- Adds org-scoped view/layout/vocabulary configuration.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.org_view_config (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  config_scope  text NOT NULL CHECK (config_scope IN ('dashboard', 'module_default', 'table_columns', 'entity_vocabulary')),
  scope_key     text NOT NULL CHECK (scope_key ~ '^[a-z][a-z0-9_.-]{0,119}$'),
  config_value  jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(config_value) = 'object'),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, config_scope, scope_key)
);

CREATE INDEX IF NOT EXISTS idx_org_view_config_org_scope
  ON public.org_view_config (org_id, config_scope, scope_key);

ALTER TABLE public.org_view_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_view_config_read" ON public.org_view_config
  FOR SELECT TO authenticated USING (public.can_view_org(org_id));

CREATE POLICY "org_view_config_write" ON public.org_view_config
  FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "org_view_config_service" ON public.org_view_config
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_view_config TO authenticated;
GRANT ALL ON public.org_view_config TO service_role;

CREATE TRIGGER set_org_view_config_updated_at
  BEFORE UPDATE ON public.org_view_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
