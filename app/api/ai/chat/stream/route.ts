import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ClaudePortfolioAssistant } from '@/lib/claude-assistant';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { aiAuthRequired, rateLimitExceeded } from '@/lib/rate-limit-response';
import { aiLimiter } from '@/lib/rate-limit';
import { aiChatRequestSchema } from '@/lib/schemas/ai';
import { containsInjection } from '@/lib/ai/prompt-guard';
import { Redis } from '@upstash/redis';

export const runtime = 'nodejs';
export const maxDuration = 60;

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { persistSession: false } }
  );
}

/**
 * POST /api/ai/chat/stream
 * Streaming AI chat endpoint — yields NDJSON events as they arrive.
 * REQUIRES AUTHENTICATION - No anonymous AI access allowed
 */
export async function POST(req: NextRequest) {
  // Verify env vars
  const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE, ANTHROPIC_API_KEY } = process.env;
  if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !ANTHROPIC_API_KEY) {
    return new Response(
      JSON.stringify({ type: 'error', error: 'Missing required env vars (ANTHROPIC_API_KEY required)' }) + '\n',
      { status: 500, headers: { 'Content-Type': 'text/event-stream' } }
    );
  }

  // Get authenticated user
  const cookieStore = await cookies();
  const supabase = createServerClient(
    NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          cookieStore.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Block anonymous access to AI features
  if (!user) {
    return aiAuthRequired();
  }

  // Rate-limit per user: 30 requests/hour
  const { success, reset, remaining, limit } = await aiLimiter.limit(user.id);
  if (!success) {
    return rateLimitExceeded(reset, remaining, limit);
  }

  // Parse and validate request body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return new Response(
      JSON.stringify({ type: 'error', error: 'Invalid JSON body' }) + '\n',
      { status: 400, headers: { 'Content-Type': 'text/event-stream' } }
    );
  }

  const validation = aiChatRequestSchema.safeParse(body);
  if (!validation.success) {
    return new Response(
      JSON.stringify({ type: 'error', error: 'Validation failed' }) + '\n',
      { status: 400, headers: { 'Content-Type': 'text/event-stream' } }
    );
  }

  const { portfolioId, message, conversationHistory } = validation.data;

  // Reject prompt injection attempts in user messages
  if (containsInjection(message)) {
    return new Response(
      JSON.stringify({ type: 'error', error: 'Message rejected: contains disallowed content.' }) + '\n',
      { status: 400, headers: { 'Content-Type': 'text/event-stream' } }
    );
  }

  // Verify user has access to portfolio (check membership or admin status)
  const { data: membership } = await supabase
    .from('portfolio_members')
    .select('role')
    .eq('portfolio_id', portfolioId)
    .eq('user_id', user.id)
    .maybeSingle();

  // Also check if user is admin (using canonical is_admin() RPC)
  const { data: isAdminResult } = await supabase.rpc('is_app_admin');
  const isAdmin = !!isAdminResult;

  if (!membership && !isAdmin) {
    return new Response(
      JSON.stringify({ type: 'error', error: 'Access denied to this portfolio' }) + '\n',
      { status: 403, headers: { 'Content-Type': 'text/event-stream' } }
    );
  }

  const sb = supabaseService();

  // Get organization context for this portfolio (if any)
  let orgId: string | undefined;
  const { data: portfolio } = await sb
    .from('portfolios')
    .select('org_id')
    .eq('id', portfolioId)
    .maybeSingle();

  if (portfolio?.org_id) {
    orgId = portfolio.org_id;
  } else {
    const { data: userOrg } = await sb
      .from('organization_members')
      .select('org_id')
      .eq('user_id', user.id)
      .limit(1)
      .maybeSingle();

    if (userOrg?.org_id) {
      orgId = userOrg.org_id;
    }
  }

  // Get or create AI session
  const { data: sessionIdData } = await sb.rpc('get_or_create_ai_session', {
    p_portfolio_id: portfolioId,
    p_user_id: user.id,
  });

  const sessionId = sessionIdData as string;

  // Update session with new user message
  const { data: session } = await sb
    .from('ai_sessions')
    .select('messages')
    .eq('id', sessionId)
    .single();

  const sessionMessages = session?.messages || [];
  sessionMessages.push({
    role: 'user',
    content: message,
    timestamp: new Date().toISOString(),
  });

  await sb
    .from('ai_sessions')
    .update({
      messages: sessionMessages,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sessionId);

  // Initialize Claude AI assistant
  const assistant = new ClaudePortfolioAssistant(supabase as any, ANTHROPIC_API_KEY);

  // Filter conversation history to only include user/assistant messages
  const filteredHistory = (conversationHistory || [])
    .filter((msg: any) => msg.role === 'user' || msg.role === 'assistant')
    .map((msg: any) => ({ role: msg.role as 'user' | 'assistant', content: msg.content }));

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const streamGen = assistant.chatStream({
          portfolioId,
          orgId,
          userId: user.id,
          sessionId,
          message,
          conversationHistory: filteredHistory,
          memberRole: membership?.role ?? 'viewer',
        });

        let finalMessage = '';
        let finalActions: any[] = [];

        for await (const chunk of streamGen) {
          controller.enqueue(encoder.encode(chunk));

          // Parse to capture done event data
          try {
            const parsed = JSON.parse(chunk.trim());
            if (parsed.type === 'done') {
              finalMessage = parsed.message;
              finalActions = parsed.actions ?? [];
            }
          } catch {}
        }

        // After streaming: fire-and-forget per-org AI usage counter
        if (orgId) {
          const month = new Date().toISOString().slice(0, 7); // YYYY-MM
          redis.incr(`usage:ai:${orgId}:${month}`).catch(() => {});
        }

        // Check if any widgets were created/displayed and fetch their full data
        const widgetActions = finalActions.filter(
          (a: any) => a.entity_type === 'widget' && (a.action_type === 'create' || a.action_type === 'preview')
        );

        let widgets: any[] = [];
        if (widgetActions.length > 0) {
          const previewActions = widgetActions.filter((a: any) => a.action_type === 'preview');
          const savedActions = widgetActions.filter((a: any) => a.action_type === 'create');

          const previewWidgets = previewActions.map((a: any) => ({
            ...a.operation_data?.after,
            is_preview: true,
          }));

          let savedWidgets: any[] = [];
          if (savedActions.length > 0) {
            const widgetIds = savedActions.map((a: any) => a.entity_id);
            const [portfolioWidgets, holdingWidgets] = await Promise.all([
              sb.from('widgets').select('*').in('id', widgetIds),
              sb.from('holding_widgets').select('*').in('id', widgetIds),
            ]);

            savedWidgets = [
              ...(portfolioWidgets.data || []),
              ...(holdingWidgets.data || []),
            ];
          }

          widgets = [...previewWidgets, ...savedWidgets];
        }

        // Save assistant response to session
        const assistantMessage: any = {
          role: 'assistant',
          content: finalMessage,
          timestamp: new Date().toISOString(),
        };

        if (widgets.length > 0) {
          assistantMessage.widgets = widgets;
        }

        sessionMessages.push(assistantMessage);

        await sb
          .from('ai_sessions')
          .update({
            messages: sessionMessages,
            updated_at: new Date().toISOString(),
          })
          .eq('id', sessionId);

        // Emit final metadata event with sessionId and widgets
        const metaEvent = JSON.stringify({
          type: 'meta',
          sessionId,
          widgets: widgets.length > 0 ? widgets : undefined,
        }) + '\n';
        controller.enqueue(encoder.encode(metaEvent));

      } catch (err: any) {
        controller.enqueue(encoder.encode(
          JSON.stringify({ type: 'error', error: err.message || 'Stream failed' }) + '\n'
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
