import { NextRequest } from 'next/server';
import { isAccessDenied, requireUserAccess } from '@/lib/api/access';
import { createOnboardingRepository } from '@/lib/api/repositories/onboarding';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';

/** GET /api/onboarding/session — get the signed-in user's latest session. */
export async function GET(_req: NextRequest) {
  const access = await requireUserAccess();
  if (isAccessDenied(access)) return access.response;

  try {
    const repository = createOnboardingRepository(access.context.principal.userId);
    const session = await repository.latestSession();
    return jsonOk({
      session,
      hasCompletedOnboarding: session?.status === 'completed',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonError(message, 500);
  }
}

/** POST /api/onboarding/session — create or resume the signed-in user's session. */
export async function POST(_req: NextRequest) {
  const access = await requireUserAccess();
  if (isAccessDenied(access)) return access.response;

  try {
    const repository = createOnboardingRepository(access.context.principal.userId);
    const session = await repository.getOrCreateSession();
    return jsonOk({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonError(message, 500);
  }
}
