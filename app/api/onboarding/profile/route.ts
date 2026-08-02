import { NextRequest } from 'next/server';
import { isAccessDenied, requireUserAccess } from '@/lib/api/access';
import { createOnboardingRepository } from '@/lib/api/repositories/onboarding';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';

/** GET /api/onboarding/profile?sessionId=xxx — get one owned session profile. */
export async function GET(req: NextRequest) {
  const sessionId = new URL(req.url).searchParams.get('sessionId');
  if (!sessionId) return jsonError('sessionId required', 400);

  const access = await requireUserAccess();
  if (isAccessDenied(access)) return access.response;

  try {
    const repository = createOnboardingRepository(access.context.principal.userId);
    const session = await repository.resolveSession(sessionId);
    if (!session) return jsonError('Session not found', 404);

    const profile = await session.profile();
    return jsonOk({
      profile,
      quick_intake: session.scope.quickIntake,
      conversation_state: session.scope.conversationState,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonError(message, 500);
  }
}
