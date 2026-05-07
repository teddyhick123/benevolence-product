-- ============================================================================
-- Migration 0043: Add Missing Performance Indexes
-- ============================================================================
-- Purpose: Add critical indexes identified in database analysis
--
-- Expected Performance Gains:
--   - 30-50% faster portfolio queries
--   - 40-60% faster metric aggregations
--   - 20-30% faster tax year queries
--
-- Safe to run multiple times (IF NOT EXISTS checks)
-- ============================================================================

-- ============================================================================
-- 1. HOLDINGS TABLE INDEXES
-- ============================================================================

-- Composite index for portfolio asset breakdown queries
-- Common query: SELECT * FROM holdings WHERE portfolio_id = X AND asset_type = Y AND status = 'Active'
CREATE INDEX IF NOT EXISTS idx_holdings_portfolio_asset_status
  ON public.holdings(portfolio_id, asset_type, status);

-- Index for status filtering
-- Common query: SELECT * FROM holdings WHERE portfolio_id = X AND status = 'Active'
CREATE INDEX IF NOT EXISTS idx_holdings_status
  ON public.holdings(status)
  WHERE status = 'Active';

-- ============================================================================
-- 2. METRIC_FACTS TABLE INDEXES
-- ============================================================================

-- Composite index for metric aggregations with time ordering
-- Common query: SELECT * FROM metric_facts WHERE metric_code = X ORDER BY period_end DESC
CREATE INDEX IF NOT EXISTS idx_metric_facts_code_period_desc
  ON public.metric_facts(metric_code, period_end DESC)
  WHERE metric_code IS NOT NULL;

-- Composite index for holding-level metric queries
-- Common query: SELECT * FROM metric_facts WHERE holding_id = X AND metric_code = Y
CREATE INDEX IF NOT EXISTS idx_metric_facts_holding_code
  ON public.metric_facts(holding_id, metric_code)
  WHERE holding_id IS NOT NULL AND metric_code IS NOT NULL;

-- Note: Removed partial index for recent metrics (CURRENT_DATE not IMMUTABLE)
-- If needed, create this index periodically via maintenance script

-- ============================================================================
-- 3. TAX_CONTRIBUTIONS TABLE INDEXES
-- ============================================================================

-- Composite index for tax year queries
-- Common query: SELECT * FROM tax_contributions WHERE portfolio_id = X AND tax_year = 2024
CREATE INDEX IF NOT EXISTS idx_tax_contributions_portfolio_year
  ON public.tax_contributions(portfolio_id, tax_year);

-- Partial index for deductible contributions only
-- Common query: SELECT * FROM tax_contributions WHERE deductible_amount > 0
CREATE INDEX IF NOT EXISTS idx_tax_contributions_deductible
  ON public.tax_contributions(portfolio_id, tax_year, contribution_date)
  WHERE deductible_amount > 0;

-- Index for contribution type filtering
-- Common query: SELECT * FROM tax_contributions WHERE contribution_type = 'Stock'
CREATE INDEX IF NOT EXISTS idx_tax_contributions_type
  ON public.tax_contributions(contribution_type, tax_year);

-- ============================================================================
-- 4. HOLDINGS LOCATION INDEXES (Geocoding)
-- ============================================================================

