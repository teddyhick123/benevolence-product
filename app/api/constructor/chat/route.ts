import { NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { query, type HookCallback } from '@anthropic-ai/claude-agent-sdk';

export const runtime = 'nodejs';
export const maxDuration = 300;

export type ConstructorSSEEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text'; delta: string }
  | { type: 'tool_start'; name: string; toolUseId: string; input: any }
  | { type: 'tool_end'; name: string; toolUseId: string; output: any }
  | { type: 'done'; result: string }
  | { type: 'error'; message: string };

function encodeSSE(event: ConstructorSSEEvent): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`);
}

// Fires after Write tool — auto-executes SQL migrations if creds are set
const migrationHook: HookCallback = async (input: any) => {
  const filePath: string = input.tool_input?.file_path ?? '';
  if (!/\/db\/[^/]+\.sql$/.test(filePath)) return {};

  const content: string = input.tool_input?.content ?? '';
  const accessToken = process.env.SUPABASE_ACCESS_TOKEN;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const projectRef =
    process.env.SUPABASE_PROJECT_REF ??
    supabaseUrl.match(/https:\/\/([^.]+)\./)?.[1];

  if (!accessToken || !projectRef) {
    console.log('[Constructor] Migration hook: creds not set, skipping auto-execute for', filePath);
    return {};
  }

  try {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/database/query`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: content }),
      }
    );
    if (!res.ok) {
      console.error('[Constructor] Migration execution failed:', await res.text());
    } else {
      console.log('[Constructor] Migration executed successfully:', filePath);
    }
  } catch (err) {
    console.error('[Constructor] Migration hook error:', err);
  }
  return {};
};

export async function POST(req: NextRequest) {
  // Auth: signed-in admin only
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return cookieStore.get(name)?.value; },
        set(name: string, value: string, options: any) { cookieStore.set({ name, value, ...options }); },
        remove(name: string, options: any) { cookieStore.set({ name, value: '', ...options }); },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (!isAdmin) {
    return Response.json({ error: 'Admin access required' }, { status: 403 });
  }

  let body: { message: string; sessionId?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { message, sessionId } = body;
  if (!message?.trim()) {
    return Response.json({ error: 'message is required' }, { status: 400 });
  }

  // Map tool_use_id → tool name for matching tool_end events
  const toolMap = new Map<string, string>();

  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();

  // Launch agent loop in background; stream events to client
  (async () => {
    try {
      const agentQuery = query({
        prompt: message,
        options: {
          permissionMode: 'acceptEdits',
          disallowedTools: ['WebSearch', 'WebFetch'],
          allowedTools: [
            'Read', 'Write', 'Edit', 'Glob', 'Grep',
            'Bash(npx tsc --noEmit)',
            'Bash(npm run lint)',
            'Bash(npm run build)',
            'Bash(npm run test)',
            'Bash(mkdir -p *)',
            'Bash(git status)',
            'Bash(git diff *)',
            'Bash(git log *)',
          ],
          settingSources: ['project'],
          resume: sessionId || undefined,
          hooks: {
            PostToolUse: [{ matcher: 'Write', hooks: [migrationHook] }],
          },
        },
      });

      for await (const msg of agentQuery) {
        if (msg.type === 'system' && msg.subtype === 'init') {
          await writer.write(encodeSSE({ type: 'session', sessionId: msg.session_id }));

        } else if (msg.type === 'stream_event') {
          const event = (msg as any).event;

          if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
            const block = event.content_block;
            toolMap.set(block.id, block.name);
            await writer.write(encodeSSE({
              type: 'tool_start',
              name: block.name,
              toolUseId: block.id,
              input: block.input ?? {},
            }));

          } else if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
            await writer.write(encodeSSE({ type: 'text', delta: event.delta.text }));
          }

        } else if (msg.type === 'user') {
          // Tool results arrive as user messages
          const content = (msg.message as any)?.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === 'tool_result' && block.tool_use_id) {
                const toolName = toolMap.get(block.tool_use_id) ?? 'unknown';
                await writer.write(encodeSSE({
                  type: 'tool_end',
                  name: toolName,
                  toolUseId: block.tool_use_id,
                  output: block.content,
                }));
              }
            }
          }

        } else if (msg.type === 'result') {
          await writer.write(encodeSSE({
            type: 'done',
            result: (msg as any).result ?? '',
          }));
        }
      }
    } catch (err: any) {
      try {
        await writer.write(encodeSSE({ type: 'error', message: err.message ?? 'Unknown error' }));
      } catch { /* writer may already be closed */ }
    } finally {
      try { await writer.close(); } catch { /* ignore */ }
    }
  })();

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'X-Accel-Buffering': 'no',
    },
  });
}
