-- =============================================================================
-- 0019_portfolio_summary_views.sql
-- Materialized and regular views for portfolio summary / dashboard KPIs.
-- Depends on: 0006, 0007, 0008, 0009, 0013
-- =============================================================================

-- ---------------------------------------------------------------------------
-- v_holdings_enriched — joins holdings with latest valuation + facts
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_holdings_enriched AS
SELECT
  h.*,
  -- Latest valuation (prefer manager-reported, then mark-to-market)
  v.value           AS latest_value,
  v.valued_at       AS latest_valued_at,
  v.valuation_type  AS latest_valuation_type,
  -- Computed unrealized gain/loss
  CASE
    WHEN h.amount_invested IS NOT NULL AND v.value IS NOT NULL
    THEN v.value - h.amount_invested
    ELSE NULL
  END               AS unrealized_gain_loss,
  CASE
    WHEN h.amount_invested IS NOT NULL AND h.amount_invested > 0 AND v.value IS NOT NULL
    THEN (v.value - h.amount_invested) / h.amount_invested
    ELSE NULL
  END               AS unrealized_return_pct
FROM holdings h
LEFT JOIN LATERAL (
  SELECT value, valued_at, valuation_type
  FROM holding_valuations hv
  WHERE hv.holding_id = h.id
  ORDER BY
    CASE valuation_type
      WHEN 'manager_reported' THEN 1
      WHEN 'mark_to_market'   THEN 2
      WHEN 'mark_to_model'    THEN 3
      ELSE 4
    END,
    hv.valued_at DESC
  LIMIT 1
) v ON true
WHERE h.deleted_at IS NULL;

-- Backwards-compatible public holdings view used by portfolio APIs.
CREATE OR REPLACE VIEW v_holdings AS
SELECT *
FROM v_holdings_enriched;

-- ---------------------------------------------------------------------------
-- v_portfolio_summary — one-row-per-portfolio financial summary
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_portfolio_summary AS
SELECT
  p.id                  AS portfolio_id,
  p.org_id,
  p.name                AS portfolio_name,
  COUNT(h.id)           AS total_holdings,
  COUNT(h.id) FILTER (WHERE h.status = 'active')        AS active_holdings,
  COUNT(h.id) FILTER (WHERE h.asset_type IN ('foundation_grant','donation','daf_grant','program_related_investment','mission_related_investment'))
                        AS impact_holdings,
  SUM(h.amount_invested) FILTER (WHERE h.status = 'active')
                        AS total_invested,
  SUM(he.latest_value) FILTER (WHERE h.status = 'active')
                        AS total_current_value,
  SUM(h.amount_invested) FILTER (WHERE h.asset_type IN ('foundation_grant','donation','daf_grant'))
                        AS total_granted,
  AVG(h.impact_score) FILTER (WHERE h.impact_score IS NOT NULL)
                        AS avg_impact_score
FROM portfolios p
LEFT JOIN v_holdings_enriched he ON he.portfolio_id = p.id
LEFT JOIN holdings h ON h.id = he.id
WHERE p.deleted_at IS NULL
GROUP BY p.id, p.org_id, p.name;

-- ---------------------------------------------------------------------------
-- v_asset_allocation — asset type breakdown per portfolio
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW v_asset_allocation AS
SELECT
  h.portfolio_id,
  h.org_id,
  h.asset_type,
  COUNT(*)              AS holding_count,
  SUM(he.latest_value)  AS total_value,
  SUM(h.amount_invested) AS total_invested,
  SUM(he.latest_value) / NULLIF(SUM(SUM(he.latest_value)) OVER (PARTITION BY h.portfolio_id), 0)
                        AS pct_of_portfolio
FROM v_holdings_enriched he
JOIN holdings h ON h.id = he.id
WHERE h.status = 'active'
GROUP BY h.portfolio_id, h.org_id, h.asset_type;

GRANT SELECT ON v_holdings_enriched TO authenticated, service_role;
GRANT SELECT ON v_holdings TO authenticated, service_role;
GRANT SELECT ON v_portfolio_summary TO authenticated, service_role;
GRANT SELECT ON v_asset_allocation TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- financial_analysis_cache — AI-generated financial analysis snapshots
-- Avoids re-running expensive analysis on every dashboard load
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS financial_analysis_cache (
  id              uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  portfolio_id    uuid NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  analysis_type   text NOT NULL,
  -- 'portfolio_health', 'diversification', 'impact_alignment', 'tax_efficiency', 'peer_comparison'

  result          jsonb NOT NULL,
  model_version   text,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),

  UNIQUE (portfolio_id, analysis_type)
);

CREATE INDEX idx_financial_analysis_cache_portfolio ON financial_analysis_cache (portfolio_id);
CREATE INDEX idx_financial_analysis_cache_expiry    ON financial_analysis_cache (expires_at);

CREATE TRIGGER trg_financial_analysis_cache_updated_at
  BEFORE UPDATE ON financial_analysis_cache
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE financial_analysis_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "financial_analysis_cache: portfolio members can view"
  ON financial_analysis_cache FOR SELECT
  USING (can_view_portfolio(portfolio_id));
CREATE POLICY "financial_analysis_cache: portfolio members (member+) can manage"
  ON financial_analysis_cache FOR ALL
  USING (can_edit_portfolio(portfolio_id))
  WITH CHECK (can_edit_portfolio(portfolio_id));
