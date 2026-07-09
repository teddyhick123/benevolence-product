// app/api/org/[orgId]/builder/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createAIProvider } from '@/lib/ai/factory';
import { AI_MODELS } from '@/lib/ai/models';
import type { AIStreamChunk, AIContentBlock, AIMessage } from '@/lib/ai/types';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { fetchOrgSnapshot, buildSystemPrompt } from '@/lib/builder/context-bundle';
import { BUILDER_TOOLS, executeTool, ToolResult } from '@/lib/builder/tools';
import { getCodebaseIndex } from '@/lib/builder/codebase-index';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

interface StoredMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
}

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const supabase = await createServerClient();
  const adminSupabase = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
  if (!isAdmin) {
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const userMessage = body.message;
  if (typeof userMessage !== 'string' || !userMessage.trim()) {
    return json({ error: 'Message is required' }, { status: 400 });
  }

  const { error: eventError } = await adminSupabase.from('builder_events').insert({
    org_id: orgId,
    user_id: user.id,
    event_type: 'ai_request',
    request_text: userMessage,
  });
  if (eventError) {
    return json({ error: eventError.message }, { status: 500 });
  }

  const [snapshot, sessionRes] = await Promise.all([
    fetchOrgSnapshot(supabase, orgId),
    supabase
      .from('builder_sessions')
      .select('id, messages')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  if (!snapshot) {
    return json({ error: 'Organization not found' }, { status: 404 });
  }

  const existingMessages: StoredMessage[] = (sessionRes.data?.messages as StoredMessage[]) || [];

  const history: AIMessage[] = existingMessages
    .slice(-20)
    .map(m => ({ role: m.role, content: m.content }));

  history.push({ role: 'user', content: userMessage });

  let indexAvailable = true;
  try {
    getCodebaseIndex();
  } catch {
    indexAvailable = false;
  }
  const systemPrompt = buildSystemPrompt(snapshot, indexAvailable);

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
                try { parsedInput = JSON.parse(currentToolInput); } catch { /* ignore */ }
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

          if (stopReason !== 'tool_use' || toolUseBlocks.length === 0) {
            break;
          }

          const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];

          for (const toolBlock of toolUseBlocks) {
            if (toolBlock.type !== 'tool_use') continue;

            const result: ToolResult = await executeTool(
              toolBlock.name,
              toolBlock.input as Record<string, unknown>,
              orgId,
              user.id,
              userMessage,
              supabase,
              adminSupabase
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
            {
              role: 'assistant' as const,
              content: assistantContentBlocks,
            },
            {
              role: 'user' as const,
              content: toolResults as AIContentBlock[],
            },
          ];
        }

        const newMessage: StoredMessage = {
          role: 'user',
          content: userMessage,
          timestamp: new Date().toISOString(),
        };
        const assistantMessage: StoredMessage = {
          role: 'assistant',
          content: fullAssistantText,
          timestamp: new Date().toISOString(),
        };

        const updatedMessages = [...existingMessages, newMessage, assistantMessage];

        const { error: sessionError } = await adminSupabase.from('builder_sessions').upsert({
          org_id: orgId,
          user_id: user.id,
          messages: updatedMessages,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'org_id,user_id' });
        if (sessionError) throw sessionError;

        send({ type: 'done' });
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Stream error';
        controller.enqueue(new TextEncoder().encode(sseEvent({ type: 'error', message })));
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
