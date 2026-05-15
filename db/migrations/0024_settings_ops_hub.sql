-- db/migrations/0024_settings_ops_hub.sql
-- Settings & Ops Hub: org_audit_log, notification_prefs
-- Depends on: 0001-0023
-- Note: org_invitations is defined canonically in 0002_organizations.sql.

-- ---------------------------------------------------------------------------
-- org_audit_log
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_audit_log (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id     uuid NOT NULL REFERENCES auth.users(id),
  action       text NOT NULL,
  target_id    uuid,
  metadata     jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_audit_log_org_created_idx ON org_audit_log (org_id, created_at DESC);

ALTER TABLE org_audit_log ENABLE ROW LEVEL SECURITY;

-- Org admins/owners can read audit log for their org
CREATE POLICY "org admins can read audit log"
  ON org_audit_log FOR SELECT
  USING (is_org_admin(org_id));

-- Inserts only via service role (bypasses RLS) to prevent tampering

-- ---------------------------------------------------------------------------
-- notification_prefs column on organization_members
-- ---------------------------------------------------------------------------
ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS notification_prefs jsonb NOT NULL DEFAULT '{"digest":"weekly","alerts":["member_joined","module_changed"]}';