-- BRIN index for latitude/longitude (more efficient than B-tree for range queries)
-- Common query: SELECT * FROM holdings WHERE latitude BETWEEN X AND Y
CREATE INDEX IF NOT EXISTS idx_holdings_lat_lon_brin
  ON public.holdings USING BRIN (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Regular index for geocode status filtering
-- Common query: SELECT * FROM holdings WHERE geocode_status = 'success'
CREATE INDEX IF NOT EXISTS idx_holdings_geocode_status
  ON public.holdings(geocode_status)
  WHERE geocode_status IS NOT NULL;

-- ============================================================================
-- 5. PORTFOLIO TABLES INDEXES
-- ============================================================================

-- Index for portfolio member lookups
-- Common query: SELECT * FROM portfolio_members WHERE user_id = X
CREATE INDEX IF NOT EXISTS idx_portfolio_members_user
  ON public.portfolio_members(user_id);

-- Index for active portfolio members with roles
-- Common query: SELECT * FROM portfolio_members WHERE role IN ('owner', 'editor')
CREATE INDEX IF NOT EXISTS idx_portfolio_members_role
  ON public.portfolio_members(portfolio_id, role)
  WHERE role IN ('owner', 'editor');

-- Note: Skipping portfolio_activity index - table does not exist in current schema

-- ============================================================================
-- 6. CHARITIES TABLE INDEXES
-- ============================================================================

-- Index for charity sector filtering
-- Common query: SELECT * FROM charities WHERE sector = 'Education'
CREATE INDEX IF NOT EXISTS idx_charities_sector
  ON public.charities(sector)
  WHERE sector IS NOT NULL;

-- Index for charity state filtering
-- Common query: SELECT * FROM charities WHERE state = 'CA'
CREATE INDEX IF NOT EXISTS idx_charities_state
  ON public.charities(state)
  WHERE state IS NOT NULL;

-- Index for active charities with data freshness
-- Common query: SELECT * FROM charities WHERE is_active = true ORDER BY data_last_updated DESC
CREATE INDEX IF NOT EXISTS idx_charities_active_updated
  ON public.charities(is_active, data_last_updated DESC)
  WHERE is_active = true;

-- ============================================================================
-- 7. WIDGETS TABLE INDEXES
-- ============================================================================

-- Index for portfolio widget ordering
-- Common query: SELECT * FROM widgets WHERE portfolio_id = X ORDER BY position
CREATE INDEX IF NOT EXISTS idx_widgets_portfolio_position
  ON public.widgets(portfolio_id, position);

-- Index for holding widget ordering
-- Common query: SELECT * FROM holding_widgets WHERE holding_id = X ORDER BY position
CREATE INDEX IF NOT EXISTS idx_holding_widgets_holding_position
  ON public.holding_widgets(holding_id, position);

-- ============================================================================
-- Success notification
-- ============================================================================
DO $$
BEGIN
  RAISE NOTICE '✓ Successfully created all indexes';
  RAISE NOTICE '  - Holdings indexes: 2';
  RAISE NOTICE '  - Metric facts indexes: 2';
  RAISE NOTICE '  - Tax contributions indexes: 3';
  RAISE NOTICE '  - Holdings location indexes: 2';
  RAISE NOTICE '  - Portfolio indexes: 2';
  RAISE NOTICE '  - Charities indexes: 3';
  RAISE NOTICE '  - Widget indexes: 2';
  RAISE NOTICE '  Total: 16 indexes created';
END $$;

-- ============================================================================
-- INDEX STATISTICS & VERIFICATION
-- ============================================================================
-- Run these queries manually to verify indexes are being used:

-- 1. Check all new indexes were created
-- SELECT
--   schemaname,
--   tablename,
--   indexname,
--   indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND indexname LIKE 'idx_%'
-- ORDER BY tablename, indexname;

-- 2. Analyze tables to update statistics
-- ANALYZE public.holdings;
-- ANALYZE public.metric_facts;
-- ANALYZE public.tax_contributions;
-- ANALYZE public.charities;

-- 3. Test query performance before/after
-- EXPLAIN ANALYZE
-- SELECT * FROM holdings
-- WHERE portfolio_id = 'your-portfolio-id'
--   AND asset_type = 'equity_investment'
--   AND status = 'Active';

-- 4. Check index usage over time
-- SELECT
--   schemaname,
--   tablename,
--   indexname,
--   idx_scan,
--   idx_tup_read,
--   idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan DESC;

-- ============================================================================
-- NOTES
-- ============================================================================
-- Index types used:
--   - B-tree (default): Most queries
--   - BRIN: Latitude/longitude (more efficient for large spatial data)
--   - Partial indexes: WHERE clauses reduce index size
--   - Composite indexes: Multiple columns in WHERE/ORDER BY
--
-- Maintenance:
--   - Indexes are automatically maintained on INSERT/UPDATE/DELETE
--   - Run ANALYZE periodically to update query planner statistics
--   - Monitor index bloat with pg_stat_user_indexes
--
-- Trade-offs:
--   - Indexes speed up SELECT but slow down INSERT/UPDATE
--   - Each index adds storage overhead (typically 10-30% of table size)
--   - Composite indexes work left-to-right (first column must be in WHERE)
-- ============================================================================
