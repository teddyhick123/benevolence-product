-- =============================================================================
-- 0001_extensions_and_shared_infra.sql
-- Extensions, shared enums, utility functions, audit infrastructure
-- Run first. No dependencies.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";      -- gen_random_bytes / share tokens
CREATE EXTENSION IF NOT EXISTS "pg_trgm";       -- trigram search on charity names
CREATE EXTENSION IF NOT EXISTS "unaccent";       -- accent-insensitive charity search
CREATE EXTENSION IF NOT EXISTS "btree_gist";     -- exclusion constraints
CREATE EXTENSION IF NOT EXISTS "cube";           -- earthdistance dependency
CREATE EXTENSION IF NOT EXISTS "earthdistance";  -- map distance indexes

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
  'committing',
  'rejected',
  'completed',
  'failed',
  'rolled_back'
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
