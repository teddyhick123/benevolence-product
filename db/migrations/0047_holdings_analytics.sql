-- Migration: Holdings Analytics Tables and Views
-- Description: Creates generated_financial_analyses table and
--              v_investment_performance, v_portfolio_investment_summary views.
--              Fixes H-B1 and H-B2.
-- Date: 2026-06-02

-- ---------------------------------------------------------------------------
-- generated_financial_analyses — AI-generated financial analysis snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.generated_financial_analyses (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at          timestamptz NOT NULL DEFAULT now(),

  holding_id          uuid        REFERENCES public.holdings(id) ON DELETE CASCADE,
  charity_id          uuid        REFERENCES public.charities(id) ON DELETE SET NULL,
  generated_by        uuid        REFERENCES auth.users(id),

  analysis_content    jsonb       NOT NULL DEFAULT '{}',
  financial_snapshot  jsonb       NOT NULL DEFAULT '{}',
  generated_at        timestamptz NOT NULL DEFAULT now(),
  version             integer     NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_gen_fin_analyses_holding_id ON public.generated_financial_analyses (holding_id);
CREATE INDEX IF NOT EXISTS idx_gen_fin_analyses_charity_id ON public.generated_financial_analyses (charity_id);
CREATE INDEX IF NOT EXISTS idx_gen_fin_analyses_version    ON public.generated_financial_analyses (holding_id, version DESC);

ALTER TABLE public.generated_financial_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "generated_financial_analyses: portfolio members can view"
  ON public.generated_financial_analyses FOR SELECT TO authenticated
  USING (
    holding_id IS NULL
    OR public.can_view_portfolio(
      (SELECT portfolio_id FROM public.holdings WHERE id = holding_id)
    )
  );

CREATE POLICY "generated_financial_analyses: portfolio editors can manage"
  ON public.generated_financial_analyses FOR ALL TO authenticated
  USING (
    holding_id IS NOT NULL
    AND public.can_edit_portfolio(
      (SELECT portfolio_id FROM public.holdings WHERE id = holding_id)
    )
  )
  WITH CHECK (
    holding_id IS NOT NULL
    AND public.can_edit_portfolio(
      (SELECT portfolio_id FROM public.holdings WHERE id = holding_id)
    )
  );

CREATE POLICY "generated_financial_analyses: service role full access"
  ON public.generated_financial_analyses FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.generated_financial_analyses TO authenticated;
GRANT ALL ON public.generated_financial_analyses TO service_role;

-- ---------------------------------------------------------------------------
-- v_investment_performance — per-holding performance with MOIC
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_investment_performance
  WITH (security_invoker = true)
AS
SELECT
  h.portfolio_id,
  h.id                                                          AS holding_id,
  h.name,
  h.asset_type,
  h.status,
  h.funds_allocated                                            AS cost_basis,
  h.nav                                                        AS current_nav,
  CASE
    WHEN h.funds_allocated > 0
    THEN ROUND((h.nav / h.funds_allocated)::numeric, 4)
    ELSE NULL
  END                                                          AS moic,
  CASE
    WHEN h.funds_allocated > 0
    THEN ROUND(((h.nav - h.funds_allocated) / h.funds_allocated * 100)::numeric, 2)
    ELSE NULL
  END                                                          AS return_pct,
  h.sector,
  h.country,
  h.created_at                                                 AS invested_at,
  h.ein
FROM public.holdings h;

GRANT SELECT ON public.v_investment_performance TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- v_portfolio_investment_summary — portfolio-level aggregates
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_portfolio_investment_summary
  WITH (security_invoker = true)
AS
SELECT
  h.portfolio_id,
  COUNT(*)                                                      AS total_holdings,
  COUNT(*) FILTER (WHERE h.status = 'Active')                  AS active_holdings,
  COALESCE(SUM(h.funds_allocated), 0)                         AS total_cost_basis,
  COALESCE(SUM(h.nav), 0)                                     AS total_nav,
  CASE
    WHEN SUM(h.funds_allocated) > 0
    THEN ROUND((SUM(h.nav) / SUM(h.funds_allocated))::numeric, 4)
    ELSE NULL
  END                                                          AS portfolio_moic,
  CASE
    WHEN SUM(h.funds_allocated) > 0
    THEN ROUND(((SUM(h.nav) - SUM(h.funds_allocated)) / SUM(h.funds_allocated) * 100)::numeric, 2)
    ELSE NULL
  END                                                          AS portfolio_return_pct,
  COUNT(DISTINCT h.sector) FILTER (WHERE h.sector IS NOT NULL) AS sector_count,
  COUNT(DISTINCT h.country) FILTER (WHERE h.country IS NOT NULL) AS country_count
FROM public.holdings h
GROUP BY h.portfolio_id;

GRANT SELECT ON public.v_portfolio_investment_summary TO authenticated, service_role;
