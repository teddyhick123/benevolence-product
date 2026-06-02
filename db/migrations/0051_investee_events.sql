-- Migration: Investee Events Table
-- Description: Creates the events table for investee-level news and milestone events.
--              Timeline route already queries this table; without the migration, all
--              events queries fail silently. RLS scopes rows to users who can view
--              at least one portfolio that holds the investee, preventing cross-org
--              data exposure (Vis-B3).
-- Date: 2026-06-02

CREATE TABLE IF NOT EXISTS public.events (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at   timestamptz NOT NULL DEFAULT now(),

  investee_id  uuid        REFERENCES public.investees(id) ON DELETE CASCADE,
  org_id       uuid        REFERENCES public.organizations(id) ON DELETE CASCADE,

  event_date   date        NOT NULL,
  headline     text        NOT NULL,
  source_link  text,
  severity     text        NOT NULL DEFAULT 'normal'
               CHECK (severity IN ('low', 'normal', 'high', 'critical')),
  event_type   text        CHECK (event_type IN (
                              'news', 'filing', 'leadership', 'financial',
                              'legal', 'milestone', 'other'
                            )),
  summary      text
);

CREATE INDEX IF NOT EXISTS idx_events_investee_id ON public.events (investee_id);
CREATE INDEX IF NOT EXISTS idx_events_org_id      ON public.events (org_id);
CREATE INDEX IF NOT EXISTS idx_events_event_date  ON public.events (event_date DESC);

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Read: only if the caller can view a portfolio that holds this investee.
-- This ensures events never leak across org boundaries even when the same
-- investee_id is referenced by holdings in multiple orgs.
CREATE POLICY "events: view if holds investee in accessible portfolio"
  ON public.events FOR SELECT TO authenticated
  USING (
    org_id IS NULL
    OR public.can_view_org(org_id)
    OR EXISTS (
      SELECT 1
      FROM public.holdings h
      WHERE h.investee_id = events.investee_id
        AND public.can_view_portfolio(h.portfolio_id)
    )
  );

CREATE POLICY "events: service role full access"
  ON public.events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.events TO authenticated;
GRANT ALL ON public.events TO service_role;
