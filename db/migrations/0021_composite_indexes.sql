-- =============================================================================
-- 0021_composite_indexes.sql
-- Performance indexes for common query patterns across all modules.
-- Run last (after all tables exist).
-- Depends on: 0001-0020
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Holdings dashboard — most common: active holdings by portfolio + type
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_holdings_portfolio_type_status
  ON holdings (portfolio_id, asset_type, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_holdings_portfolio_focus_area
  ON holdings (portfolio_id)
  INCLUDE (name, asset_type, amount_invested, impact_score)
  WHERE deleted_at IS NULL AND status = 'active';

-- ---------------------------------------------------------------------------
-- Tax deduction queries — by portfolio + year
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_tax_contributions_portfolio_year
  ON tax_contributions (portfolio_id, tax_year, contribution_date DESC);

CREATE INDEX IF NOT EXISTS idx_tax_contributions_portfolio_type_year
  ON tax_contributions (portfolio_id, contribution_type, tax_year);

-- ---------------------------------------------------------------------------
-- Grants — by org + status + grantee
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_grants_org_status_date
  ON grants (org_id, status, payment_date DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_grants_grantee_ein_org
  ON grants (grantee_ein, org_id)
  WHERE grantee_ein IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Donors — common CRM list queries
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_donors_org_tier_recency
  ON donors (org_id, tier, recency_status, last_gift_date DESC)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- Contributions received — giving timeline
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_contributions_received_org_date
  ON contributions_received (org_id, contribution_date DESC);

CREATE INDEX IF NOT EXISTS idx_contributions_received_donor_date
  ON contributions_received (donor_id, contribution_date DESC);

-- ---------------------------------------------------------------------------
-- News articles — holding feed (most recent)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_news_articles_holding_published
  ON news_articles (holding_id, published_at DESC)
  WHERE holding_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Metric facts — time-series range queries
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_metric_facts_holding_metric_period
  ON metric_facts (holding_id, metric_name, period_end DESC);

-- ---------------------------------------------------------------------------
-- Filing calendar — upcoming deadlines view
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_filing_calendar_org_due_status
  ON filing_calendar (org_id, due_date, status)
  WHERE status IN ('upcoming','in_progress','extended','overdue');

-- ---------------------------------------------------------------------------
-- AI action log — review queue
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ai_action_log_pending_review
  ON ai_action_log (org_id, created_at DESC)
  WHERE requires_review AND reviewed_at IS NULL;

-- ---------------------------------------------------------------------------
-- Audit log — common queries by org + action
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_audit_log_org_action_date
  ON audit_log (org_id, action, created_at DESC)
  WHERE org_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Org membership — fast role lookup (hot path for every RLS check)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_org_members_lookup
  ON organization_members (org_id, user_id, role)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_portfolio_members_lookup
  ON portfolio_members (portfolio_id, user_id, role)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- QB transactions — uncategorized queue
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_qb_transactions_org_uncategorized_date
  ON qb_transactions (org_id, transaction_date DESC)
  WHERE NOT is_categorized;

-- ---------------------------------------------------------------------------
-- ANALYZE (update planner statistics after index creation)
-- ---------------------------------------------------------------------------
ANALYZE organizations;
ANALYZE organization_members;
ANALYZE portfolios;
ANALYZE portfolio_members;
ANALYZE holdings;
ANALYZE holding_facts;
ANALYZE metric_facts;
ANALYZE donors;
ANALYZE contributions_received;
ANALYZE grants;
ANALYZE filing_calendar;
ANALYZE quickbooks_connections;
ANALYZE qb_transactions;
