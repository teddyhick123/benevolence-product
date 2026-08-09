import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createAISettingsRepository } from '@/lib/api/repositories/ai-settings';
import { jsonError, jsonOk } from '@/lib/api/responses';

type RouteParams = { params: Promise<{ orgId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;
  try {
    const deployment = await createAISettingsRepository(access.context)
      .createDeployment(await request.json().catch(() => null));
    return jsonOk({ deployment }, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'AI deployment could not be created', 400);
  }
}
