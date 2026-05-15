-- =============================================================================
-- 0027_portfolio_charities.sql
-- Junction table linking charities to portfolios (watchlist / add-to-portfolio).
-- Replaces incorrect use of portfolio_recommendations for this purpose.
-- Depends on: 0002 (portfolios), 0010 (charities)
-- =============================================================================

CREATE TABLE IF NOT EXISTS portfolio_charities (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  portfolio_id    uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  charity_ein     text NOT NULL REFERENCES charities(ein) ON DELETE CASCADE,

  added_by        uuid REFERENCES auth.users(id),
  notes           text,
  min_investment  numeric(20,2),
  max_investment  numeric(20,2),
  status          text NOT NULL DEFAULT 'active',  -- 'active', 'archived'

  UNIQUE (portfolio_id, charity_ein)
);

CREATE INDEX idx_portfolio_charities_portfolio_id ON portfolio_charities (portfolio_id) WHERE status = 'active';
CREATE INDEX idx_portfolio_charities_charity_ein  ON portfolio_charities (charity_ein);

CREATE TRIGGER trg_portfolio_charities_updated_at
  BEFORE UPDATE ON portfolio_charities
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE portfolio_charities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "portfolio_charities_read" ON portfolio_charities
  FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

CREATE POLICY "portfolio_charities_write" ON portfolio_charities
  FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

CREATE POLICY "portfolio_charities_service" ON portfolio_charities
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolio_charities TO authenticated;
GRANT ALL ON public.portfolio_charities TO service_role;
