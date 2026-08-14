-- =============================================================================
-- 0002_organizations.sql
-- Organizations — the root tenant entity for every client deployment.
-- Each client gets their own Supabase instance, so there will typically be
-- 1-5 organizations per deployment (e.g. a family office + a personal charity).
-- Depends on: 0001 (enums, utility functions)
-- =============================================================================

-- ---------------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Identity
  name            text NOT NULL,
  description     text,
  slug            text UNIQUE,            -- URL-safe short name (optional)
  ein             text,                   -- EIN / tax ID for US nonprofits
  org_type        org_type_enum NOT NULL DEFAULT 'private_foundation',

  -- Per-org type configuration (avoids branching in RLS)
  -- e.g. { "fiscal_year_end_month": 12, "tax_regime": "501c3", "daf_sponsor_name": null }
  org_type_config jsonb NOT NULL DEFAULT '{}',

  -- Feature flags: which modules are active for this org
  -- e.g. { "quickbooks": true, "donors": true, "tax": true, "compliance": true }
  modules         jsonb NOT NULL DEFAULT '{}',

  -- Branding
  branding        jsonb NOT NULL DEFAULT '{}',
  -- e.g. { "logo_url": "...", "primary_color": "#1a1a2e", "custom_domain": null }

  -- Contact & address
  website         text,
  phone           text,
  address_line1   text,
  address_line2   text,
  city            text,
  state           text,
  zip             text,
  country         text NOT NULL DEFAULT 'US',

  -- Status
  is_active       boolean NOT NULL DEFAULT true,
  deleted_at      timestamptz,            -- soft-delete
  deleted_by      uuid REFERENCES auth.users(id),

  -- Per-org AI assistant instructions (Builder tab)
  ai_instructions   TEXT
);

CREATE INDEX idx_organizations_slug       ON organizations (slug) WHERE slug IS NOT NULL;
CREATE INDEX idx_organizations_ein        ON organizations (ein)  WHERE ein IS NOT NULL;
CREATE INDEX idx_organizations_org_type   ON organizations (org_type);
CREATE INDEX idx_organizations_is_active  ON organizations (is_active) WHERE deleted_at IS NULL;

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- organization_members
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organization_members (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            member_role_enum NOT NULL DEFAULT 'viewer',
  invited_by      uuid REFERENCES auth.users(id),
  accepted_at     timestamptz,            -- null = invitation pending

  -- Soft-delete (revoked memberships kept for audit)
  deleted_at      timestamptz,
  deleted_by      uuid REFERENCES auth.users(id),

  UNIQUE (org_id, user_id)
);

CREATE INDEX idx_org_members_user_id  ON organization_members (user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_org_members_org_id   ON organization_members (org_id)  WHERE deleted_at IS NULL;

CREATE TRIGGER trg_org_members_updated_at
  BEFORE UPDATE ON organization_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Organization authorization helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION org_role_gte(
  p_org_id uuid,
  p_min_role member_role_enum
)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.org_id = p_org_id
      AND om.user_id = auth.uid()
      AND om.deleted_at IS NULL
      AND om.accepted_at IS NOT NULL
      AND CASE p_min_role
            WHEN 'viewer' THEN om.role IN ('viewer','member','admin','owner')
            WHEN 'member' THEN om.role IN ('member','admin','owner')
            WHEN 'admin'  THEN om.role IN ('admin','owner')
            WHEN 'owner'  THEN om.role = 'owner'
          END
  );
$$;

