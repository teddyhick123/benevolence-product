import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createAICredentialRepository } from '@/lib/api/repositories/ai-credentials';
import { createAISettingsRepository } from '@/lib/api/repositories/ai-settings';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { aiConnectionTestLimiter } from '@/lib/rate-limit';

type RouteParams = { params: Promise<{ orgId: string; connectionId: string }> };
const inFlight = new Set<string>();

export async function POST(_request: Request, { params }: RouteParams) {
  const { orgId, connectionId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;
  const actorId = access.context.principal.userId;
  const limit = await aiConnectionTestLimiter.limit(`${orgId}:${actorId}:${connectionId}`);
  if (!limit.success) return jsonError('Connection test limit reached', 429, { reset: limit.reset });
  const lockKey = `${orgId}:${connectionId}`;
  if (inFlight.has(lockKey)) return jsonError('A connection test is already running', 409);
  inFlight.add(lockKey);
  const settings = createAISettingsRepository(access.context);
  try {
    const response = await createAICredentialRepository({ orgId, actorId })
      .withCredential(connectionId, credential => fetch('https://openrouter.ai/api/v1/models', {
        headers: { authorization: `Bearer ${credential.apiKey}` },
        signal: AbortSignal.timeout(15_000),
        cache: 'no-store',
      }));
    if (!response.ok) {
      const invalidate = response.status === 401 || response.status === 403;
      await settings.recordConnectionTest(connectionId, { status: 'failed', invalidate });
      return jsonError(
        invalidate ? 'Connection authentication failed' : 'OpenRouter is temporarily unavailable',
        invalidate ? 400 : 503,
      );
    }
    const test = await settings.recordConnectionTest(connectionId, {
      status: 'succeeded',
      invalidate: false,
    });
    return jsonOk({ test });
  } catch {
    await settings.recordConnectionTest(connectionId, {
      status: 'failed',
      invalidate: false,
    }).catch(() => {});
    return jsonError('Connection test failed', 503);
  } finally {
    inFlight.delete(lockKey);
  }
}
