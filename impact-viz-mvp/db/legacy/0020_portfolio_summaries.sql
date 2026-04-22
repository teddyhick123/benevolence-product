-- Migration 0020: Portfolio-Level Summary Views for Phase 4
-- Purpose: Add aggregate views for grants and donations summaries
-- Author: Claude Code
-- Date: 2024-11-24

-- ============================================================================
-- PART 1: PORTFOLIO GRANT SUMMARY VIEW
-- Aggregate grant metrics across entire portfolio
-- ============================================================================

CREATE VIEW v_portfolio_grant_summary AS
SELECT
  portfolio_id,

  -- Counts
  COUNT(*) as total_grants,
  COUNT(*) FILTER (WHERE grant_period_status = 'active') as active_grants,
  COUNT(*) FILTER (WHERE grant_period_status = 'ended') as ended_grants,
  COUNT(*) FILTER (WHERE grant_period_status = 'future') as future_grants,

  -- Asset type breakdown
  COUNT(*) FILTER (WHERE asset_type = 'foundation_grant') as foundation_grant_count,
  COUNT(*) FILTER (WHERE asset_type = 'daf_grant') as daf_grant_count,

  -- Grant type breakdown
  COUNT(*) FILTER (WHERE grant_type = 'general_operating') as general_operating_count,
  COUNT(*) FILTER (WHERE grant_type = 'project') as project_count,
  COUNT(*) FILTER (WHERE grant_type = 'capacity_building') as capacity_building_count,
  COUNT(*) FILTER (WHERE grant_type = 'multi_year') as multi_year_count,

  -- Financial totals
  SUM(funds_allocated) as total_funds_allocated,
  AVG(funds_allocated) as avg_grant_size,

  -- Renewal tracking
  COUNT(*) FILTER (WHERE renewal_eligible = true) as renewal_eligible_count,
  MIN(renewal_date) FILTER (WHERE renewal_eligible = true AND renewal_date >= CURRENT_DATE) as next_renewal_date,

  -- Milestone aggregates
  SUM(total_milestones) as total_milestones,
  SUM(milestones_completed) as total_milestones_completed,
  SUM(milestones_pending) as total_milestones_pending,
  SUM(milestones_overdue) as total_milestones_overdue,

  -- Report aggregates
  SUM(total_reports) as total_reports,
  SUM(reports_submitted) as total_reports_submitted,
  SUM(reports_overdue) as total_reports_overdue,

  -- Average milestone completion rate
  AVG(milestone_completion_pct) FILTER (WHERE milestone_completion_pct IS NOT NULL) as avg_milestone_completion_pct,

  -- Upcoming deadlines
  MIN(next_report_due) FILTER (WHERE next_report_due >= CURRENT_DATE) as next_report_due

FROM v_grants
GROUP BY portfolio_id;

COMMENT ON VIEW v_portfolio_grant_summary IS
  'Portfolio-level aggregation of grant metrics including milestones and reporting';

-- ============================================================================
-- PART 2: PORTFOLIO DONATION SUMMARY VIEW
-- Aggregate donation/charitable contribution metrics
-- ============================================================================

CREATE VIEW v_portfolio_donation_summary AS
SELECT
  h.portfolio_id,

  -- Donation counts
  COUNT(DISTINCT h.id) as total_donations,
  COUNT(DISTINCT h.id) FILTER (WHERE h.status = 'Active') as active_donations,

  -- Financial totals
  SUM(h.funds_allocated) as total_donation_amount,
  AVG(h.funds_allocated) as avg_donation_amount,
  MAX(h.funds_allocated) as largest_donation,

  -- Tax contribution linkage
  COUNT(DISTINCT tc.id) as linked_tax_contributions,
  SUM(tc.amount_usd) as total_tax_deductible_amount,
  SUM(CASE
    WHEN tc.cost_basis IS NOT NULL AND tc.fmv_at_donation IS NOT NULL
    THEN tc.fmv_at_donation - tc.cost_basis
    ELSE 0
  END) as total_avoided_capital_gains,

  -- Carryforward tracking (from separate carryforwards table)
  COALESCE(cf_summary.total_carryforward_available, 0) as total_carryforward_available

