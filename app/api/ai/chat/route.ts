import { Redis } from '@upstash/redis';
import { NextRequest } from 'next/server';
import { PortfolioAssistant } from '@/lib/ai/portfolio-assistant';
import {
  isAccessDenied,
  requirePortfolioAccess,
  requirePortfolioAccessForUser,
  requireUserAccess,
} from '@/lib/api/access';
import {
  createAiChatRepository,
  type AiChatResponsePayload,
  type PersistedChatMessage,
} from '@/lib/api/repositories/ai-chat';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { createAssistantToolCapabilities } from '@/lib/api/repositories/ai-tools';
import { containsInjection } from '@/lib/ai/prompt-guard';
import { aiLimiter } from '@/lib/api/rate-limit';
import { aiAuthRequired, rateLimitExceeded } from '@/lib/api/rate-limit-response';
import { aiChatRequestSchema } from '@/lib/schemas/ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

/**
 * POST /api/ai/chat
 * Main AI chat endpoint.
 */
export async function POST(req: NextRequest) {
  let activeTurn: {
    id: string;
    repository: ReturnType<typeof createAiChatRepository>;
  } | null = null;

  try {
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
      return jsonError('Invalid JSON body', 400);
    }

    const validation = aiChatRequestSchema.safeParse(body);
    if (!validation.success) {
      return jsonError('Validation failed', 400, {
        details: validation.error.format(),
      });
    }

    const { portfolioId, message } = validation.data;
    const requestId = validation.data.requestId ?? crypto.randomUUID();
    if (containsInjection(message)) {
      return jsonError('Message rejected: contains disallowed content.', 400);
    }

    const portfolioAccess = await requirePortfolioAccessForUser(
      userAccess.context,
      portfolioId,
      'viewer',
    );
    if (isAccessDenied(portfolioAccess)) {
      return portfolioAccess.reason === 'forbidden'
        ? jsonError('Access denied to this portfolio', 403)
        : portfolioAccess.response;
    }

    const { orgId, role, db } = portfolioAccess.context;
    const repository = createAiChatRepository(portfolioAccess.context);
    const turn = await repository.beginTurn(requestId, message);
    if (turn.state === 'completed') {
      return jsonOk(turn.response);
    }
    if (turn.state !== 'started') {
      return jsonError(
        turn.failureMessage ?? `AI turn is ${turn.state.replace('_', ' ')}`,
        409,
        { requestId, turnId: turn.turnId, state: turn.state },
      );
    }

    const { sessionId, turnId } = turn;
    activeTurn = { id: turnId, repository };
    const assistant = new PortfolioAssistant({
      db: db as unknown as ConstructorParameters<
        typeof PortfolioAssistant
      >[0]['db'],
      capabilities: createAssistantToolCapabilities(portfolioAccess.context),
    });

    const result = await assistant.chat({
      portfolioId,
      orgId,
      userId: user.id,
      sessionId,
      turnId,
      message,
      conversationHistory: turn.history,
      memberRole: role,
    });

    if (orgId) {
      const month = new Date().toISOString().slice(0, 7);
      redis.incr(`usage:ai:${orgId}:${month}`).catch(() => {});
    }

    const widgetActions = result.actions.filter(
      (action: any) =>
        action.entity_type === 'widget' &&
        (action.action_type === 'create' || action.action_type === 'preview'),
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

    let contentBlocks: any[] | undefined;
    if (result.toolResults) {
      for (const toolResult of result.toolResults) {
        try {
          const parsed =
            typeof toolResult.content === 'string'
              ? JSON.parse(toolResult.content)
              : toolResult.content;
          if (parsed?.content_blocks && Array.isArray(parsed.content_blocks)) {
            contentBlocks = parsed.content_blocks;
            break;
          }
        } catch {
          // Tool output is allowed to contain non-JSON text.
        }
      }
    }

    const assistantMessage: PersistedChatMessage = {
      role: 'assistant',
      content: result.message,
      timestamp: new Date().toISOString(),
    };
    if (widgets.length > 0) assistantMessage.widgets = widgets;
    if (contentBlocks?.length) assistantMessage.content_blocks = contentBlocks;
    const response: AiChatResponsePayload = {
      message: result.message,
      actions: result.actions,
      widgets,
      ...(contentBlocks ? { content_blocks: contentBlocks } : {}),
      sessionId,
    };
    const persistedResponse = await repository.completeTurn(
      turnId,
      assistantMessage,
      response,
    );
    activeTurn = null;

    return jsonOk(persistedResponse);
  } catch (error) {
    if (activeTurn) {
      const failureMessage =
        error instanceof Error ? error.message : 'AI chat failed';
      try {
        await activeTurn.repository.failTurn(
          activeTurn.id,
          'chat_failed',
          failureMessage,
        );
      } catch (persistenceError) {
        console.error(
          '[ai/chat] failed to record terminal turn state:',
          persistenceError,
        );
      }
    }
    const isDev = process.env.NODE_ENV === 'development';
    const message = error instanceof Error ? error.message : 'AI chat failed';
    console.error('[ai/chat]', error);
    return jsonError(
      isDev ? message : 'An error occurred. Please try again.',
      500,
      isDev && error instanceof Error ? { stack: error.stack } : undefined,
    );
  }
}

/** GET /api/ai/chat?portfolioId=xxx — get conversation history. */
export async function GET(req: NextRequest) {
  const portfolioId = new URL(req.url).searchParams.get('portfolioId');
  if (!portfolioId) return jsonError('portfolioId required', 400);

  const access = await requirePortfolioAccess(portfolioId, 'viewer');
  if (isAccessDenied(access)) return access.response;

  try {
    const repository = createAiChatRepository(access.context);
    const history = await repository.listHistory();
    return jsonOk({
      session: history.session,
      messages: history.messages,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to get chat history';
    return jsonError(message, 500);
  }
}
