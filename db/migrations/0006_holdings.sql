-- =============================================================================
-- 0006_holdings.sql
-- Holdings — the universal asset record (investments, grants, donations, etc.)
-- This is the central table. All other financial tables FK to holdings.
-- Depends on: 0001, 0004
-- =============================================================================

CREATE TABLE IF NOT EXISTS holdings (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Ownership chain (both required — portfolio always has an org).
  -- org_id is derived from portfolios by trg_holdings_set_org_id.
  portfolio_id    uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Classification
  asset_type      asset_type_enum NOT NULL DEFAULT 'equity',
  status          holding_status_enum NOT NULL DEFAULT 'active',

  -- Identity
  name            text NOT NULL,
  description     text,
  sector          text,
  ein             text,           -- for nonprofits / grantees
  investee_id     uuid,
  ticker          text,           -- for public equities
  cusip           text,
  isin            text,
  website         text,
  custodian       text,
  valuation_method text,

  -- Location (for geocoded map view)
  address_line1   text,
  address_line2   text,
  city            text,
  state           text,
  zip             text,
  country         text,
  location_city   text,           -- UI compatibility alias for city
  location_state  text,           -- UI compatibility alias for state
  location_country text,          -- UI compatibility alias for country
  latitude        double precision,
  longitude       double precision,
  geocoded_at     timestamptz,
  geocode_status  text,
  geocode_provider text,
  geocode_metadata jsonb,

  -- Financials
  amount_invested numeric(20,4),
  current_value   numeric(20,4),
  funds_allocated numeric(20,4),  -- UI/reporting alias for allocated capital
  cost_basis      numeric(20,4),
  fmv             numeric(20,4),  -- fair market value for tax optimization
  currency        text NOT NULL DEFAULT 'USD',

  -- Dates
  investment_date date,
  exit_date       date,
  committed_date  date,
  as_of           date,

  -- Impact & display
  impact_score    numeric(5,2),   -- 0-100 composite
  focus_area      text[],         -- e.g. ['education','climate']
  cost_per_outcome numeric(20,4),
  cost_per_outcome_unit text,
  total_org_funding numeric(20,4),
  tags            text[],
  notes           text,

  -- External references
  external_id     text,           -- ID in source system (e.g. Blackbaud gift ID)
  source_system   text,           -- 'blackbaud', 'quickbooks', 'manual', etc.

  -- Soft-delete
  deleted_at      timestamptz,
  deleted_by      uuid REFERENCES auth.users(id)
);

CREATE OR REPLACE FUNCTION set_holding_org_id_from_portfolio()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
BEGIN
  SELECT p.org_id INTO v_org_id
  FROM portfolios p
  WHERE p.id = NEW.portfolio_id
    AND p.deleted_at IS NULL;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Portfolio % does not exist or is deleted', NEW.portfolio_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.org_id IS NULL THEN
    NEW.org_id := v_org_id;
  ELSIF NEW.org_id <> v_org_id THEN
    RAISE EXCEPTION 'Holding org_id % does not match portfolio org_id %', NEW.org_id, v_org_id
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.city := COALESCE(NEW.city, NEW.location_city);
  NEW.state := COALESCE(NEW.state, NEW.location_state);
  NEW.country := COALESCE(NEW.country, NEW.location_country);
  NEW.location_city := COALESCE(NEW.location_city, NEW.city);
  NEW.location_state := COALESCE(NEW.location_state, NEW.state);
  NEW.location_country := COALESCE(NEW.location_country, NEW.country);
  NEW.amount_invested := COALESCE(NEW.amount_invested, NEW.funds_allocated);
  NEW.current_value := COALESCE(NEW.current_value, NEW.fmv, NEW.funds_allocated);

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_holdings_set_org_id
  BEFORE INSERT OR UPDATE OF portfolio_id, org_id, city, state, country, location_city, location_state, location_country, amount_invested, current_value, funds_allocated, fmv
  ON holdings
  FOR EACH ROW EXECUTE FUNCTION set_holding_org_id_from_portfolio();

