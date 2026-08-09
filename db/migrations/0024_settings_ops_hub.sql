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
