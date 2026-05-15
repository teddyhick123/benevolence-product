-- db/migrations/0042_task_automation_runs.sql
-- Task automation run log and advisory lock helper.
-- Depends on: 0001, 0002, 0041
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.task_automation_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  producer        text,
  org_id          uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  dry_run         boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'running'
                  CHECK (status IN ('running', 'completed', 'failed')),
  scanned         int NOT NULL DEFAULT 0,
  created_count   int NOT NULL DEFAULT 0,
  updated_count   int NOT NULL DEFAULT 0,
  completed_count int NOT NULL DEFAULT 0,
  skipped_count   int NOT NULL DEFAULT 0,
  error_count     int NOT NULL DEFAULT 0,
  metadata        jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_task_automation_runs_created
  ON public.task_automation_runs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_task_automation_runs_producer_org_running
  ON public.task_automation_runs (producer, org_id, created_at DESC)
  WHERE status = 'running';

ALTER TABLE public.task_automation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "task_automation_runs: org admins read"
  ON public.task_automation_runs FOR SELECT TO authenticated
  USING (org_id IS NULL OR public.is_org_admin(org_id));

CREATE POLICY "task_automation_runs: service role"
  ON public.task_automation_runs FOR ALL TO service_role
  USING (true) WITH CHECK (true);

GRANT SELECT ON public.task_automation_runs TO authenticated;
GRANT ALL    ON public.task_automation_runs TO service_role;

-- Advisory lock helper. Note: pg_try_advisory_xact_lock is transaction-scoped;
-- in Supabase's pooled connections each RPC call is its own transaction, so this
-- releases immediately. Use task_automation_runs status check as the primary
-- concurrency gate; this function is an additional best-effort signal.
CREATE OR REPLACE FUNCTION public.try_task_automation_lock(lock_key text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN pg_try_advisory_xact_lock(hashtext(lock_key)::bigint);
END;
$$;

GRANT EXECUTE ON FUNCTION public.try_task_automation_lock(text) TO service_role;