CREATE OR REPLACE FUNCTION user_org_role(p_org_id uuid)
RETURNS member_role_enum
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.role FROM organization_members om
  WHERE om.org_id = p_org_id
    AND om.user_id = auth.uid()
    AND om.deleted_at IS NULL
    AND om.accepted_at IS NOT NULL
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION can_view_org(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT org_role_gte(p_org_id, 'viewer'); $$;

CREATE OR REPLACE FUNCTION can_edit_org(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT org_role_gte(p_org_id, 'member'); $$;

CREATE OR REPLACE FUNCTION is_org_admin(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT org_role_gte(p_org_id, 'admin'); $$;

CREATE OR REPLACE FUNCTION org_has_module(p_org_id uuid, p_module text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT (modules->>(
        CASE p_module
          WHEN 'pledge_tracking'       THEN 'pledges'
          WHEN 'donor_management'      THEN 'donors'
          WHEN 'tax_optimization'      THEN 'tax'
          WHEN 'compliance_regulatory' THEN 'compliance'
          WHEN 'reporting'             THEN 'reports'
          WHEN 'core'                  THEN 'portfolio'
          ELSE p_module
        END
      ))::boolean
      FROM organizations
      WHERE id = p_org_id
    ),
    false
  );
$$;

-- ---------------------------------------------------------------------------
-- org_invitations (pending email invites)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_invitations (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '7 days'),

  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invited_by      uuid NOT NULL REFERENCES auth.users(id),
  email           text NOT NULL,
  role            member_role_enum NOT NULL DEFAULT 'viewer',
  token           text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'accepted', 'cancelled', 'expired')),

  accepted_at     timestamptz,
  accepted_by     uuid REFERENCES auth.users(id),  -- user who accepted (may differ from email if email changed)

  UNIQUE (org_id, email, accepted_at)  -- allow re-invite after acceptance
);

CREATE INDEX idx_org_invitations_token    ON org_invitations (token) WHERE accepted_at IS NULL;
CREATE INDEX idx_org_invitations_email    ON org_invitations (email) WHERE accepted_at IS NULL;
CREATE INDEX idx_org_invitations_org_id   ON org_invitations (org_id);
CREATE INDEX idx_org_invitations_org_status ON org_invitations (org_id, status);
CREATE UNIQUE INDEX idx_org_invitations_pending_unique
  ON org_invitations (org_id, lower(email))
  WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- org_invitation_email_outbox — durable, retryable invitation delivery
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS org_invitation_email_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  invitation_id   uuid NOT NULL REFERENCES org_invitations(id) ON DELETE CASCADE,
  recipient_email text NOT NULL,
  role            member_role_enum NOT NULL,
  invitation_token text NOT NULL,
  message         text,
  status          text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'sending', 'retry', 'sent', 'cancelled', 'failed')),
  attempts        integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at      timestamptz,
  sent_at         timestamptz,
  last_error      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (invitation_id, invitation_token)
);

CREATE INDEX idx_org_invitation_email_outbox_due
  ON org_invitation_email_outbox (status, next_attempt_at)
  WHERE status IN ('pending', 'retry');

CREATE TRIGGER trg_org_invitation_email_outbox_updated_at
  BEFORE UPDATE ON org_invitation_email_outbox
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE org_invitation_email_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org invitation email outbox: service role"
  ON org_invitation_email_outbox FOR ALL TO service_role
  USING (true) WITH CHECK (true);
GRANT ALL ON org_invitation_email_outbox TO service_role;

