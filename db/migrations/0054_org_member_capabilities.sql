-- =============================================================================
-- 0054_org_member_capabilities.sql
-- Add narrow org-member capabilities for Builder Studio implementation review.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.organization_member_capabilities (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  capability  text NOT NULL CHECK (capability IN ('implementation_reviewer')),
  granted_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz NOT NULL DEFAULT now(),

  UNIQUE (org_id, user_id, capability)
);

CREATE INDEX IF NOT EXISTS organization_member_capabilities_org_user_idx
  ON public.organization_member_capabilities (org_id, user_id);

CREATE OR REPLACE FUNCTION public.user_has_org_capability(
  p_org_id uuid,
  p_capability text
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_member_capabilities c
    JOIN public.organization_members m
      ON m.org_id = c.org_id
     AND m.user_id = c.user_id
     AND m.deleted_at IS NULL
    WHERE c.org_id = p_org_id
      AND c.user_id = auth.uid()
      AND c.capability = p_capability
      AND c.capability = 'implementation_reviewer'
      AND m.role IN ('admin', 'owner')
  );
$$;

ALTER TABLE public.organization_member_capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_member_capabilities: org admins read"
  ON public.organization_member_capabilities FOR SELECT TO authenticated
  USING (public.is_org_admin(org_id));

CREATE POLICY "org_member_capabilities: owners grant to admins or owners"
  ON public.organization_member_capabilities FOR INSERT TO authenticated
  WITH CHECK (
    public.org_role_gte(org_id, 'owner')
    AND EXISTS (
      SELECT 1
      FROM public.organization_members m
      WHERE m.org_id = organization_member_capabilities.org_id
        AND m.user_id = organization_member_capabilities.user_id
        AND m.deleted_at IS NULL
        AND m.role IN ('admin', 'owner')
    )
  );

CREATE POLICY "org_member_capabilities: owners revoke"
  ON public.organization_member_capabilities FOR DELETE TO authenticated
  USING (public.org_role_gte(org_id, 'owner'));

CREATE POLICY "org_member_capabilities: service role"
  ON public.organization_member_capabilities FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, DELETE ON public.organization_member_capabilities TO authenticated;
GRANT ALL ON public.organization_member_capabilities TO service_role;
GRANT EXECUTE ON FUNCTION public.user_has_org_capability(uuid, text) TO authenticated;
