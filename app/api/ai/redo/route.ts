import { NextRequest } from 'next/server';
import { isAccessDenied, requireUserAccess } from '@/lib/api/access';
import { resolveAiActionMutation } from '@/lib/api/repositories/ai-actions';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { aiRedoSchema } from '@/lib/schemas/ai';
import { aiLimiter } from '@/lib/rate-limit';
import { rateLimitExceeded } from '@/lib/rate-limit-response';

export const runtime = 'nodejs';

/**
 * POST /api/ai/redo
 * Redo a previously undone AI action.
 */
export async function POST(req: NextRequest) {
  const access = await requireUserAccess();
  if (isAccessDenied(access)) return access.response;

  const { success, reset, remaining, limit } = await aiLimiter.limit(access.context.user.id);
  if (!success) return rateLimitExceeded(reset, remaining, limit);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const validation = aiRedoSchema.safeParse(body);
  if (!validation.success) {
    return jsonError('Validation failed', 400, {
      details: validation.error.format(),
    });
  }

  const resolved = await resolveAiActionMutation(access.context.db, {
    actionId: validation.data.actionId,
  });
  if (!resolved.ok) return jsonError(resolved.error, resolved.status);

  try {
    const result = await resolved.repository.redo();
    return jsonOk({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Redo failed';
    return jsonError(message, 500);
  }
}