CREATE INDEX idx_holdings_portfolio_id   ON holdings (portfolio_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_holdings_org_id         ON holdings (org_id)        WHERE deleted_at IS NULL;
CREATE INDEX idx_holdings_asset_type     ON holdings (asset_type)    WHERE deleted_at IS NULL;
CREATE INDEX idx_holdings_status         ON holdings (status)        WHERE deleted_at IS NULL;
CREATE INDEX idx_holdings_ein            ON holdings (ein)           WHERE ein IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_holdings_ticker         ON holdings (ticker)        WHERE ticker IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_holdings_location       ON holdings (latitude, longitude) WHERE latitude IS NOT NULL;
CREATE INDEX idx_holdings_focus_area     ON holdings USING GIN (focus_area);
CREATE INDEX idx_holdings_tags           ON holdings USING GIN (tags);
-- Full-text search on holding name
CREATE INDEX idx_holdings_name_trgm      ON holdings USING GIN (name gin_trgm_ops);

CREATE TRIGGER trg_holdings_updated_at
  BEFORE UPDATE ON holdings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- holding_facts — time-series KPI observations per holding
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS holding_facts (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  holding_id      uuid NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  metric_name     text NOT NULL,
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  value           numeric NOT NULL,
  unit            text,
  source          text,           -- 'manual', 'import', 'api'
  notes           text,

  UNIQUE (holding_id, metric_name, period_start, period_end)
);

CREATE INDEX idx_holding_facts_holding_id   ON holding_facts (holding_id);
CREATE INDEX idx_holding_facts_metric_name  ON holding_facts (metric_name);
CREATE INDEX idx_holding_facts_period       ON holding_facts (period_start, period_end);

-- ---------------------------------------------------------------------------
-- holding_widgets — dashboard widget configuration per portfolio
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS holding_widgets (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  portfolio_id    uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  widget_type     text NOT NULL,   -- matches widget registry key
  config          jsonb NOT NULL DEFAULT '{}',
  position        jsonb,           -- { "x": 0, "y": 0, "w": 4, "h": 3 }
  is_active       boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_holding_widgets_portfolio_id ON holding_widgets (portfolio_id);

CREATE TRIGGER trg_holding_widgets_updated_at
  BEFORE UPDATE ON holding_widgets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: holdings
-- ---------------------------------------------------------------------------
ALTER TABLE holdings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holdings: portfolio members can view"
  ON holdings FOR SELECT
  USING (can_view_portfolio(portfolio_id) AND deleted_at IS NULL);

CREATE POLICY "holdings: org members can view"
  ON holdings FOR SELECT
  USING (can_view_org(org_id) AND deleted_at IS NULL);

CREATE POLICY "holdings: portfolio members (member+) can insert"
  ON holdings FOR INSERT
  WITH CHECK (can_edit_portfolio(portfolio_id));

CREATE POLICY "holdings: portfolio members (member+) can update"
  ON holdings FOR UPDATE
  USING (can_edit_portfolio(portfolio_id) AND deleted_at IS NULL)
  WITH CHECK (can_edit_portfolio(portfolio_id));

CREATE POLICY "holdings: portfolio admins can soft-delete"
  ON holdings FOR UPDATE
  USING (
    user_portfolio_role(portfolio_id) IN ('admin','owner')
    AND deleted_at IS NULL
  )
  WITH CHECK (user_portfolio_role(portfolio_id) IN ('admin','owner'));

-- ---------------------------------------------------------------------------
-- RLS: holding_facts
-- ---------------------------------------------------------------------------
ALTER TABLE holding_facts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holding_facts: inherit from holding"
  ON holding_facts FOR SELECT
  USING (
    can_view_portfolio((SELECT portfolio_id FROM holdings WHERE id = holding_id))
  );

CREATE POLICY "holding_facts: portfolio members (member+) can manage"
  ON holding_facts FOR ALL
  USING (
    can_edit_portfolio((SELECT portfolio_id FROM holdings WHERE id = holding_id))
  )
  WITH CHECK (
    can_edit_portfolio((SELECT portfolio_id FROM holdings WHERE id = holding_id))
  );

-- ---------------------------------------------------------------------------
-- RLS: holding_widgets
-- ---------------------------------------------------------------------------
ALTER TABLE holding_widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holding_widgets: portfolio members can view"
  ON holding_widgets FOR SELECT
  USING (can_view_portfolio(portfolio_id));

CREATE POLICY "holding_widgets: portfolio admins can manage"
  ON holding_widgets FOR ALL
  USING (user_portfolio_role(portfolio_id) IN ('admin','owner'))
  WITH CHECK (user_portfolio_role(portfolio_id) IN ('admin','owner'));
