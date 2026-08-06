-- Migration: 0045 — Enable security_invoker on all portfolio/org-scoped views
-- Date: 2026-06-13
--
-- Without security_invoker = true, PostgreSQL views run as the view definer
-- (SECURITY DEFINER by default), which bypasses row-level security on the
-- underlying tables. Any authenticated user could read any portfolio's data
-- by querying these views directly, even without portfolio membership.
--
-- With security_invoker = true, each view runs in the calling user's security
-- context. Base-table RLS policies (can_view_portfolio, can_view_org, etc.)
-- fire per-user as they do on direct table queries. Service-role clients
-- (createAdminClient) are unaffected — BYPASSRLS still applies.

-- 0002 — organizations
ALTER VIEW public.my_organizations              SET (security_invoker = true);

-- 0008 — metrics / KPIs
ALTER VIEW public.v_portfolio_kpi_latest        SET (security_invoker = true);

-- 0019 — portfolio summary views
ALTER VIEW public.v_holdings_enriched           SET (security_invoker = true);
ALTER VIEW public.v_holdings                    SET (security_invoker = true);
ALTER VIEW public.v_portfolio_summary           SET (security_invoker = true);
ALTER VIEW public.v_asset_allocation            SET (security_invoker = true);

-- 0022 — module enforcement
ALTER VIEW public.v_org_modules                 SET (security_invoker = true);

-- 0014 — donor summary
ALTER VIEW public.v_donor_summary               SET (security_invoker = true);

-- 0035 — analytics module
ALTER VIEW public.v_latest_risk_snapshot        SET (security_invoker = true);
ALTER VIEW public.v_active_insights             SET (security_invoker = true);
ALTER VIEW public.v_benchmark_lookup            SET (security_invoker = true);

-- 0038 — pledge tracking
ALTER VIEW public.v_pledge_pipeline             SET (security_invoker = true);

-- 0041 — task/workflow foundation (grant views)
ALTER VIEW public.v_grants                      SET (security_invoker = true);
ALTER VIEW public.v_portfolio_grant_summary     SET (security_invoker = true);
ALTER VIEW public.v_grant_health                SET (security_invoker = true);
