// app/api/org/[orgId]/builder/chat/route.ts
import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
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

function sseEvent(data: Record<string, unknown>): string {
  return `data: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const supabase = await createServerClient();
  const adminSupabase = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const userMessage = body.message;
  if (typeof userMessage !== 'string' || !userMessage.trim()) {
    return NextResponse.json({ error: 'Message is required' }, { status: 400 });
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
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  const existingMessages: StoredMessage[] = (sessionRes.data?.messages as StoredMessage[]) || [];

  const history: Anthropic.MessageParam[] = existingMessages
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

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const stream = new ReadableStream({
    async start(controller) {
      function send(data: Record<string, unknown>) {
        controller.enqueue(new TextEncoder().encode(sseEvent(data)));
      }

      try {
        let fullAssistantText = '';
        let currentMessages = [...history];

        while (true) {
          const response = await anthropic.messages.create({
            model: 'claude-sonnet-4-6',
            max_tokens: 4096,
            system: systemPrompt,
            tools: BUILDER_TOOLS,
            messages: currentMessages,
            stream: true,
          });

          let stopReason: string | null = null;
          const toolUseBlocks: Anthropic.ToolUseBlock[] = [];
          const assistantContentBlocks: Array<{ type: 'text'; text: string } | Anthropic.ToolUseBlock> = [];
          let currentToolInput = '';
          let currentToolId = '';
          let currentToolName = '';
          let currentBlockType: 'text' | 'tool_use' | null = null;
          let currentBlockText = '';

          for await (const event of response) {
            if (event.type === 'content_block_start') {
              if (event.content_block.type === 'tool_use') {
                currentBlockType = 'tool_use';
                currentToolId = event.content_block.id;
                currentToolName = event.content_block.name;
                currentToolInput = '';
                send({ type: 'tool_start', tool: currentToolName });
              } else if (event.content_block.type === 'text') {
                currentBlockType = 'text';
                currentBlockText = '';
              }
            } else if (event.type === 'content_block_delta') {
              if (event.delta.type === 'text_delta') {
                fullAssistantText += event.delta.text;
                currentBlockText += event.delta.text;
                send({ type: 'text', text: event.delta.text });
              } else if (event.delta.type === 'input_json_delta') {
                currentToolInput += event.delta.partial_json;
              }
            } else if (event.type === 'content_block_stop') {
              if (currentBlockType === 'tool_use' && currentToolName) {
                let parsedInput: Record<string, unknown> = {};
                try { parsedInput = JSON.parse(currentToolInput); } catch { /* ignore */ }
                const toolBlock: Anthropic.ToolUseBlock = {
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
            } else if (event.type === 'message_delta') {
              stopReason = event.delta.stop_reason ?? null;
            }
          }

          if (stopReason !== 'tool_use' || toolUseBlocks.length === 0) {
            break;
          }

          const toolResults: Anthropic.ToolResultBlockParam[] = [];

          for (const toolBlock of toolUseBlocks) {
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
            { role: 'user' as const, content: toolResults },
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

        await adminSupabase.from('builder_sessions').upsert({
          org_id: orgId,
          user_id: user.id,
          messages: updatedMessages,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'org_id,user_id' });

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
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