-- Invitation state, its audit event, and delivery intent must commit together.
CREATE OR REPLACE FUNCTION public.mutate_org_invitation(
  p_org_id uuid,
  p_actor_id uuid,
  p_operation text,
  p_email text DEFAULT NULL,
  p_role member_role_enum DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_invitation_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_role member_role_enum;
  v_invitation public.org_invitations%ROWTYPE;
  v_existing_member uuid;
  v_profile_id uuid;
  v_new_token text;
  v_now timestamptz := now();
  v_created boolean := false;
BEGIN
  IF p_operation NOT IN ('create', 'resend', 'cancel') THEN
    RAISE EXCEPTION 'Invalid invitation operation' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(p_org_id::text));

  SELECT role INTO v_actor_role
  FROM public.organization_members
  WHERE org_id = p_org_id AND user_id = p_actor_id AND deleted_at IS NULL;
  IF v_actor_role IS NULL OR v_actor_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Only organization admins can manage invitations' USING ERRCODE = '42501';
  END IF;

  IF p_operation = 'create' THEN
    IF p_email IS NULL OR p_role IS NULL THEN
      RAISE EXCEPTION 'Email and role are required' USING ERRCODE = '22023';
    END IF;
    IF p_role = 'owner' AND v_actor_role <> 'owner' THEN
      RAISE EXCEPTION 'Only owners can invite another owner' USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_profile_id FROM public.profiles WHERE lower(email) = lower(p_email) LIMIT 1;
    IF v_profile_id IS NOT NULL THEN
      SELECT id INTO v_existing_member FROM public.organization_members
      WHERE org_id = p_org_id AND user_id = v_profile_id AND deleted_at IS NULL;
      IF v_existing_member IS NOT NULL THEN
        RAISE EXCEPTION 'This person is already a member of your organization.' USING ERRCODE = '23505';
      END IF;
    END IF;

    SELECT * INTO v_invitation FROM public.org_invitations
    WHERE org_id = p_org_id AND lower(email) = lower(p_email) AND status = 'pending'
    FOR UPDATE;
    IF v_invitation.id IS NOT NULL THEN
      RETURN jsonb_build_object('invitation', to_jsonb(v_invitation) - 'token', 'created', false);
    END IF;

    INSERT INTO public.org_invitations (org_id, email, role, invited_by)
    VALUES (p_org_id, p_email, p_role, p_actor_id)
    RETURNING * INTO v_invitation;
    v_created := true;
    INSERT INTO public.org_audit_log (org_id, actor_id, actor_subject_id, action, metadata)
    VALUES (p_org_id, p_actor_id, p_actor_id, 'invite_sent', jsonb_build_object('email', v_invitation.email, 'role', v_invitation.role));

  ELSE
    SELECT * INTO v_invitation FROM public.org_invitations
    WHERE id = p_invitation_id AND org_id = p_org_id
    FOR UPDATE;
    IF v_invitation.id IS NULL THEN
      RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002';
    END IF;
    IF v_invitation.status <> 'pending' THEN
      RAISE EXCEPTION 'Only pending invitations can be %', CASE WHEN p_operation = 'cancel' THEN 'cancelled' ELSE 'resent' END USING ERRCODE = 'P0001';
    END IF;

    IF p_operation = 'cancel' THEN
      UPDATE public.org_invitations SET status = 'cancelled' WHERE id = v_invitation.id;
      UPDATE public.org_invitation_email_outbox
      SET status = 'cancelled', next_attempt_at = v_now
      WHERE invitation_id = v_invitation.id AND status IN ('pending', 'retry');
      INSERT INTO public.org_audit_log (org_id, actor_id, actor_subject_id, action, target_id, metadata)
      VALUES (p_org_id, p_actor_id, p_actor_id, 'invite_cancelled', v_invitation.id, jsonb_build_object('email', v_invitation.email));
      RETURN jsonb_build_object('invitation', to_jsonb(v_invitation) - 'token', 'created', false);
    END IF;

    IF v_invitation.role = 'owner' AND v_actor_role <> 'owner' THEN
      RAISE EXCEPTION 'Only owners can resend an owner invitation' USING ERRCODE = '42501';
    END IF;
    v_new_token := encode(gen_random_bytes(32), 'hex');
    UPDATE public.org_invitations
    SET token = v_new_token, expires_at = v_now + interval '7 days'
    WHERE id = v_invitation.id
    RETURNING * INTO v_invitation;
    UPDATE public.org_invitation_email_outbox
    SET status = 'cancelled', next_attempt_at = v_now
    WHERE invitation_id = v_invitation.id AND status IN ('pending', 'retry');
    INSERT INTO public.org_audit_log (org_id, actor_id, actor_subject_id, action, target_id, metadata)
    VALUES (p_org_id, p_actor_id, p_actor_id, 'invite_resent', v_invitation.id,
      jsonb_build_object('email', v_invitation.email, 'role', v_invitation.role));
  END IF;

  INSERT INTO public.org_invitation_email_outbox (
    org_id, invitation_id, recipient_email, role, invitation_token, message
  ) VALUES (
    p_org_id, v_invitation.id, v_invitation.email, v_invitation.role, v_invitation.token, p_message
  );

  -- The raw acceptance token is a bearer secret. It reaches the invitee only
  -- through the email outbox above; it is never returned to the API caller.
  RETURN jsonb_build_object('invitation', to_jsonb(v_invitation) - 'token', 'created', v_created);
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_org_invitation_email_outbox(p_limit integer DEFAULT 50)
RETURNS SETOF public.org_invitation_email_outbox
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH candidates AS (
    SELECT id FROM public.org_invitation_email_outbox
    WHERE (status IN ('pending', 'retry') AND next_attempt_at <= now())
       OR (status = 'sending' AND claimed_at < now() - interval '15 minutes')
    ORDER BY created_at
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 200))
  )
  UPDATE public.org_invitation_email_outbox o
  SET status = 'sending', attempts = o.attempts + 1, claimed_at = now()
  FROM candidates
  WHERE o.id = candidates.id
  RETURNING o.*;
