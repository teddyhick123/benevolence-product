-- db/migrations/0024_settings_ops_hub.sql
-- Settings & Ops Hub: org_invitations, org_audit_log, notification_prefs
-- Depends on: 0001-0023

-- ---------------------------------------------------------------------------
-- org_invitations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_invitations (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email        text NOT NULL,
  role         member_role_enum NOT NULL DEFAULT 'member',
  token        text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by   uuid NOT NULL REFERENCES auth.users(id),
  expires_at   timestamptz NOT NULL DEFAULT now() + interval '7 days',
  accepted_at  timestamptz,
  status       text NOT NULL DEFAULT 'pending'
               CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_invitations_org_status_idx ON org_invitations (org_id, status);
CREATE INDEX IF NOT EXISTS org_invitations_token_idx ON org_invitations (token);

ALTER TABLE org_invitations ENABLE ROW LEVEL SECURITY;

-- Org admins/owners can read and manage invitations for their org
CREATE POLICY "org admins can manage invitations"
  ON org_invitations FOR ALL
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

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
