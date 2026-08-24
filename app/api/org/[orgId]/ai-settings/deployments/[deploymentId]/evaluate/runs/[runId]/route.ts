import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createAIEvaluationRepository } from '@/lib/api/repositories/ai-evaluations';
import { jsonError, jsonOk } from '@/lib/api/responses';

type RouteParams = { params: Promise<{ orgId: string; deploymentId: string; runId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { orgId, deploymentId, runId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;
  try {
    const { run, results } = await createAIEvaluationRepository(access.context).getRun(runId);
    // The run id is a routing input, never authority: confirm it belongs to
    // the deployment named in the path before returning anything.
    if (run.deployment_id !== deploymentId) return jsonError('Evaluation run not found', 404);
    return jsonOk({ run, results });
  } catch {
    return jsonError('Evaluation run not found', 404);
  }
}
