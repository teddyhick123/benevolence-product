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
  type PersistedChatMessage,
} from '@/lib/api/repositories/ai-chat';
import { containsInjection } from '@/lib/ai/prompt-guard';
import { aiLimiter } from '@/lib/rate-limit';
import { aiAuthRequired, rateLimitExceeded } from '@/lib/rate-limit-response';
import { aiChatRequestSchema } from '@/lib/schemas/ai';

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
      rateLimit.limit
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

  const { portfolioId, message, conversationHistory } = validation.data;
  if (containsInjection(message)) {
    return streamError('Message rejected: contains disallowed content.', 400);
  }

  const portfolioAccess = await requirePortfolioAccessForUser(
    userAccess.context,
    portfolioId,
    'viewer'
  );
  if (isAccessDenied(portfolioAccess)) {
    return portfolioAccess.reason === 'forbidden'
      ? streamError('Access denied to this portfolio', 403)
      : portfolioAccess.response;
  }

  const { orgId, role, db } = portfolioAccess.context;
  const repository = createAiChatRepository(portfolioAccess.context);
  let sessionId: string;
  let sessionMessages: PersistedChatMessage[];
  try {
    const session = await repository.start(message);
    sessionId = session.sessionId;
    sessionMessages = session.messages;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start AI session';
    return streamError(message, 500);
  }

  const assistant = new PortfolioAssistant(
    db as unknown as ConstructorParameters<typeof PortfolioAssistant>[0]
  );
  const filteredHistory = (conversationHistory || [])
    .filter((historyMessage) => (
      historyMessage.role === 'user' || historyMessage.role === 'assistant'
    ))
    .map((historyMessage) => ({
      role: historyMessage.role as 'user' | 'assistant',
      content: historyMessage.content,
    }));
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const streamGenerator = assistant.chatStream({
          portfolioId,
          orgId,
          userId: user.id,
          sessionId,
          message,
          conversationHistory: filteredHistory,
          memberRole: role,
        });
        let finalMessage = '';
        let finalActions: any[] = [];

        for await (const chunk of streamGenerator) {
          controller.enqueue(encoder.encode(chunk));
          try {
            const parsed = JSON.parse(chunk.trim());
            if (parsed.type === 'done') {
              finalMessage = parsed.message;
              finalActions = parsed.actions ?? [];
            }
          } catch {
            // Partial provider chunks need not be independently parseable.
          }
        }

        if (orgId) {
          const month = new Date().toISOString().slice(0, 7);
          redis.incr(`usage:ai:${orgId}:${month}`).catch(() => {});
        }

        const widgetActions = finalActions.filter(
          (action: any) => action.entity_type === 'widget' && (
            action.action_type === 'create' || action.action_type === 'preview'
          )
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
        await repository.finish(sessionId, sessionMessages, assistantMessage);

        controller.enqueue(encoder.encode(`${JSON.stringify({
          type: 'meta',
          sessionId,
          widgets: widgets.length > 0 ? widgets : undefined,
        })}\n`));
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Stream failed';
        controller.enqueue(encoder.encode(
          `${JSON.stringify({ type: 'error', error: message })}\n`
        ));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
