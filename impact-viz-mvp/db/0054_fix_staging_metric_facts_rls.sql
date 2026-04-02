-- Fix staging_metric_facts RLS: drop overly permissive policies and replace with scoped ones

-- Drop existing permissive policies
DROP POLICY IF EXISTS "staging_metric_facts_select_all" ON public.staging_metric_facts;
DROP POLICY IF EXISTS "staging_metric_facts_insert_all" ON public.staging_metric_facts;
DROP POLICY IF EXISTS "staging_metric_facts_select" ON public.staging_metric_facts;
DROP POLICY IF EXISTS "staging_metric_facts_insert" ON public.staging_metric_facts;

-- SELECT: authenticated users only (admins will use service role; this prevents anon reads)
DROP POLICY IF EXISTS "staging_metric_facts_select_authenticated" ON public.staging_metric_facts;
CREATE POLICY "staging_metric_facts_select_authenticated"
  ON public.staging_metric_facts FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: must be a member of the portfolio that owns the holding
DROP POLICY IF EXISTS "staging_metric_facts_insert_portfolio_member" ON public.staging_metric_facts;
CREATE POLICY "staging_metric_facts_insert_portfolio_member"
  ON public.staging_metric_facts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM holdings h
      JOIN portfolio_members pm ON pm.portfolio_id = h.portfolio_id
      WHERE h.id = staging_metric_facts.holding_id
        AND pm.user_id = auth.uid()
    )
  );
