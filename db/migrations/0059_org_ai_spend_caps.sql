-- =============================================================================
-- 0059_org_ai_spend_caps.sql
-- Per-organization ceilings on platform-funded AI spend, plus the single
-- definition of that spend used by enforcement and reporting alike.
-- Depends on: 0001, 0030
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.org_ai_spend_caps (
  org_id              uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Null means uncapped. Written only through the app-admin route.
  platform_limit_usd  numeric CHECK (platform_limit_usd IS NULL OR platform_limit_usd >= 0),
  -- An organization's self-imposed limit, never above the platform's.
  org_limit_usd       numeric CHECK (org_limit_usd IS NULL OR org_limit_usd >= 0),
  warn_at_percent     integer NOT NULL DEFAULT 80
                        CHECK (warn_at_percent BETWEEN 1 AND 100),
  on_limit            text NOT NULL DEFAULT 'hard_stop'
                        CHECK (on_limit IN ('hard_stop','read_only','own_key')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT org_ai_spend_caps_org_limit_within_platform
    CHECK (org_limit_usd IS NULL
           OR platform_limit_usd IS NULL
           OR org_limit_usd <= platform_limit_usd)
);

ALTER TABLE public.org_ai_spend_caps ENABLE ROW LEVEL SECURITY;

-- Read-only for org admins: the authority split between the platform ceiling
-- and the organization's own limit lives in the route guards, which RLS
-- cannot express per column.
CREATE POLICY "org_ai_spend_caps_admin_read" ON public.org_ai_spend_caps
  FOR SELECT TO authenticated USING (public.is_org_admin(org_id));
CREATE POLICY "org_ai_spend_caps_service" ON public.org_ai_spend_caps
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.org_ai_spend_caps TO authenticated;
GRANT ALL ON public.org_ai_spend_caps TO service_role;

-- ---------------------------------------------------------------------------
-- The single definition of platform-funded spend.
--
-- Only rows with no deployment_id count: an organization routing a workload to
-- its own deployment is spending its own money, and capping that would
-- throttle something the platform does not pay for.
--
-- Cost precedence matches resolveCost in lib/api/repositories/ai-invocations.ts.
-- If the two disagreed, the cap and the row it read would disagree about the
-- same call.
--
-- Unpriced rows contribute zero, so a platform-default model shipping without
-- a rate under-counts spend. The rate coverage guard added in Phase 3A is what
-- prevents that, and is therefore load-bearing for cap correctness.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_platform_spend(
  p_org_id       uuid,
  p_period_start timestamptz
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(COALESCE(reported_cost, computed_cost)), 0)::numeric
  FROM public.ai_usage_log
  WHERE org_id = p_org_id
    AND deployment_id IS NULL
    AND created_at >= p_period_start;
$$;

REVOKE ALL ON FUNCTION public.org_platform_spend(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_platform_spend(uuid, timestamptz) TO service_role;

CREATE INDEX IF NOT EXISTS ai_usage_log_org_platform_spend_idx
  ON public.ai_usage_log(org_id, created_at DESC)
  WHERE deployment_id IS NULL;

-- ---------------------------------------------------------------------------
-- The dashboard's aggregate. Its platform_cost must equal org_platform_spend
-- for the same period; a behavioural test asserts that, because a dashboard
-- reading 80% while the cap fires destroys trust in both numbers.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_ai_usage_report(
  p_org_id       uuid,
  p_period_start timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH usage_rows AS (
    SELECT
      workload_id,
      status,
      deployment_id IS NULL AS platform_funded,
      COALESCE(reported_cost, computed_cost, 0) AS cost,
      date_trunc('day', created_at) AS day
    FROM public.ai_usage_log
    WHERE org_id = p_org_id
      AND created_at >= p_period_start
  )
  SELECT jsonb_build_object(
    'period_start', p_period_start,
    'platform_cost', COALESCE((SELECT SUM(cost) FROM usage_rows WHERE platform_funded), 0),
    'org_cost',      COALESCE((SELECT SUM(cost) FROM usage_rows WHERE NOT platform_funded), 0),
    'invocations',        (SELECT COUNT(*) FROM usage_rows),
    'failed_invocations', (SELECT COUNT(*) FROM usage_rows WHERE status <> 'succeeded'),
    -- Platform-funded only: this breakdown exists to explain the capped
    -- number, and mixing funding sources would make it sum to nothing.
    'by_workload', COALESCE((
      SELECT jsonb_agg(entry ORDER BY entry->>'workload_id')
      FROM (
        SELECT jsonb_build_object(
                 'workload_id', workload_id,
                 'funding', 'platform',
                 'cost', SUM(cost),
                 'invocations', COUNT(*)
               ) AS entry
        FROM usage_rows
        WHERE platform_funded
        GROUP BY workload_id
      ) grouped
    ), '[]'::jsonb),
    'daily', COALESCE((
      SELECT jsonb_agg(entry ORDER BY entry->>'day')
      FROM (
        SELECT jsonb_build_object(
                 'day', day,
                 -- COALESCE so a day with only one funding source renders as
                 -- zero rather than a gap in the chart.
                 'platform_cost', COALESCE(SUM(cost) FILTER (WHERE platform_funded), 0),
                 'org_cost',      COALESCE(SUM(cost) FILTER (WHERE NOT platform_funded), 0)
               ) AS entry
        FROM usage_rows
        GROUP BY day
      ) series
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.org_ai_usage_report(uuid, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.org_ai_usage_report(uuid, timestamptz) TO service_role;
