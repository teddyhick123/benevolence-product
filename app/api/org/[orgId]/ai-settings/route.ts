import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createAISettingsRepository } from '@/lib/api/repositories/ai-settings';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';
type RouteParams = { params: Promise<{ orgId: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;
  try {
    return jsonOk(await createAISettingsRepository(access.context).getSettings());
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'AI settings could not be loaded', 500);
  }
}
