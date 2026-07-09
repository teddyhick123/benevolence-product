-- =============================================================================
-- db/migrations/0052_org_ai_context.sql
-- Migration: Phase 4 Org-Specific AI Context
-- Date: 2026-07-08
--
-- Adds structured, org-scoped context records injected into assistant sessions.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.org_ai_context (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  context_type   text NOT NULL CHECK (context_type IN ('operating_norm', 'naming_convention', 'process_rule', 'preference')),
  context_key    text NOT NULL CHECK (context_key ~ '^[a-z][a-z0-9_]{0,79}$'),
  context_value  text NOT NULL CHECK (length(context_value) BETWEEN 1 AND 4000),
  source         text NOT NULL CHECK (source IN ('builder_chat', 'onboarding', 'ai_suggestion')),
  is_active      boolean NOT NULL DEFAULT true,
  created_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, context_key)
);

CREATE INDEX IF NOT EXISTS idx_org_ai_context_org_active
  ON public.org_ai_context (org_id, is_active, context_type, context_key);

ALTER TABLE public.org_ai_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_ai_context_read" ON public.org_ai_context
  FOR SELECT TO authenticated USING (public.can_view_org(org_id));

CREATE POLICY "org_ai_context_write" ON public.org_ai_context
  FOR ALL TO authenticated
  USING (public.is_org_admin(org_id))
  WITH CHECK (public.is_org_admin(org_id));

CREATE POLICY "org_ai_context_service" ON public.org_ai_context
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.org_ai_context TO authenticated;
GRANT ALL ON public.org_ai_context TO service_role;

CREATE TRIGGER set_org_ai_context_updated_at
  BEFORE UPDATE ON public.org_ai_context
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