FROM public.holdings h
LEFT JOIN public.tax_contributions tc ON h.id = tc.holding_id
LEFT JOIN LATERAL (
  SELECT SUM(tcf.amount_remaining) as total_carryforward_available
  FROM public.tax_carryforwards tcf
  WHERE tcf.portfolio_id = h.portfolio_id
    AND tcf.amount_remaining > 0
) cf_summary ON true
WHERE h.asset_type = 'donation'
GROUP BY h.portfolio_id, cf_summary.total_carryforward_available;

COMMENT ON VIEW v_portfolio_donation_summary IS
  'Portfolio-level aggregation of donation metrics and tax benefits';

-- ============================================================================
-- PART 3: UNIFIED PORTFOLIO SUMMARY VIEW
-- Combined view of all asset types for dashboard overview
-- ============================================================================

CREATE VIEW v_portfolio_unified_summary AS
SELECT
  p.id as portfolio_id,
  p.name as portfolio_name,

  -- Holdings count by category
  COUNT(h.id) as total_holdings,
  COUNT(h.id) FILTER (WHERE h.asset_type IN ('equity_investment', 'debt_investment', 'pri', 'mri')) as investment_count,
  COUNT(h.id) FILTER (WHERE h.asset_type IN ('foundation_grant', 'daf_grant')) as grant_count,
  COUNT(h.id) FILTER (WHERE h.asset_type = 'donation') as donation_count,
  COUNT(h.id) FILTER (WHERE h.asset_type = 'other') as other_count,

  -- Total allocation
  SUM(h.funds_allocated) as total_funds_allocated,

  -- Investment summary (from v_portfolio_investment_summary)
  inv.total_cost_basis as investment_cost_basis,
  inv.total_current_nav as investment_current_nav,
  inv.total_distributions as investment_distributions,
  inv.portfolio_moic as investment_moic,

  -- Grant summary (from v_portfolio_grant_summary)
  gr.total_funds_allocated as grant_total_allocated,
  gr.active_grants as grant_active_count,
  gr.total_milestones_overdue as grant_milestones_overdue,
  gr.total_reports_overdue as grant_reports_overdue,
  gr.next_report_due as grant_next_report_due,

  -- Donation summary (from v_portfolio_donation_summary)
  don.total_donation_amount as donation_total_amount,
  don.total_tax_deductible_amount as donation_tax_deductible,
  don.total_carryforward_available as donation_carryforward_available

FROM public.portfolios p
LEFT JOIN public.holdings h ON p.id = h.portfolio_id
LEFT JOIN v_portfolio_investment_summary inv ON p.id = inv.portfolio_id
LEFT JOIN v_portfolio_grant_summary gr ON p.id = gr.portfolio_id
LEFT JOIN v_portfolio_donation_summary don ON p.id = don.portfolio_id
GROUP BY p.id, p.name, inv.total_cost_basis, inv.total_current_nav, inv.total_distributions, inv.portfolio_moic,
         gr.total_funds_allocated, gr.active_grants, gr.total_milestones_overdue, gr.total_reports_overdue, gr.next_report_due,
         don.total_donation_amount, don.total_tax_deductible_amount, don.total_carryforward_available;

COMMENT ON VIEW v_portfolio_unified_summary IS
  'Unified portfolio overview with investment, grant, and donation summaries';

-- ============================================================================
-- Migration Verification
-- ============================================================================

/*
-- Check view creation
SELECT table_name FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN ('v_portfolio_grant_summary', 'v_portfolio_donation_summary', 'v_portfolio_unified_summary');

-- Test grant summary view
SELECT * FROM v_portfolio_grant_summary LIMIT 1;

-- Test donation summary view
SELECT * FROM v_portfolio_donation_summary LIMIT 1;

-- Test unified summary view
SELECT * FROM v_portfolio_unified_summary LIMIT 1;
*/

-- ============================================================================
-- Rollback Instructions
-- ============================================================================

/*
BEGIN;

DROP VIEW IF EXISTS v_portfolio_unified_summary;
DROP VIEW IF EXISTS v_portfolio_donation_summary;
DROP VIEW IF EXISTS v_portfolio_grant_summary;

COMMIT;
*/
