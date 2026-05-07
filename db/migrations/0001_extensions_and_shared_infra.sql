-- =============================================================================
-- 0001_extensions_and_shared_infra.sql
-- Extensions, shared enums, utility functions, audit infrastructure
-- Run first. No dependencies.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- trigram search on charity names
CREATE EXTENSION IF NOT EXISTS "unaccent";       -- accent-insensitive charity search
CREATE EXTENSION IF NOT EXISTS "btree_gist";     -- exclusion constraints

-- ---------------------------------------------------------------------------
-- Shared enums
-- ---------------------------------------------------------------------------

CREATE TYPE org_type_enum AS ENUM (
  'private_foundation',
  'family_office',
  'daf_sponsor',        -- donor-advised fund sponsoring organization
  'community_foundation',
  'nonprofit',
  'corporation',        -- corporate giving programs
  'individual'          -- single-person philanthropic account
);

CREATE TYPE member_role_enum AS ENUM (
  'owner',    -- full control including destroy
  'admin',    -- manage members, settings
  'member',   -- read/write operational data
  'viewer'    -- read-only
);

CREATE TYPE asset_type_enum AS ENUM (
  -- Charitable / impact
  'foundation_grant',
  'donation',
  'daf_grant',
  'program_related_investment',  -- PRI
  'mission_related_investment',  -- MRI
  -- Traditional investments
  'equity',
  'fixed_income',
  'real_estate',
  'private_equity',
  'hedge_fund',
  'cash_equivalent',
  'cryptocurrency',
  'commodity',
  -- Other
  'other'
);

CREATE TYPE holding_status_enum AS ENUM (
  'active',
  'exited',
  'pending',
  'written_off',
  'committed'   -- committed but not yet funded
);

CREATE TYPE import_status_enum AS ENUM (
  'pending',
  'processing',
  'needs_review',
  'approved',
  'rejected',
  'completed',
  'failed'
);

-- ---------------------------------------------------------------------------
-- Audit log (append-only, no RLS enforcement — admin tool)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id            bigserial PRIMARY KEY,
  created_at    timestamptz NOT NULL DEFAULT now(),
  org_id        uuid,             -- nullable: some events are pre-org (e.g. org creation)
  portfolio_id  uuid,
  actor_id      uuid,             -- auth.users.id
  actor_email   text,
  action        text NOT NULL,    -- e.g. 'holding.create', 'member.invite', 'import.approve'
  table_name    text,
  record_id     uuid,
  old_values    jsonb,
  new_values    jsonb,
  ip_address    inet,
  user_agent    text,
  metadata      jsonb             -- catch-all for extra context
);

-- Partition-friendly index pattern
CREATE INDEX idx_audit_log_org_id      ON audit_log (org_id, created_at DESC);
CREATE INDEX idx_audit_log_portfolio_id ON audit_log (portfolio_id, created_at DESC);
CREATE INDEX idx_audit_log_actor_id    ON audit_log (actor_id, created_at DESC);
CREATE INDEX idx_audit_log_action      ON audit_log (action, created_at DESC);

-- Audit log is append-only from application. Supabase service role only.
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_log: service role only"
  ON audit_log FOR ALL
  USING (false)
  WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- Generic soft-delete helper (used by multiple tables)
-- ---------------------------------------------------------------------------
-- Tables that support soft-delete will have: deleted_at timestamptz, deleted_by uuid
-- RLS policies filter WHERE deleted_at IS NULL by default.

-- ---------------------------------------------------------------------------
-- Shared utility functions
-- ---------------------------------------------------------------------------

-- Returns true if the calling user has the given (or higher) role in the org
-- Role hierarchy: owner > admin > member > viewer
CREATE OR REPLACE FUNCTION org_role_gte(
  p_org_id  uuid,
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

-- Returns the calling user's role in the org, or NULL if not a member
CREATE OR REPLACE FUNCTION user_org_role(p_org_id uuid)
RETURNS member_role_enum
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT om.role FROM organization_members om
  WHERE om.org_id   = p_org_id
    AND om.user_id  = auth.uid()
    AND om.deleted_at IS NULL
  LIMIT 1;
$$;

-- Returns the calling user's role in the portfolio, or NULL if not a member
CREATE OR REPLACE FUNCTION user_portfolio_role(p_portfolio_id uuid)
RETURNS member_role_enum
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pm.role FROM portfolio_members pm
  WHERE pm.portfolio_id = p_portfolio_id
    AND pm.user_id      = auth.uid()
    AND pm.deleted_at   IS NULL
  LIMIT 1;
$$;

-- Convenience predicates (used in RLS policies below and in later migrations)
CREATE OR REPLACE FUNCTION can_view_org(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT org_role_gte(p_org_id, 'viewer'); $$;

CREATE OR REPLACE FUNCTION can_edit_org(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT org_role_gte(p_org_id, 'member'); $$;

CREATE OR REPLACE FUNCTION is_org_admin(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$ SELECT org_role_gte(p_org_id, 'admin'); $$;

CREATE OR REPLACE FUNCTION can_view_portfolio(p_portfolio_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT EXISTS (
    SELECT 1 FROM portfolio_members pm
    WHERE pm.portfolio_id = p_portfolio_id
      AND pm.user_id      = auth.uid()
      AND pm.deleted_at   IS NULL
  );
$$;

CREATE OR REPLACE FUNCTION can_edit_portfolio(p_portfolio_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS
$$
  SELECT EXISTS (
    SELECT 1 FROM portfolio_members pm
    WHERE pm.portfolio_id = p_portfolio_id
      AND pm.user_id      = auth.uid()
      AND pm.deleted_at   IS NULL
      AND pm.role IN ('member','admin','owner')
  );
$$;

-- Check if an org has a specific module enabled
CREATE OR REPLACE FUNCTION org_has_module(p_org_id uuid, p_module text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (modules->>p_module)::boolean FROM organizations WHERE id = p_org_id),
    false
  );
$$;
