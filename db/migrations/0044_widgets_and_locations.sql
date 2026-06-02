-- Migration: Portfolio Widgets and Holding Locations
-- Description: Adds portfolio-level widgets table and holding_locations for multi-site map support.
--              Fixes Vis-B1 (widgets table missing) and Vis-B2 (holding_locations missing).
-- Date: 2026-06-02

-- ---------------------------------------------------------------------------
-- widgets — portfolio-level dashboard widget configuration
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.widgets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  portfolio_id uuid        NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  type         text        NOT NULL,
  title        text,
  config       jsonb       NOT NULL DEFAULT '{}',
  position     integer     NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_widgets_portfolio_id ON public.widgets (portfolio_id);
CREATE INDEX IF NOT EXISTS idx_widgets_portfolio_position ON public.widgets (portfolio_id, position);

ALTER TABLE public.widgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "widgets: portfolio members can view"
  ON public.widgets FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

CREATE POLICY "widgets: portfolio editors can manage"
  ON public.widgets FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

CREATE POLICY "widgets: service role full access"
  ON public.widgets FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.widgets TO authenticated;
GRANT ALL ON public.widgets TO service_role;

CREATE TRIGGER set_widgets_updated_at
  BEFORE UPDATE ON public.widgets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- holding_locations — additional geocoded locations per holding
-- Used by the map view to show multi-site holdings (office, project site, etc.)
-- Primary holding coordinates live on holdings.latitude / holdings.longitude.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.holding_locations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  holding_id   uuid        NOT NULL REFERENCES public.holdings(id) ON DELETE CASCADE,
  portfolio_id uuid        NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  name         text        NOT NULL,
  status       text,
  lat          double precision NOT NULL,
  lon          double precision NOT NULL,
  tags         text[]      NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_holding_locations_holding_id   ON public.holding_locations (holding_id);
CREATE INDEX IF NOT EXISTS idx_holding_locations_portfolio_id ON public.holding_locations (portfolio_id);
CREATE INDEX IF NOT EXISTS idx_holding_locations_coords       ON public.holding_locations USING gist (ll_to_earth(lat, lon));

ALTER TABLE public.holding_locations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "holding_locations: portfolio members can view"
  ON public.holding_locations FOR SELECT TO authenticated
  USING (public.can_view_portfolio(portfolio_id));

CREATE POLICY "holding_locations: portfolio editors can manage"
  ON public.holding_locations FOR ALL TO authenticated
  USING (public.can_edit_portfolio(portfolio_id))
  WITH CHECK (public.can_edit_portfolio(portfolio_id));

CREATE POLICY "holding_locations: service role full access"
  ON public.holding_locations FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.holding_locations TO authenticated;
GRANT ALL ON public.holding_locations TO service_role;

CREATE TRIGGER set_holding_locations_updated_at
  BEFORE UPDATE ON public.holding_locations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