$$;

CREATE OR REPLACE FUNCTION public.finish_org_invitation_email_outbox(
  p_event_id uuid,
  p_outcome text,
  p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_attempts integer;
BEGIN
  SELECT attempts INTO v_attempts FROM public.org_invitation_email_outbox WHERE id = p_event_id FOR UPDATE;
  IF v_attempts IS NULL THEN RAISE EXCEPTION 'Invitation email event not found' USING ERRCODE = 'P0002'; END IF;
  IF p_outcome = 'sent' THEN
    UPDATE public.org_invitation_email_outbox SET status = 'sent', sent_at = now(), claimed_at = NULL, last_error = NULL WHERE id = p_event_id;
  ELSIF p_outcome = 'cancelled' THEN
    UPDATE public.org_invitation_email_outbox SET status = 'cancelled', claimed_at = NULL WHERE id = p_event_id;
  ELSIF p_outcome = 'failed' THEN
    UPDATE public.org_invitation_email_outbox
    SET status = CASE WHEN v_attempts >= 5 THEN 'failed' ELSE 'retry' END,
        next_attempt_at = CASE WHEN v_attempts >= 5 THEN next_attempt_at ELSE now() + (LEAST(v_attempts, 4) * interval '15 minutes') END,
        claimed_at = NULL, last_error = p_error
    WHERE id = p_event_id;
  ELSE
    RAISE EXCEPTION 'Invalid invitation email outcome' USING ERRCODE = '22023';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mutate_org_invitation(uuid, uuid, text, text, member_role_enum, text, uuid) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.mutate_org_invitation(uuid, uuid, text, text, member_role_enum, text, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.claim_org_invitation_email_outbox(integer) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_org_invitation_email_outbox(integer) TO service_role;
REVOKE ALL ON FUNCTION public.finish_org_invitation_email_outbox(uuid, text, text) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_org_invitation_email_outbox(uuid, text, text) TO service_role;

-- Accept an invitation as one idempotent transaction. Binding the raw token
-- prevents an older link from accepting an invitation after a resend rotates
-- its token; the invitation, membership, and audit record cannot diverge.
CREATE OR REPLACE FUNCTION public.accept_org_invitation(
  p_org_id uuid,
  p_invitation_id uuid,
  p_invitation_token text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation public.org_invitations%ROWTYPE;
  v_membership public.organization_members%ROWTYPE;
  v_now timestamptz := now();
  v_idempotent boolean := false;
BEGIN
  SELECT * INTO v_invitation
  FROM public.org_invitations
  WHERE id = p_invitation_id
    AND org_id = p_org_id
    AND token = p_invitation_token
  FOR UPDATE;

  IF v_invitation.id IS NULL THEN
    RAISE EXCEPTION 'Invitation not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_invitation.status = 'accepted' THEN
    IF v_invitation.accepted_by IS NOT NULL AND v_invitation.accepted_by <> p_user_id THEN
      RAISE EXCEPTION 'Invitation has already been accepted' USING ERRCODE = '42501';
    END IF;
    v_idempotent := true;
  ELSIF v_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'Invitation is %', v_invitation.status USING ERRCODE = 'P0001';
  ELSIF v_invitation.expires_at <= v_now THEN
    RAISE EXCEPTION 'Invitation has expired' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_membership
  FROM public.organization_members
  WHERE org_id = p_org_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF v_membership.id IS NULL THEN
    INSERT INTO public.organization_members (
      org_id, user_id, role, invited_by, accepted_at
    ) VALUES (
      p_org_id, p_user_id, v_invitation.role, v_invitation.invited_by, v_now
    );
  ELSIF v_membership.deleted_at IS NOT NULL OR v_membership.accepted_at IS NULL THEN
    UPDATE public.organization_members
    SET
      role = v_invitation.role,
      invited_by = v_invitation.invited_by,
      accepted_at = v_now,
      deleted_at = NULL,
      deleted_by = NULL
    WHERE id = v_membership.id;
  END IF;

  IF NOT v_idempotent THEN
    UPDATE public.org_invitations
    SET status = 'accepted', accepted_at = v_now, accepted_by = p_user_id
    WHERE id = v_invitation.id;

    INSERT INTO public.org_audit_log (
      org_id, actor_id, actor_subject_id, action, target_id, metadata
    ) VALUES (
      p_org_id,
      p_user_id,
      p_user_id,
      'invite_accepted',
      v_invitation.id,
      jsonb_build_object('role', v_invitation.role, 'email', v_invitation.email)
    );
  END IF;

  RETURN jsonb_build_object('org_id', p_org_id, 'idempotent', v_idempotent);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_org_invitation(uuid, uuid, text, uuid)
  FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_org_invitation(uuid, uuid, text, uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- RLS: organizations
-- ---------------------------------------------------------------------------
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org: members can view"
  ON organizations FOR SELECT
  USING (can_view_org(id) AND deleted_at IS NULL);

CREATE POLICY "org: admins can update"
  ON organizations FOR UPDATE
  USING (is_org_admin(id) AND deleted_at IS NULL)
  WITH CHECK (is_org_admin(id));

CREATE POLICY "org: owners can delete (soft)"
  ON organizations FOR UPDATE  -- soft-delete via deleted_at
  USING (org_role_gte(id, 'owner'))
  WITH CHECK (org_role_gte(id, 'owner'));

-- INSERT is handled by service role / signup flow only
CREATE POLICY "org: no direct insert"
  ON organizations FOR INSERT
  WITH CHECK (false);

CREATE POLICY "org: service role can manage"
  ON organizations FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO authenticated;
GRANT ALL ON organizations TO service_role;

-- ---------------------------------------------------------------------------
-- RLS: organization_members
-- ---------------------------------------------------------------------------
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members: members can view their org"
  ON organization_members FOR SELECT
  USING (can_view_org(org_id) AND deleted_at IS NULL);

CREATE POLICY "org_members: admins can insert"
  ON organization_members FOR INSERT
  WITH CHECK (is_org_admin(org_id));

CREATE POLICY "org_members: admins can update roles"
  ON organization_members FOR UPDATE
  USING (is_org_admin(org_id) AND deleted_at IS NULL)
  WITH CHECK (is_org_admin(org_id));

-- Members can only view their own record before acceptance (pending invites)
CREATE POLICY "org_members: users can see own pending"
  ON organization_members FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "org_members: service role can manage"
  ON organization_members FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON organization_members TO authenticated;
GRANT ALL ON organization_members TO service_role;

-- ---------------------------------------------------------------------------
-- RLS: org_invitations
-- ---------------------------------------------------------------------------
ALTER TABLE org_invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_invitations: admins can manage"
  ON org_invitations FOR ALL
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

CREATE POLICY "org_invitations: anyone can read by token"
  ON org_invitations FOR SELECT
  USING (
    expires_at > now()
    AND accepted_at IS NULL
    AND status = 'pending'
    AND email = (auth.jwt() ->> 'email')
  );

CREATE POLICY "org_invitations: service role can manage"
  ON org_invitations FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON org_invitations TO authenticated;
GRANT ALL ON org_invitations TO service_role;

-- ---------------------------------------------------------------------------
-- Helpful view: current user's orgs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW my_organizations AS
SELECT
  o.*,
  om.role         AS my_role,
  om.accepted_at  AS membership_accepted_at
FROM organizations o
JOIN organization_members om
  ON om.org_id   = o.id
 AND om.user_id  = auth.uid()
 AND om.deleted_at IS NULL
WHERE o.deleted_at IS NULL;
