import { NextRequest } from 'next/server';
import {
  isAccessDenied,
  requirePortfolioAccess,
  requireUserAccess,
} from '@/lib/api/access';
import {
  createAiActionHistoryRepository,
  resolveAiActionMutation,
} from '@/lib/api/repositories/ai-actions';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { aiUndoSchema } from '@/lib/schemas/ai';
import { aiLimiter } from '@/lib/api/rate-limit';
import { rateLimitExceeded } from '@/lib/api/rate-limit-response';

export const runtime = 'nodejs';

/**
 * POST /api/ai/undo
 * Undo an AI action or batch of actions.
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

  const validation = aiUndoSchema.safeParse(body);
  if (!validation.success) {
    return jsonError('Validation failed', 400, {
      details: validation.error.format(),
    });
  }

  const { actionId, batchId } = validation.data;
  const resolved = await resolveAiActionMutation(
    access.context.db,
    batchId ? { batchId } : { actionId: actionId! }
  );
  if (!resolved.ok) return jsonError(resolved.error, resolved.status);

  try {
    const result = await resolved.repository.undo();
    return jsonOk({ success: true, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Undo failed';
    return jsonError(message, 500);
  }
}

/**
 * GET /api/ai/undo?portfolioId=xxx&limit=10
 * Get undo history for a portfolio.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const portfolioId = searchParams.get('portfolioId');
  const limit = parseInt(searchParams.get('limit') || '20');

  if (!portfolioId) return jsonError('portfolioId required', 400);

  const access = await requirePortfolioAccess(portfolioId, 'viewer');
  if (isAccessDenied(access)) return access.response;

  try {
    const repository = createAiActionHistoryRepository(access.context.db, portfolioId);
    const actions = await repository.list(limit);
    return jsonOk({ actions });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to get undo history';
    return jsonError(message, 500);
  }
}
