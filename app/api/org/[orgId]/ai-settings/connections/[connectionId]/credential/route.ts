import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createAICredentialRepository } from '@/lib/api/repositories/ai-credentials';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { openRouterCredentialSchema } from '@/lib/schemas/ai-settings';

type RouteParams = { params: Promise<{ orgId: string; connectionId: string }> };

export async function PUT(request: Request, { params }: RouteParams) {
  const { orgId, connectionId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;
  const parsed = openRouterCredentialSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
  try {
    const credential = await createAICredentialRepository({
      orgId,
      actorId: access.context.principal.userId,
    }).setCredential(connectionId, parsed.data);
    return jsonOk({ credential });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'AI credential could not be rotated', 400);
  }
}
