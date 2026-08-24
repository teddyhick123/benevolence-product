import { createElevatedClient, type ElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';
import { canManageWorkspace } from '@/lib/organizations/roles';
import type { AIWorkloadId } from '@/lib/ai/workloads';
import type { CaseResult } from '@/lib/ai/evals/types';

type AIEvaluationScope = Pick<OrgAccessContext, 'orgId' | 'role' | 'principal'>;

type AIEvaluationDependencies = {
  db?: ElevatedClient;
  now?: () => Date;
};

/** Runs that failed for a reason other than the model do not consume budget. */
const DAILY_RUN_LIMIT = 3;

export function createAIEvaluationRepository(
  scope: AIEvaluationScope,
  dependencies: AIEvaluationDependencies = {},
) {
  if (!canManageWorkspace(scope.role)) {
    throw new Error('Organization administrator access is required');
  }
  const actorId = scope.principal.userId;
  const db = dependencies.db ?? createElevatedClient();
  const now = dependencies.now ?? (() => new Date());

  return {
    dailyRunLimit: DAILY_RUN_LIMIT,

    async createRun(input: {
      deploymentId: string;
      workloadIds: AIWorkloadId[];
      suiteVersion: string;
      caseSetHash: string;
    }) {
      const { data, error } = await db.from('ai_deployment_evaluation_runs').insert({
        org_id: scope.orgId,
        deployment_id: input.deploymentId,
        requested_by: actorId,
        status: 'queued',
        suite_version: input.suiteVersion,
        case_set_hash: input.caseSetHash,
        workload_ids: input.workloadIds,
      }).select('id').single();
      if (error) throw error;
      return { id: data.id };
    },

    /**
     * The conditional update is the claim: only one worker can move a run out
     * of 'queued', which makes execution at-most-once the way begin_ai_turn
     * does for assistant turns.
     */
    async claimRun(runId: string): Promise<boolean> {
      const { data, error } = await db.from('ai_deployment_evaluation_runs')
        .update({ status: 'running', started_at: now().toISOString() })
        .eq('id', runId)
        .eq('status', 'queued')
        .select('id')
        .maybeSingle();
      if (error) throw error;
      return data !== null;
    },

    async recordCaseResult(runId: string, workloadId: AIWorkloadId, result: CaseResult) {
      const { error } = await db.from('ai_deployment_evaluation_results').upsert({
        run_id: runId,
        workload_id: workloadId,
        case_id: result.caseId,
        required: result.required,
        passed: result.passed,
        detail: result.detail,
      }, { onConflict: 'run_id,workload_id,case_id' });
      if (error) throw error;
    },

    async finishRun(runId: string, input: {
      status: 'succeeded' | 'failed';
      failureKind?: 'transport' | 'internal';
      error?: string;
    }) {
      const { error } = await db.from('ai_deployment_evaluation_runs')
        .update({
          status: input.status,
          failure_kind: input.failureKind ?? null,
          error: input.error ?? null,
          finished_at: now().toISOString(),
        })
        .eq('id', runId)
        .eq('org_id', scope.orgId);
      if (error) throw error;
    },

    /**
     * Counts only runs that actually exercised the model, so neither a
     * provider outage nor a worker crash locks an admin out for a day.
     */
    async countableRunsInLastDay(deploymentId: string): Promise<number> {
      const since = new Date(now().getTime() - 24 * 60 * 60 * 1000).toISOString();
      const { count, error } = await db.from('ai_deployment_evaluation_runs')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', scope.orgId)
        .eq('deployment_id', deploymentId)
        .gte('created_at', since)
        .is('failure_kind', null);
      if (error) throw error;
      return count ?? 0;
    },

    async getRun(runId: string) {
      const { data: run, error } = await db.from('ai_deployment_evaluation_runs')
        .select('*')
        .eq('id', runId)
        .eq('org_id', scope.orgId)
        .maybeSingle();
      if (error) throw error;
      if (!run) throw new Error('Evaluation run not found');

      const { data: results, error: resultsError } = await db
        .from('ai_deployment_evaluation_results')
        .select('*')
        .eq('run_id', runId)
        .order('created_at', { ascending: true });
      if (resultsError) throw resultsError;
      return { run, results: results ?? [] };
    },

    async latestRun(deploymentId: string) {
      const { data, error } = await db.from('ai_deployment_evaluation_runs')
        .select('*')
        .eq('org_id', scope.orgId)
        .eq('deployment_id', deploymentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  };
}

export type AIEvaluationRepository = ReturnType<typeof createAIEvaluationRepository>;
