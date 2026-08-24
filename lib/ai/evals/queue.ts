// lib/ai/evals/queue.ts
// BullMQ queue and worker for deployment evaluation. This is the only module
// under lib/ai/evals that performs I/O; everything else stays pure so the
// suite can be tested without a network, keys, or Redis.

import { Queue, Worker, type Job } from 'bullmq';
import { randomUUID } from 'node:crypto';
import type { AIConnector, AIExecutionPlan, AIInvocationRecord } from '@/lib/ai/execution';
import { AIExecutionError } from '@/lib/ai/execution';
import type { AIWorkloadId } from '@/lib/ai/workloads';
import { resolveAIExecution } from '@/lib/ai/resolver';
import { getAIDeploymentTemplate } from '@/lib/ai/catalog';
import { createAIConnector, type AIConnectorFactoryContext } from '@/lib/ai/connectors/registry';
import { createAICredentialRepository } from '@/lib/api/repositories/ai-credentials';
import { createAIInvocationRecorder } from '@/lib/api/repositories/ai-invocations';
import { createAISettingsRepository } from '@/lib/api/repositories/ai-settings';
import { createAIEvaluationRepository } from '@/lib/api/repositories/ai-evaluations';
import { runWorkloadEvaluation } from '@/lib/ai/evals/runner';
import { SUITE_VERSION } from '@/lib/ai/evals/version';
import { EvalTransportError, type CaseResult } from '@/lib/ai/evals/types';
import { openRouterProviderPreferencesSchema } from '@/lib/schemas/ai-settings';

const redisConnection = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
};

export const evaluationQueue = new Queue('ai-evaluation-jobs', {
  connection: redisConnection,
});

export type EvaluationJobData = {
  runId: string;
  orgId: string;
  deploymentId: string;
  actorId: string;
  workloadIds: AIWorkloadId[];
};

export type EvaluationJobDeps = {
  claimRun: (_runId: string) => Promise<boolean>;
  recordCaseResult: (_runId: string, _workloadId: AIWorkloadId, _result: CaseResult) => Promise<void>;
  finishRun: (_runId: string, _input: {
    status: 'succeeded' | 'failed';
    failureKind?: 'transport' | 'internal';
    error?: string;
  }) => Promise<void>;
  recordEvidence: (_deploymentId: string, _workloadId: AIWorkloadId, _evidence: {
    evalSuiteVersion: string;
    verifiedAt: string;
    result: 'passed' | 'conditional';
  }) => Promise<void>;
  recordUsage: (_record: AIInvocationRecord) => Promise<void>;
  resolvePlan: (_workloadId: AIWorkloadId) => Promise<AIExecutionPlan>;
  buildConnector: () => Promise<AIConnector>;
};

export async function enqueueEvaluationRun(data: EvaluationJobData): Promise<string> {
  const job = await evaluationQueue.add('evaluate-deployment', data, {
    // No retries: a retried run would re-spend the organization's credit on
    // model calls it already paid for.
    attempts: 1,
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  });
  return job.id ?? '';
}

function isTransportFailure(error: unknown): boolean {
  return error instanceof EvalTransportError
    || error instanceof AIExecutionError
    // Connector construction failures are credential or connectivity problems,
    // never a finding about the model.
    || (error instanceof Error && /connect|network|fetch|refused|timeout/i.test(error.message));
}

function usageRecordFor(
  data: EvaluationJobData,
  plan: AIExecutionPlan,
  workloadId: AIWorkloadId,
  startedAt: number,
): AIInvocationRecord {
  const completed = Date.now();
  return {
    id: randomUUID(),
    workloadId,
    operation: plan.operation,
    scope: { kind: 'organization', orgId: data.orgId, actorId: data.actorId },
    connector: plan.connector,
    deploymentId: data.deploymentId,
    connectionId: plan.connectionId,
    modelVendor: plan.modelVendor,
    requestedModel: plan.requestedModel,
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date(completed).toISOString(),
    latencyMs: completed - startedAt,
    status: 'succeeded',
    targetPosition: plan.targetPosition ?? 0,
    policy: { source: 'deployment_evaluation', suiteVersion: SUITE_VERSION },
    policyHash: SUITE_VERSION,
  };
}

