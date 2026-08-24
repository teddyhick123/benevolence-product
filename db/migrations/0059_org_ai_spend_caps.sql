-- =============================================================================
-- 0059_org_ai_spend_caps.sql
-- Per-organization ceilings on platform-funded AI spend, plus the single
-- definition of that spend used by enforcement and reporting alike.
-- Depends on: 0001, 0030
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.org_ai_spend_caps (
  org_id              uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Null means uncapped. Written only through the app-admin route.
  platform_limit_usd  numeric CHECK (platform_limit_usd IS NULL OR platform_limit_usd >= 0),
  -- An organization's self-imposed limit, never above the platform's.
  org_limit_usd       numeric CHECK (org_limit_usd IS NULL OR org_limit_usd >= 0),
  warn_at_percent     integer NOT NULL DEFAULT 80
                        CHECK (warn_at_percent BETWEEN 1 AND 100),
  on_limit            text NOT NULL DEFAULT 'hard_stop'
                        CHECK (on_limit IN ('hard_stop','read_only','own_key')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_ai_spend_caps_org_limit_within_platform
    CHECK (org_limit_usd IS NULL
           OR platform_limit_usd IS NULL
           OR org_limit_usd <= platform_limit_usd)
);

ALTER TABLE public.org_ai_spend_caps ENABLE ROW LEVEL SECURITY;

-- Read-only for org admins: the authority split between the platform ceiling
-- and the organization's own limit lives in the route guards, which RLS
-- cannot express per column.
CREATE POLICY "org_ai_spend_caps_admin_read" ON public.org_ai_spend_caps
  FOR SELECT TO authenticated USING (public.is_org_admin(org_id));
CREATE POLICY "org_ai_spend_caps_service" ON public.org_ai_spend_caps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.org_ai_spend_caps TO authenticated;
GRANT ALL ON public.org_ai_spend_caps TO service_role;
