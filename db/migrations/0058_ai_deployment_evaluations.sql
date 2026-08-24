-- =============================================================================
-- 0058_ai_deployment_evaluations.sql
-- Evaluation runs and per-case results behind deployment verification evidence.
-- Depends on: 0001, 0057
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.ai_deployment_evaluation_runs (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  deployment_id  uuid NOT NULL REFERENCES public.org_ai_deployments(id) ON DELETE CASCADE,
  requested_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  status         text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued','running','succeeded','failed')),
  -- Null on success. Runs that failed for a reason other than the model do not
  -- count against the organization's daily evaluation budget.
  failure_kind   text CHECK (failure_kind IN ('transport','internal')),
  suite_version  text NOT NULL CHECK (btrim(suite_version) <> ''),
  case_set_hash  text NOT NULL CHECK (btrim(case_set_hash) <> ''),
  workload_ids   text[] NOT NULL CHECK (cardinality(workload_ids) > 0),
  error          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  started_at     timestamptz,
  finished_at    timestamptz,
  CONSTRAINT ai_deployment_evaluation_runs_failure_kind_requires_failed
    CHECK (failure_kind IS NULL OR status = 'failed')
);

-- One live run per deployment: concurrent runs would interleave writes into
-- org_ai_deployments.verified_workloads.
CREATE UNIQUE INDEX IF NOT EXISTS ai_deployment_evaluation_runs_one_live
  ON public.ai_deployment_evaluation_runs (deployment_id)
  WHERE status IN ('queued','running');

CREATE INDEX IF NOT EXISTS ai_deployment_evaluation_runs_deployment_created
  ON public.ai_deployment_evaluation_runs (deployment_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.ai_deployment_evaluation_results (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id       uuid NOT NULL REFERENCES public.ai_deployment_evaluation_runs(id) ON DELETE CASCADE,
  workload_id  text NOT NULL CHECK (btrim(workload_id) <> ''),
  case_id      text NOT NULL CHECK (btrim(case_id) <> ''),
  required     boolean NOT NULL,
  passed       boolean NOT NULL,
  detail       text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, workload_id, case_id)
);

CREATE INDEX IF NOT EXISTS ai_deployment_evaluation_results_run
  ON public.ai_deployment_evaluation_results (run_id);

ALTER TABLE public.ai_deployment_evaluation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_deployment_evaluation_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ai_deployment_evaluation_runs_admin_read"
  ON public.ai_deployment_evaluation_runs
  FOR SELECT TO authenticated USING (public.is_org_admin(org_id));
CREATE POLICY "ai_deployment_evaluation_runs_service"
  ON public.ai_deployment_evaluation_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "ai_deployment_evaluation_results_admin_read"
  ON public.ai_deployment_evaluation_results
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ai_deployment_evaluation_runs runs
    WHERE runs.id = run_id AND public.is_org_admin(runs.org_id)
  ));
CREATE POLICY "ai_deployment_evaluation_results_service"
  ON public.ai_deployment_evaluation_results
  FOR ALL TO service_role USING (true) WITH CHECK (true);

GRANT SELECT ON public.ai_deployment_evaluation_runs TO authenticated;
GRANT SELECT ON public.ai_deployment_evaluation_results TO authenticated;
GRANT ALL ON public.ai_deployment_evaluation_runs TO service_role;
GRANT ALL ON public.ai_deployment_evaluation_results TO service_role;
