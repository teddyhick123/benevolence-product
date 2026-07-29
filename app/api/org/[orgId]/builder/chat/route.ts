import { NextRequest } from 'next/server';
import { createAIProvider } from '@/lib/ai/factory';
import { AI_MODELS } from '@/lib/ai/models';
import type { AIContentBlock, AIMessage } from '@/lib/ai/types';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import {
  createOrgBuilderChatRepository,
  type BuilderStoredMessage,
} from '@/lib/api/repositories/builder-chat';
import { jsonError } from '@/lib/api/responses';
import { getCodebaseIndex } from '@/lib/builder/codebase-index';
import { buildSystemPrompt } from '@/lib/builder/context-bundle';
import { BUILDER_TOOLS, type ToolResult } from '@/lib/builder/tools';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) return access.response;

  const body = await req.json().catch(() => ({}));
  const userMessage = body.message;
  if (typeof userMessage !== 'string' || !userMessage.trim()) {
    return jsonError('Message is required', 400);
  }

  const repository = createOrgBuilderChatRepository({
    orgId,
    actorId: access.context.user.id,
    sessionDb: access.context.db,
  });

  let existingMessages: BuilderStoredMessage[];
  let systemPrompt: string;
  try {
    await repository.recordRequest(userMessage);
    const context = await repository.loadContext();
    if (!context.snapshot) {
      return jsonError('Organization not found', 404);
    }
    existingMessages = context.existingMessages;

    let indexAvailable = true;
    try {
      getCodebaseIndex();
    } catch {
      indexAvailable = false;
    }
    systemPrompt = buildSystemPrompt(context.snapshot, indexAvailable);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return jsonError(message, 500);
  }

  const history: AIMessage[] = existingMessages
    .slice(-20)
    .map(message => ({ role: message.role, content: message.content }));
  history.push({ role: 'user', content: userMessage });

  const provider = createAIProvider();
  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(new TextEncoder().encode(sseEvent(data)));
      }

      try {
        let fullAssistantText = '';
        let currentMessages = [...history];

        while (true) {
          const aiStream = provider.createStream({
            model: AI_MODELS.assistant,
            maxTokens: 4096,
            system: systemPrompt,
            tools: BUILDER_TOOLS as any,
            messages: currentMessages,
          });

          let stopReason: string | null = null;
          const toolUseBlocks: AIContentBlock[] = [];
          const assistantContentBlocks: AIContentBlock[] = [];
          let currentToolInput = '';
          let currentToolId = '';
          let currentToolName = '';
          let currentBlockType: 'text' | 'tool_use' | null = null;
          let currentBlockText = '';

          for await (const chunk of aiStream) {
            if (chunk.type === 'content_block_start') {
              if (chunk.blockType === 'tool_use') {
                currentBlockType = 'tool_use';
                currentToolId = chunk.id ?? '';
                currentToolName = chunk.name ?? '';
                currentToolInput = '';
                send({ type: 'tool_start', tool: currentToolName });
              } else {
                currentBlockType = 'text';
                currentBlockText = '';
              }
            } else if (chunk.type === 'text_delta') {
              fullAssistantText += chunk.text;
              currentBlockText += chunk.text;
              send({ type: 'text', text: chunk.text });
            } else if (chunk.type === 'tool_input_delta') {
              currentToolInput += chunk.partialJson;
            } else if (chunk.type === 'content_block_stop') {
              if (currentBlockType === 'tool_use' && currentToolName) {
                let parsedInput: Record<string, unknown> = {};
                try {
                  parsedInput = JSON.parse(currentToolInput);
                } catch {
                  // The tool receives an empty object and returns its normal validation error.
                }
                const toolBlock: AIContentBlock = {
                  type: 'tool_use',
                  id: currentToolId,
                  name: currentToolName,
                  input: parsedInput,
                };
                toolUseBlocks.push(toolBlock);
                assistantContentBlocks.push(toolBlock);
                currentToolName = '';
              } else if (currentBlockType === 'text') {
                assistantContentBlocks.push({ type: 'text', text: currentBlockText });
              }
              currentBlockType = null;
            } else if (chunk.type === 'message_stop') {
              stopReason = chunk.stopReason;
            }
          }

          if (stopReason !== 'tool_use' || toolUseBlocks.length === 0) break;

          const toolResults: Array<{
            type: 'tool_result';
            tool_use_id: string;
            content: string;
          }> = [];

          for (const toolBlock of toolUseBlocks) {
            if (toolBlock.type !== 'tool_use') continue;
            const result: ToolResult = await repository.runTool(
              toolBlock.name,
              toolBlock.input as Record<string, unknown>,
              userMessage
            );

            if (result.type === 'proposal_created') {
              send({
                type: 'proposal',
                proposalId: result.proposalId,
                summary: result.summary,
                fileCount: result.fileCount,
              });
            } else if (result.type === 'scaffold_plan_ready') {
              send({
                type: 'scaffold_plan',
                proposalId: result.proposalId,
                planContent: result.planContent,
              });
            } else {
              send({ type: 'tool_result', result });
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: JSON.stringify(result),
            });
          }

          currentMessages = [
            ...currentMessages,
            { role: 'assistant' as const, content: assistantContentBlocks },
            { role: 'user' as const, content: toolResults as AIContentBlock[] },
          ];
        }

        const now = new Date().toISOString();
        const updatedMessages: BuilderStoredMessage[] = [
          ...existingMessages,
          { role: 'user', content: userMessage, timestamp: now },
          { role: 'assistant', content: fullAssistantText, timestamp: now },
        ];
        await repository.saveSession(updatedMessages);
        send({ type: 'done' });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Stream error';
        send({ type: 'error', message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      'Connection': 'keep-alive',
    },
  });
}
