-- =============================================================================
-- 0008_metrics_and_kpis.sql
-- Impact KPI definitions and time-series metric facts at the portfolio level.
-- Depends on: 0001, 0004, 0006
-- =============================================================================

-- ---------------------------------------------------------------------------
-- kpi_definitions — org-level KPI catalog
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS kpi_definitions (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  org_id          uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  name            text NOT NULL,
  slug            text NOT NULL,          -- machine-readable key (e.g. 'jobs_created')
  description     text,
  unit            text,                   -- 'people', 'tons_co2', 'USD', '%', etc.
  aggregation     text NOT NULL DEFAULT 'sum',  -- 'sum', 'avg', 'last', 'first'
  direction       text NOT NULL DEFAULT 'higher_is_better',
  -- 'higher_is_better', 'lower_is_better', 'neutral'

  is_active       boolean NOT NULL DEFAULT true,
  display_order   int NOT NULL DEFAULT 0,

  UNIQUE (org_id, slug)
);

CREATE INDEX idx_kpi_definitions_org_id ON kpi_definitions (org_id) WHERE is_active;

CREATE TRIGGER trg_kpi_definitions_updated_at
  BEFORE UPDATE ON kpi_definitions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- metric_facts — time-series observations linked to KPI definitions
-- Replaces the old staging_metric_facts concept for finalized data.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS metric_facts (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),

  holding_id      uuid NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  kpi_id          uuid REFERENCES kpi_definitions(id) ON DELETE SET NULL,
  metric_name     text NOT NULL,          -- denormalized from kpi_definitions.slug for fast lookup
  period_start    date NOT NULL,
  period_end      date NOT NULL,
  value           numeric NOT NULL,
  unit            text,
  source          text,
  notes           text,

  UNIQUE (holding_id, metric_name, period_start, period_end)
);

CREATE INDEX idx_metric_facts_holding_id  ON metric_facts (holding_id);
CREATE INDEX idx_metric_facts_kpi_id      ON metric_facts (kpi_id) WHERE kpi_id IS NOT NULL;
CREATE INDEX idx_metric_facts_metric_name ON metric_facts (metric_name);
CREATE INDEX idx_metric_facts_period      ON metric_facts (period_start DESC);

-- ---------------------------------------------------------------------------
-- v_portfolio_kpi_latest — convenience view of most recent KPI value per holding
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_portfolio_kpi_latest AS
SELECT DISTINCT ON (mf.holding_id, mf.metric_name)
  mf.holding_id,
  h.portfolio_id,
  h.org_id,
  mf.metric_name,
  mf.kpi_id,
  mf.value,
  mf.unit,
  mf.period_start,
  mf.period_end,
  mf.source
FROM metric_facts mf
JOIN holdings h ON h.id = mf.holding_id AND h.deleted_at IS NULL
ORDER BY mf.holding_id, mf.metric_name, mf.period_end DESC;

-- ---------------------------------------------------------------------------
-- portfolio_recommendations — AI-generated suggestions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS portfolio_recommendations (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  portfolio_id    uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,

  recommendation_type text NOT NULL,   -- 'diversification', 'rebalance', 'impact_gap', etc.
  title           text NOT NULL,
  body            text NOT NULL,
  supporting_data jsonb,
  priority        int NOT NULL DEFAULT 5,  -- 1=highest

  is_dismissed    boolean NOT NULL DEFAULT false,
  dismissed_by    uuid REFERENCES auth.users(id),
  dismissed_at    timestamptz,

  expires_at      timestamptz
);

CREATE INDEX idx_portfolio_recommendations_portfolio_id
  ON portfolio_recommendations (portfolio_id)
  WHERE NOT is_dismissed AND (expires_at IS NULL OR expires_at > now());

CREATE TRIGGER trg_portfolio_recommendations_updated_at
  BEFORE UPDATE ON portfolio_recommendations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE kpi_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "kpi_definitions: org members can view"
  ON kpi_definitions FOR SELECT
  USING (can_view_org(org_id));
CREATE POLICY "kpi_definitions: org admins can manage"
  ON kpi_definitions FOR ALL
  USING (is_org_admin(org_id))
  WITH CHECK (is_org_admin(org_id));

ALTER TABLE metric_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "metric_facts: portfolio members can view"
  ON metric_facts FOR SELECT
  USING (can_view_portfolio((SELECT portfolio_id FROM holdings WHERE id = holding_id)));
CREATE POLICY "metric_facts: portfolio members (member+) can manage"
  ON metric_facts FOR ALL
  USING (can_edit_portfolio((SELECT portfolio_id FROM holdings WHERE id = holding_id)))
  WITH CHECK (can_edit_portfolio((SELECT portfolio_id FROM holdings WHERE id = holding_id)));

ALTER TABLE portfolio_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "portfolio_recommendations: portfolio members can view"
  ON portfolio_recommendations FOR SELECT
  USING (can_view_portfolio(portfolio_id));
CREATE POLICY "portfolio_recommendations: service role can insert"
  ON portfolio_recommendations FOR INSERT
  WITH CHECK (can_edit_portfolio(portfolio_id));
CREATE POLICY "portfolio_recommendations: portfolio members can dismiss"
  ON portfolio_recommendations FOR UPDATE
  USING (can_view_portfolio(portfolio_id))
  WITH CHECK (can_view_portfolio(portfolio_id));
