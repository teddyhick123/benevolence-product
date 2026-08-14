import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isAccessDenied, requireUserAccess } from '@/lib/api/access';
import {
  createOnboardingRepository,
  OnboardingTurnRepositoryError,
} from '@/lib/api/repositories/onboarding';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const runtime = 'nodejs';
export const maxDuration = 60;

const chatSchema = z.object({
  sessionId: z.string().uuid(),
  requestId: z.string().uuid().optional(),
  message: z.string().min(1).max(5000),
});

/** POST /api/onboarding/chat — send a message in one owned onboarding session. */
export async function POST(req: NextRequest) {
  const access = await requireUserAccess();
  if (isAccessDenied(access)) return access.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError('Invalid JSON body', 400);
  }

  const validation = chatSchema.safeParse(body);
  if (!validation.success) {
    return jsonError('Validation failed', 400, {
      details: validation.error.format(),
    });
  }

  const { sessionId, message } = validation.data;
  const requestId = validation.data.requestId ?? crypto.randomUUID();
  try {
    const repository = createOnboardingRepository(access.context.principal.userId);
    const session = await repository.resolveSession(sessionId);
    if (!session) return jsonError('Session not found', 404);
    if (session.scope.status !== 'conversation') {
      return jsonError('Session not in conversation state', 400);
    }

    const turn = await session.beginChatTurn(requestId, message);
    if (turn.state === 'completed') return jsonOk(turn.response);
    if (turn.state !== 'started') {
      return jsonError(turn.failureMessage ?? `Onboarding turn is ${turn.state.replace('_', ' ')}`, 409, {
        requestId, turnId: turn.turnId, state: turn.state,
      });
    }
    try {
      return jsonOk(await session.chat(turn.turnId, message, turn.history));
    } catch (error) {
      await session.failChatTurn(turn.turnId, error).catch(() => {});
      throw error;
    }
  } catch (error) {
    if (error instanceof OnboardingTurnRepositoryError) {
      return jsonError(error.message, error.status);
    }
    const message = error instanceof Error ? error.message : 'Chat failed';
    return jsonError(message, 500);
  }
}
