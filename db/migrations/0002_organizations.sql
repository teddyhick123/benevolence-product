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
  deleted_by      uuid REFERENCES auth.users(id)
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
