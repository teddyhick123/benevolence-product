import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createAISettingsRepository } from '@/lib/api/repositories/ai-settings';
import { jsonError, jsonOk } from '@/lib/api/responses';

type RouteParams = { params: Promise<{ orgId: string }> };

export async function PUT(request: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;
  try {
    const route = await createAISettingsRepository(access.context)
      .replaceRoute(await request.json().catch(() => null));
    return jsonOk({ route });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'AI route could not be replaced', 400);
  }
}
