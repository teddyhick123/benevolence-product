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

  target_value    numeric,                   -- optional goal value for percent_complete
  baseline_value  numeric,                   -- starting value; progress measured from baseline to target
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
  updated_at      timestamptz NOT NULL DEFAULT now(),

  holding_id      uuid NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
  investee_id     uuid,
  kpi_id          uuid REFERENCES kpi_definitions(id) ON DELETE SET NULL,
  metric_code     text NOT NULL,          -- canonical metric key used by app routes and imports
  metric_name     text GENERATED ALWAYS AS (metric_code) STORED, -- compatibility alias
  period_start    date,
  period_end      date NOT NULL DEFAULT CURRENT_DATE,
  value           numeric NOT NULL,
  unit            text,
  source          text,
  verification_level text,
  data_quality_score numeric(5,4),
  submitted_by_org_id uuid REFERENCES organizations(id) ON DELETE SET NULL,
  notes           text,

  UNIQUE (holding_id, metric_code, period_start, period_end)
);

CREATE INDEX idx_metric_facts_holding_id  ON metric_facts (holding_id);
CREATE INDEX idx_metric_facts_kpi_id      ON metric_facts (kpi_id) WHERE kpi_id IS NOT NULL;
CREATE INDEX idx_metric_facts_metric_code ON metric_facts (metric_code);
CREATE INDEX idx_metric_facts_metric_name ON metric_facts (metric_name);
CREATE INDEX idx_metric_facts_period      ON metric_facts (period_start DESC);
CREATE INDEX idx_metric_facts_submitted_org
  ON metric_facts (submitted_by_org_id, updated_at DESC)
  WHERE submitted_by_org_id IS NOT NULL;

CREATE TRIGGER trg_metric_facts_updated_at
  BEFORE UPDATE ON metric_facts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- v_portfolio_kpi_latest — latest KPI value per holding, enriched with org KPI config
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_portfolio_kpi_latest
  WITH (security_invoker = true)
AS
SELECT DISTINCT ON (mf.holding_id, mf.metric_code)
  mf.holding_id,
  h.portfolio_id,
  h.org_id,
  mf.metric_code,
  COALESCE(kd.name, mf.metric_code)  AS metric_name,
  COALESCE(kd.name, mf.metric_code)  AS display_name,
  mf.kpi_id,
  mf.value,
  mf.unit,
  mf.period_start,
  mf.period_end,
  mf.source,
  kd.target_value,
  kd.baseline_value,
  NULL::date                          AS target_date,
  CASE
    WHEN kd.target_value IS NOT NULL AND kd.baseline_value IS NOT NULL
         AND kd.target_value <> kd.baseline_value
    THEN ROUND(
           LEAST(1, GREATEST(0,
             (mf.value - kd.baseline_value) / (kd.target_value - kd.baseline_value)
           )) * 100, 1)
    WHEN kd.direction = 'lower_is_better' AND kd.target_value IS NOT NULL AND kd.target_value > 0 AND mf.value > 0
    THEN ROUND((kd.target_value / mf.value * 100)::numeric, 1)
    WHEN kd.target_value IS NOT NULL AND kd.target_value > 0
    THEN ROUND((mf.value / kd.target_value * 100)::numeric, 1)
    ELSE NULL
  END                                  AS progress_percentage
FROM metric_facts mf
JOIN holdings h ON h.id = mf.holding_id AND h.deleted_at IS NULL
LEFT JOIN kpi_definitions kd
       ON kd.org_id = h.org_id
      AND kd.slug   = mf.metric_code
      AND kd.is_active
ORDER BY mf.holding_id, mf.metric_code, mf.period_end DESC;

-- ---------------------------------------------------------------------------
-- v_portfolio_kpi_series — complete portfolio KPI history for charts/reports
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_portfolio_kpi_series
  WITH (security_invoker = true)
AS
SELECT
  h.portfolio_id,
  h.org_id,
  mf.holding_id,
  h.name                              AS holding_name,
  h.sector,
  h.country,
  mf.kpi_id,
  mf.metric_code,
  COALESCE(kd.name, mf.metric_code)   AS metric_name,
  COALESCE(kd.name, mf.metric_code)   AS display_name,
  mf.value,
  mf.unit,
  mf.period_start,
  mf.period_end,
  mf.source,
  mf.created_at
FROM metric_facts mf
JOIN holdings h
  ON h.id = mf.holding_id
 AND h.deleted_at IS NULL
LEFT JOIN kpi_definitions kd
  ON kd.org_id = h.org_id
 AND kd.slug = mf.metric_code
 AND kd.is_active;

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
CREATE POLICY "kpi_definitions: service role can manage"
  ON kpi_definitions FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE metric_facts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "metric_facts: portfolio members can view"
  ON metric_facts FOR SELECT
  USING (can_view_portfolio((SELECT portfolio_id FROM holdings WHERE id = holding_id)));
CREATE POLICY "metric_facts: portfolio members (member+) can manage"
  ON metric_facts FOR ALL
  USING (can_edit_portfolio((SELECT portfolio_id FROM holdings WHERE id = holding_id)))
  WITH CHECK (can_edit_portfolio((SELECT portfolio_id FROM holdings WHERE id = holding_id)));
CREATE POLICY "metric_facts: service role can manage"
  ON metric_facts FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON kpi_definitions TO authenticated;
GRANT ALL ON kpi_definitions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON metric_facts TO authenticated;
GRANT ALL ON metric_facts TO service_role;
GRANT SELECT ON v_portfolio_kpi_latest TO authenticated, service_role;
GRANT SELECT ON v_portfolio_kpi_series TO authenticated, service_role;
