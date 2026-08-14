-- db/migrations/0024_settings_ops_hub.sql
-- Settings & Ops Hub: org_audit_log, notification_prefs
-- Depends on: 0001-0023
-- Note: org_invitations is defined canonically in 0002_organizations.sql.

-- ---------------------------------------------------------------------------
-- org_audit_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_audit_log (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_subject_id uuid NOT NULL DEFAULT auth.uid(),
  action           text NOT NULL,
  target_id        uuid,
  metadata         jsonb,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_audit_log_org_created_idx ON org_audit_log (org_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.set_org_audit_actor_subject()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.actor_subject_id := COALESCE(NEW.actor_subject_id, NEW.actor_id);
  IF NEW.actor_subject_id IS NULL THEN
    RAISE EXCEPTION 'Audit actor subject is required' USING ERRCODE = '23502';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_org_audit_actor_subject
  BEFORE INSERT ON public.org_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.set_org_audit_actor_subject();

ALTER TABLE org_audit_log ENABLE ROW LEVEL SECURITY;

-- Org admins/owners can read audit log for their org
CREATE POLICY "org admins can read audit log"
  ON org_audit_log FOR SELECT
  USING (is_org_admin(org_id));

-- Inserts only via service role (bypasses RLS) to prevent tampering

-- ---------------------------------------------------------------------------
-- Atomic membership mutations
-- ---------------------------------------------------------------------------
-- Member changes must retain the membership write, last-owner protection, and
-- audit row in one transaction. The application calls this only through its
-- org-scoped elevated repository after the normal access guard has proven the
-- actor, but the function also verifies that actor against canonical membership
-- state so it cannot be used as an unscoped write primitive.
CREATE OR REPLACE FUNCTION public.mutate_organization_membership(
  p_org_id uuid,
  p_actor_id uuid,
  p_target_user_id uuid,
  p_operation text,
  p_role member_role_enum DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role member_role_enum;
  v_member public.organization_members%ROWTYPE;
  v_owner_count integer;
  v_previous_role member_role_enum;
  v_now timestamptz := now();
  v_action text;
  v_metadata jsonb;
BEGIN
  IF p_operation NOT IN ('add', 'change_role', 'remove') THEN
    RAISE EXCEPTION 'Invalid membership operation' USING ERRCODE = '22023';
  END IF;
  IF p_operation IN ('add', 'change_role') AND p_role IS NULL THEN
    RAISE EXCEPTION 'A membership role is required' USING ERRCODE = '22023';
  END IF;

  -- Serialize owner-sensitive mutations per organization. This makes the
  -- last-owner check correct even when two admins act at the same time.
  PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

  SELECT role INTO v_actor_role
  FROM public.organization_members
  WHERE org_id = p_org_id
    AND user_id = p_actor_id
    AND deleted_at IS NULL;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Only organization admins can manage membership' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_member
  FROM public.organization_members
  WHERE org_id = p_org_id
    AND user_id = p_target_user_id
  FOR UPDATE;

  IF p_operation = 'add' THEN
    IF p_role = 'owner' AND v_actor_role <> 'owner' THEN
      RAISE EXCEPTION 'Only owners can add another owner' USING ERRCODE = '42501';
    END IF;

    IF v_member.id IS NOT NULL AND v_member.deleted_at IS NULL THEN
      RAISE EXCEPTION 'User is already a member of this organization' USING ERRCODE = '23505';
    ELSIF v_member.id IS NULL THEN
      INSERT INTO public.organization_members (org_id, user_id, role)
      VALUES (p_org_id, p_target_user_id, p_role)
      RETURNING * INTO v_member;
    ELSE
      UPDATE public.organization_members
      SET role = p_role, deleted_at = NULL, deleted_by = NULL
      WHERE id = v_member.id
      RETURNING * INTO v_member;
    END IF;
    v_action := 'member_added';
    v_metadata := jsonb_build_object('role', p_role);

  ELSIF p_operation = 'change_role' THEN
    IF v_member.id IS NULL OR v_member.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0002';
    END IF;
    IF (v_member.role = 'owner' OR p_role = 'owner') AND v_actor_role <> 'owner' THEN
      RAISE EXCEPTION 'Only owners can change owner membership' USING ERRCODE = '42501';
    END IF;
    IF v_member.role = 'owner' AND p_role <> 'owner' THEN
      SELECT count(*) INTO v_owner_count
      FROM public.organization_members
      WHERE org_id = p_org_id AND role = 'owner' AND deleted_at IS NULL;
      IF v_owner_count <= 1 THEN
        RAISE EXCEPTION 'Cannot change the last owner role' USING ERRCODE = 'P0001';
      END IF;
    END IF;

    v_previous_role := v_member.role;
    UPDATE public.organization_members
    SET role = p_role
    WHERE id = v_member.id
    RETURNING * INTO v_member;
    v_action := 'role_changed';
    v_metadata := jsonb_build_object('before_role', v_previous_role, 'after_role', p_role);

  ELSE
    IF v_member.id IS NULL OR v_member.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Member not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_member.role = 'owner' AND v_actor_role <> 'owner' THEN
      RAISE EXCEPTION 'Only owners can remove owner membership' USING ERRCODE = '42501';
    END IF;
    IF v_member.role = 'owner' THEN
      SELECT count(*) INTO v_owner_count
      FROM public.organization_members
      WHERE org_id = p_org_id AND role = 'owner' AND deleted_at IS NULL;
      IF v_owner_count <= 1 THEN
        RAISE EXCEPTION 'Cannot remove the last owner' USING ERRCODE = 'P0001';
      END IF;
    END IF;

    v_previous_role := v_member.role;
    UPDATE public.organization_members
    SET deleted_at = v_now, deleted_by = p_actor_id
    WHERE id = v_member.id
    RETURNING * INTO v_member;
    v_action := 'member_removed';
    v_metadata := jsonb_build_object('removed_at', v_now, 'previous_role', v_previous_role);
  END IF;

  INSERT INTO public.org_audit_log (
    org_id, actor_id, actor_subject_id, action, target_id, metadata
  ) VALUES (
    p_org_id, p_actor_id, p_actor_id, v_action, p_target_user_id, v_metadata
  );

  RETURN to_jsonb(v_member);
END;
$$;

REVOKE ALL ON FUNCTION public.mutate_organization_membership(
  uuid, uuid, uuid, text, member_role_enum
) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_organization_membership(
  uuid, uuid, uuid, text, member_role_enum
) TO service_role;

-- ---------------------------------------------------------------------------
-- notification_prefs column on organization_members
-- ---------------------------------------------------------------------------
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{
    "digest": "weekly",
    "channels": {"in_app": true, "email": true},
    "alerts": {
      "assigned_to_me": true,
      "due_soon": true,
      "overdue": true,
      "approvals": true,
      "comments": true,
      "mentions": true,
      "automation_failures": true,
      "digest_summary": true,
      "org_admin": false
    }
  }'::jsonb;
