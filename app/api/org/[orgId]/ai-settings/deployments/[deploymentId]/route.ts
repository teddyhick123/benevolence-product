import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createAISettingsRepository } from '@/lib/api/repositories/ai-settings';
import { jsonError, jsonOk } from '@/lib/api/responses';

type RouteParams = { params: Promise<{ orgId: string; deploymentId: string }> };

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { orgId, deploymentId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;
  try {
    await createAISettingsRepository(access.context).deleteDeployment(deploymentId);
    return jsonOk({ deleted: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'AI deployment could not be deleted', 409);
  }
}
