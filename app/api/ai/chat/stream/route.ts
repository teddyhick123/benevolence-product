import { Redis } from '@upstash/redis';
import { NextRequest } from 'next/server';
import { PortfolioAssistant } from '@/lib/ai/portfolio-assistant';
import {
  isAccessDenied,
  requirePortfolioAccessForUser,
  requireUserAccess,
} from '@/lib/api/access';
import {
  createAiChatRepository,
  type AiChatResponsePayload,
  type PersistedChatMessage,
} from '@/lib/api/repositories/ai-chat';
import { containsInjection } from '@/lib/ai/prompt-guard';
import { aiLimiter } from '@/lib/api/rate-limit';
import { aiAuthRequired, rateLimitExceeded } from '@/lib/api/rate-limit-response';
import { aiChatRequestSchema } from '@/lib/schemas/ai';
import { createAssistantToolCapabilities } from '@/lib/api/repositories/ai-tools';

export const runtime = 'nodejs';
export const maxDuration = 60;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

function streamError(error: string, status: number) {
  return new Response(`${JSON.stringify({ type: 'error', error })}\n`, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function replayStream(response: AiChatResponsePayload) {
  return new Response(
    [
      JSON.stringify({
        type: 'done',
        message: response.message,
        actions: response.actions,
        toolResults: [],
      }),
      JSON.stringify({
        type: 'meta',
        sessionId: response.sessionId,
        widgets: response.widgets.length > 0 ? response.widgets : undefined,
        content_blocks: response.content_blocks,
        replayed: true,
      }),
      '',
    ].join('\n'),
    {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    },
  );
}

/** POST /api/ai/chat/stream — stream NDJSON assistant events. */
export async function POST(req: NextRequest) {
  const userAccess = await requireUserAccess();
  if (isAccessDenied(userAccess)) {
    return userAccess.reason === 'unauthenticated'
      ? aiAuthRequired()
      : userAccess.response;
  }

  const user = userAccess.context.user;
  const rateLimit = await aiLimiter.limit(user.id);
  if (!rateLimit.success) {
    return rateLimitExceeded(
      rateLimit.reset,
      rateLimit.remaining,
      rateLimit.limit,
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return streamError('Invalid JSON body', 400);
  }

  const validation = aiChatRequestSchema.safeParse(body);
  if (!validation.success) return streamError('Validation failed', 400);

  const { portfolioId, message } = validation.data;
  const requestId = validation.data.requestId ?? crypto.randomUUID();
  if (containsInjection(message)) {
    return streamError('Message rejected: contains disallowed content.', 400);
  }

  const portfolioAccess = await requirePortfolioAccessForUser(
    userAccess.context,
    portfolioId,
    'viewer',
  );
  if (isAccessDenied(portfolioAccess)) {
    return portfolioAccess.reason === 'forbidden'
      ? streamError('Access denied to this portfolio', 403)
      : portfolioAccess.response;
  }

  const { orgId, role, db } = portfolioAccess.context;
  const repository = createAiChatRepository(portfolioAccess.context);
  let turn: Awaited<ReturnType<typeof repository.beginTurn>>;
  try {
    turn = await repository.beginTurn(requestId, message);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to start AI session';
    return streamError(message, 500);
  }

  if (turn.state === 'completed') return replayStream(turn.response);
  if (turn.state !== 'started') {
    return streamError(
      turn.failureMessage ?? `AI turn is ${turn.state.replace('_', ' ')}`,
      409,
    );
  }

  const { sessionId, turnId } = turn;

  const assistant = new PortfolioAssistant({
    db: db as unknown as ConstructorParameters<
      typeof PortfolioAssistant
    >[0]['db'],
    capabilities: createAssistantToolCapabilities(portfolioAccess.context),
  });
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const streamGenerator = assistant.chatStream({
          portfolioId,
          orgId,
          userId: user.id,
          sessionId,
          turnId,
          message,
          conversationHistory: turn.history,
          memberRole: role,
        });
        let finalMessage = '';
        let finalActions: any[] = [];
        let terminalChunk: string | null = null;

        for await (const chunk of streamGenerator) {
          try {
            const parsed = JSON.parse(chunk.trim());
            if (parsed.type === 'done') {
              finalMessage = parsed.message;
              finalActions = parsed.actions ?? [];
              terminalChunk = chunk;
              continue;
            }
          } catch {
            // Partial provider chunks need not be independently parseable.
          }
          controller.enqueue(encoder.encode(chunk));
        }

        if (orgId) {
          const month = new Date().toISOString().slice(0, 7);
          redis.incr(`usage:ai:${orgId}:${month}`).catch(() => {});
        }

        const widgetActions = finalActions.filter(
          (action: any) =>
            action.entity_type === 'widget' &&
            (action.action_type === 'create' ||
              action.action_type === 'preview'),
        );
        const previewWidgets = widgetActions
          .filter((action: any) => action.action_type === 'preview')
          .map((action: any) => ({
            ...action.operation_data?.after,
            is_preview: true,
          }));
        const savedWidgetIds = widgetActions
          .filter((action: any) => action.action_type === 'create')
          .map((action: any) => action.entity_id as string);
        const savedWidgets = await repository.loadSavedWidgets(savedWidgetIds);
        const widgets = [...previewWidgets, ...savedWidgets];
        const assistantMessage: PersistedChatMessage = {
          role: 'assistant',
          content: finalMessage,
          timestamp: new Date().toISOString(),
        };
        if (widgets.length > 0) assistantMessage.widgets = widgets;
        const response: AiChatResponsePayload = {
          message: finalMessage,
          actions: finalActions,
          widgets,
          sessionId,
        };
        await repository.completeTurn(turnId, assistantMessage, response);
        if (terminalChunk) controller.enqueue(encoder.encode(terminalChunk));

        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({
              type: 'meta',
              sessionId,
              widgets: widgets.length > 0 ? widgets : undefined,
            })}\n`,
          ),
        );
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Stream failed';
        try {
          await repository.failTurn(turnId, 'stream_failed', message);
        } catch (persistenceError) {
          console.error(
            '[ai/chat/stream] failed to record terminal turn state:',
            persistenceError,
          );
        }
        controller.enqueue(
          encoder.encode(
            `${JSON.stringify({ type: 'error', error: message })}\n`,
          ),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
