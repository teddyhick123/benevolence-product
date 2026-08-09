import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createAICredentialRepository } from '@/lib/api/repositories/ai-credentials';
import { createAISettingsRepository } from '@/lib/api/repositories/ai-settings';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { aiConnectionCreateSchema } from '@/lib/schemas/ai-settings';

type RouteParams = { params: Promise<{ orgId: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;
  const parsed = aiConnectionCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
  const settings = createAISettingsRepository(access.context);
  const credentials = createAICredentialRepository({
    orgId,
    actorId: access.context.principal.userId,
  });
  let connectionId: string | null = null;
  try {
    const { credential, ...metadata } = parsed.data;
    const connection = await settings.createConnection(metadata);
    connectionId = connection.id;
    const credentialState = await credentials.setCredential(connection.id, credential);
    return jsonOk({ connection: { ...connection, credential: credentialState } }, { status: 201 });
  } catch (error) {
    if (connectionId) await settings.deleteConnection(connectionId).catch(() => {});
    return jsonError(error instanceof Error ? error.message : 'AI connection could not be created', 400);
  }
}
