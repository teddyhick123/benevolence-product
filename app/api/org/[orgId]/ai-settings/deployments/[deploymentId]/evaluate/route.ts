import { z } from 'zod';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createAISettingsRepository } from '@/lib/api/repositories/ai-settings';
import { createAIEvaluationRepository } from '@/lib/api/repositories/ai-evaluations';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { aiWorkloadIdSchema } from '@/lib/schemas/ai-settings';
import { getAIDeploymentTemplate, type VerifiedDeploymentTemplate } from '@/lib/ai/catalog';
import { AI_WORKLOADS, type AIWorkloadId } from '@/lib/ai/workloads';
import { enqueueEvaluationRun } from '@/lib/ai/evals/queue';
import { SUITE_VERSION, caseSetHash } from '@/lib/ai/evals/version';

type RouteParams = { params: Promise<{ orgId: string; deploymentId: string }> };

const inputSchema = z.object({
  workloadIds: z.array(aiWorkloadIdSchema).min(1).max(9).optional(),
}).strict();

/**
 * Only workloads the template can actually serve. This is what keeps
 * transcription out of the list for a text-only template rather than
 * recording a failure for a capability the deployment never claimed.
 */
function defaultWorkloadsFor(template: VerifiedDeploymentTemplate): AIWorkloadId[] {
  return (Object.keys(AI_WORKLOADS) as AIWorkloadId[]).filter(workloadId =>
    AI_WORKLOADS[workloadId].requiredCapabilities.every(capability =>
      template.advertisedCapabilities.includes(capability)));
}

export async function POST(request: Request, { params }: RouteParams) {
  const { orgId, deploymentId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
  const actorId = access.context.principal.userId;
  const settings = createAISettingsRepository(access.context);

  try {
    const { deployment, connection } = await settings.getDeploymentForEvaluation(deploymentId);
    if (deployment.status !== 'active' || connection.status !== 'active') {
      return jsonError('Deployment and connection must be active', 409);
    }
    if (!deployment.catalog_template_id) {
      return jsonError('Deployment has no catalog template and cannot be evaluated', 400);
    }
    const template = getAIDeploymentTemplate(deployment.catalog_template_id);
    const requested = parsed.data.workloadIds ?? defaultWorkloadsFor(template);
    if (requested.length === 0) {
      return jsonError('Deployment supports no evaluable workloads', 400);
    }
    const unsupported = requested.filter(workloadId =>
      !AI_WORKLOADS[workloadId].requiredCapabilities.every(capability =>
        template.advertisedCapabilities.includes(capability)));
    if (unsupported.length > 0) {
      return jsonError(`Deployment cannot serve: ${unsupported.join(', ')}`, 400);
    }

    const evaluations = createAIEvaluationRepository(access.context);
    if (await evaluations.countableRunsInLastDay(deploymentId) >= evaluations.dailyRunLimit) {
      return jsonError('Deployment evaluation limit reached for today', 429);
    }

    const run = await evaluations.createRun({
      deploymentId,
      workloadIds: requested,
      suiteVersion: SUITE_VERSION,
      caseSetHash: caseSetHash(),
    });
    await enqueueEvaluationRun({
      runId: run.id,
      orgId,
      deploymentId,
      actorId,
      workloadIds: requested,
    });
    return jsonOk({ runId: run.id }, { status: 202 });
  } catch (error) {
    // The one-live-run partial index surfaces as a unique violation.
    const message = error instanceof Error ? error.message : '';
    if (/duplicate key|unique/i.test(message)) {
      return jsonError('An evaluation is already running for this deployment', 409);
    }
    return jsonError('Evaluation could not be started', 502);
  }
}
