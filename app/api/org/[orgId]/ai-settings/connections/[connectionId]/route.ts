import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createAISettingsRepository } from '@/lib/api/repositories/ai-settings';
import { jsonError, jsonOk } from '@/lib/api/responses';

type RouteParams = { params: Promise<{ orgId: string; connectionId: string }> };

async function repository(params: RouteParams['params']) {
  const { orgId, connectionId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  return { orgId, connectionId, access };
}
export async function PATCH(request: Request, { params }: RouteParams) {
  const { connectionId, access } = await repository(params);
  if (isAccessDenied(access)) return access.response;
  try {
    const connection = await createAISettingsRepository(access.context)
      .updateConnection(connectionId, await request.json().catch(() => null));
    return jsonOk({ connection });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'AI connection could not be updated', 400);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const { connectionId, access } = await repository(params);
  if (isAccessDenied(access)) return access.response;
  try {
    await createAISettingsRepository(access.context).deleteConnection(connectionId);
    return jsonOk({ deleted: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'AI connection could not be deleted', 409);
  }
}
