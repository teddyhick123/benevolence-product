import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isAccessDenied, requireUserAccess } from '@/lib/api/access';
import { createOnboardingRepository } from '@/lib/api/repositories/onboarding';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { MODULE_REGISTRY } from '@/lib/modules/registry';

export const runtime = 'nodejs';
export const maxDuration = 30;

const acceptSchema = z.object({
  sessionId: z.string().uuid(),
  accepted_modules: z.array(z.string()),
});

function enrich<T extends { module_id: keyof typeof MODULE_REGISTRY }>(items: T[] = []) {
  return items.map((item) => ({
    ...item,
    module: MODULE_REGISTRY[item.module_id],
  }));
}

/** GET /api/onboarding/recommendations — get or generate recommendations for one owned session. */
export async function GET(req: NextRequest) {
  const sessionId = new URL(req.url).searchParams.get('sessionId');
  if (!sessionId) return jsonError('sessionId required', 400);

  const access = await requireUserAccess();
  if (isAccessDenied(access)) return access.response;

  try {
    const repository = createOnboardingRepository(access.context.principal.userId);
    const session = await repository.resolveSession(sessionId);
    if (!session) return jsonError('Session not found', 404);

    const existing = await session.existingRecommendations();
    if (existing && existing.recommended_modules?.length > 0) {
      return jsonOk({
        recommendations: enrich(existing.recommended_modules),
        excluded: enrich(existing.excluded_modules || []),
        final_modules: existing.final_modules,
      });
    }

    const generated = await session.generateRecommendations();
    return jsonOk({
      recommendations: enrich(generated.recommendations),
      excluded: enrich(generated.excluded),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonError(message, 500);
  }
}

/** POST /api/onboarding/recommendations — finalize modules for one owned session. */
export async function POST(req: NextRequest) {
  const access = await requireUserAccess();
  if (isAccessDenied(access)) return access.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const validation = acceptSchema.safeParse(body);
  if (!validation.success) {
    return jsonError('Validation failed', 400, {
      details: validation.error.format(),
    });
  }

  const { sessionId, accepted_modules: acceptedModules } = validation.data;
  try {
    const repository = createOnboardingRepository(access.context.principal.userId);
    const session = await repository.resolveSession(sessionId);
    if (!session) return jsonError('Session not found', 404);

    const result = await session.finalizeRecommendations(acceptedModules);
    return jsonOk({
      success: true,
      final_modules: result.finalModules,
      user_added: result.userAdded,
      user_removed: result.userRemoved,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return jsonError(message, 500);
  }
}