export async function runEvaluationJob(
  data: EvaluationJobData,
  deps: EvaluationJobDeps,
): Promise<void> {
  // At-most-once: the conditional update is the claim, matching the
  // begin_ai_turn discipline used for assistant turns.
  if (!await deps.claimRun(data.runId)) return;

  try {
    for (const workloadId of data.workloadIds) {
      const plan = await deps.resolvePlan(workloadId);
      const connector = await deps.buildConnector();
      const startedAt = Date.now();

      const verdict = await runWorkloadEvaluation(
        connector,
        plan,
        workloadId,
        result => deps.recordCaseResult(data.runId, workloadId, result),
      );

      // Evaluation spend must be attributable, or this repeats finding F6.
      await deps.recordUsage(usageRecordFor(data, plan, workloadId, startedAt));

      if (verdict.verdict !== 'blocked') {
        await deps.recordEvidence(data.deploymentId, workloadId, {
          evalSuiteVersion: SUITE_VERSION,
          verifiedAt: new Date().toISOString(),
          result: verdict.verdict,
        });
      }
    }
    await deps.finishRun(data.runId, { status: 'succeeded' });
  } catch (error) {
    // Evidence already written for completed workloads stays valid: each
    // workload's verdict is independently meaningful.
    await deps.finishRun(data.runId, {
      status: 'failed',
      failureKind: isTransportFailure(error) ? 'transport' : 'internal',
      error: error instanceof Error ? error.message : 'Evaluation failed',
    });
  }
}

function jobDependencies(data: EvaluationJobData): EvaluationJobDeps {
  const context = {
    orgId: data.orgId,
    role: 'owner' as const,
    principal: { kind: 'job' as const, job: 'ai-evaluation' },
  };
  const evaluations = createAIEvaluationRepository(context as never);
  const settings = createAISettingsRepository(context as never);
  const credentials = createAICredentialRepository({ orgId: data.orgId, actorId: data.actorId });
  const recorder = createAIInvocationRecorder();

  return {
    claimRun: runId => evaluations.claimRun(runId),
    recordCaseResult: (runId, workloadId, result) =>
      evaluations.recordCaseResult(runId, workloadId, result),
    finishRun: (runId, input) => evaluations.finishRun(runId, input),
    recordEvidence: (deploymentId, workloadId, evidence) =>
      settings.recordDeploymentEvaluation(deploymentId, workloadId, evidence).then(() => undefined),
    recordUsage: record => recorder(record),
    async resolvePlan(workloadId) {
      const { deployment, connection } = await settings.getDeploymentForEvaluation(data.deploymentId);
      if (!deployment.catalog_template_id) throw new Error('Deployment has no catalog template');
      const template = getAIDeploymentTemplate(deployment.catalog_template_id);
      const base = resolveAIExecution({ kind: 'organization', orgId: data.orgId }, workloadId);
      const providerPreferences = connection.connector === 'openrouter'
        ? openRouterProviderPreferencesSchema.parse(
          ((connection.config as Record<string, unknown>).provider as Record<string, unknown>) ?? {},
        )
        : undefined;
      return Object.freeze({
        ...base,
        connector: connection.connector as typeof base.connector,
        requestedModel: deployment.provider_model_id,
        connectionId: connection.id,
        deploymentId: deployment.id,
        modelVendor: template.modelVendor,
        ...(providerPreferences ? { providerPreferences } : {}),
      });
    },
    async buildConnector() {
      const { connection } = await settings.getDeploymentForEvaluation(data.deploymentId);
      return credentials.withCredential(connection.id, (credential) => {
        const context: AIConnectorFactoryContext = connection.connector === 'openrouter'
          ? {
            openrouter: {
              apiKey: credential.apiKey,
              provider: openRouterProviderPreferencesSchema.parse(
                ((connection.config as Record<string, unknown>).provider as Record<string, unknown>) ?? {},
              ),
            },
          }
          : connection.connector === 'anthropic'
            ? { anthropic: { apiKey: credential.apiKey } }
            : { openai: { apiKey: credential.apiKey } };
        return createAIConnector(connection.connector as never, context);
      });
    },
  };
}

export function createEvaluationWorker(): Worker {
  const worker = new Worker(
    'ai-evaluation-jobs',
    async (job: Job<EvaluationJobData>) => {
      await runEvaluationJob(job.data, jobDependencies(job.data));
    },
    { connection: redisConnection, concurrency: 1 },
  );

  worker.on('failed', (job, error) => {
    console.error(`[evaluation-worker] Job ${job?.id} failed:`, error.message);
  });
  worker.on('completed', (job) => {
    console.log(`[evaluation-worker] Job ${job.id} completed`);
  });

  return worker;
}
