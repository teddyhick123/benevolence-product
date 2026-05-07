-- =============================================================================
-- 0004_portfolios.sql
-- Portfolios — sub-entities within an org. A family office org might have
-- multiple portfolios (one per family branch, one per fund, etc.).
-- Membership ⊆ org membership is enforced by trigger.
-- Depends on: 0001, 0002, 0003
-- =============================================================================

-- ---------------------------------------------------------------------------
-- portfolios
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolios (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Every portfolio belongs to exactly one org from day one
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  owner_id        uuid NOT NULL REFERENCES auth.users(id),

  name            text NOT NULL,
  description     text,

  -- Portfolio-level settings (override org defaults where applicable)
  settings        jsonb NOT NULL DEFAULT '{}',
  -- e.g. { "fiscal_year_end_month": 12, "default_currency": "USD", "tax_regime": "501c3" }

  -- Soft-delete
  deleted_at      timestamptz,
  deleted_by      uuid REFERENCES auth.users(id)
);

CREATE INDEX idx_portfolios_org_id    ON portfolios (org_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_portfolios_owner_id  ON portfolios (owner_id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_portfolios_updated_at
  BEFORE UPDATE ON portfolios
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- portfolio_members
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolio_members (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  portfolio_id    uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role            member_role_enum NOT NULL DEFAULT 'viewer',
  invited_by      uuid REFERENCES auth.users(id),

  -- Soft-delete
  deleted_at      timestamptz,
  deleted_by      uuid REFERENCES auth.users(id),

  UNIQUE (portfolio_id, user_id)
);

CREATE INDEX idx_portfolio_members_user_id      ON portfolio_members (user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_portfolio_members_portfolio_id ON portfolio_members (portfolio_id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_portfolio_members_updated_at
  BEFORE UPDATE ON portfolio_members
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- Constraint: portfolio membership ⊆ org membership
-- A user cannot be added to a portfolio unless they are already a member of
-- the org that owns that portfolio.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_portfolio_member_in_org()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT org_id INTO v_org_id FROM portfolios WHERE id = NEW.portfolio_id;

  IF NOT EXISTS (
    SELECT 1 FROM organization_members
    WHERE org_id     = v_org_id
      AND user_id    = NEW.user_id
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION
      'User % is not a member of org % — add them to the org before the portfolio.',
      NEW.user_id, v_org_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_portfolio_member_in_org
  BEFORE INSERT OR UPDATE ON portfolio_members
  FOR EACH ROW EXECUTE FUNCTION enforce_portfolio_member_in_org();

-- ---------------------------------------------------------------------------
-- portfolio_settings (per-portfolio key-value overrides)
-- Kept separate from portfolios.settings JSONB to support fine-grained RLS
-- and easier change history.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolio_settings (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  portfolio_id    uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  key             text NOT NULL,
  value           jsonb,

  UNIQUE (portfolio_id, key)
);

CREATE INDEX idx_portfolio_settings_portfolio_id ON portfolio_settings (portfolio_id);

CREATE TRIGGER trg_portfolio_settings_updated_at
  BEFORE UPDATE ON portfolio_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: portfolios
-- ---------------------------------------------------------------------------
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portfolios: members can view"
  ON portfolios FOR SELECT
  USING (can_view_portfolio(id) AND deleted_at IS NULL);

-- Org admins can also see all portfolios in their org (for management)
CREATE POLICY "portfolios: org admins can view all"
  ON portfolios FOR SELECT
  USING (is_org_admin(org_id) AND deleted_at IS NULL);

CREATE POLICY "portfolios: members can edit"
  ON portfolios FOR UPDATE
  USING (can_edit_portfolio(id) AND deleted_at IS NULL)
  WITH CHECK (can_edit_portfolio(id));

CREATE POLICY "portfolios: org admins can create"
  ON portfolios FOR INSERT
  WITH CHECK (is_org_admin(org_id));

CREATE POLICY "portfolios: portfolio admins can soft-delete"
  ON portfolios FOR UPDATE
  USING (
    (user_portfolio_role(id) IN ('admin','owner') OR is_org_admin(org_id))
    AND deleted_at IS NULL
  )
  WITH CHECK (
    user_portfolio_role(id) IN ('admin','owner') OR is_org_admin(org_id)
  );

-- ---------------------------------------------------------------------------
-- RLS: portfolio_members
-- ---------------------------------------------------------------------------
ALTER TABLE portfolio_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portfolio_members: members can view"
  ON portfolio_members FOR SELECT
  USING (can_view_portfolio(portfolio_id) AND deleted_at IS NULL);

CREATE POLICY "portfolio_members: portfolio admins can manage"
  ON portfolio_members FOR ALL
  USING (
    user_portfolio_role(portfolio_id) IN ('admin','owner')
    OR is_org_admin((SELECT org_id FROM portfolios WHERE id = portfolio_id))
  )
  WITH CHECK (
    user_portfolio_role(portfolio_id) IN ('admin','owner')
    OR is_org_admin((SELECT org_id FROM portfolios WHERE id = portfolio_id))
  );

-- ---------------------------------------------------------------------------
-- RLS: portfolio_settings
-- ---------------------------------------------------------------------------
ALTER TABLE portfolio_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portfolio_settings: members can view"
  ON portfolio_settings FOR SELECT
  USING (can_view_portfolio(portfolio_id));

CREATE POLICY "portfolio_settings: admins can manage"
  ON portfolio_settings FOR ALL
  USING (user_portfolio_role(portfolio_id) IN ('admin','owner'))
  WITH CHECK (user_portfolio_role(portfolio_id) IN ('admin','owner'));
