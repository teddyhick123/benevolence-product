import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { ClaudePortfolioAssistant } from '@/lib/claude-assistant';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { aiAuthRequired } from '@/lib/rate-limit-response';
import { aiChatRequestSchema } from '@/lib/schemas/ai';

export const runtime = 'nodejs';
export const maxDuration = 60;

function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { persistSession: false } }
  );
}

/**
 * POST /api/ai/chat
 * Main AI chat endpoint
 * REQUIRES AUTHENTICATION - No anonymous AI access allowed
 */
export async function POST(req: NextRequest) {
  try {
    // Verify env vars - now requires Anthropic API key for Claude
    const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE, ANTHROPIC_API_KEY } = process.env;
    if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Missing required env vars (ANTHROPIC_API_KEY required)' }, { status: 500 });
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

    // Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    const validation = aiChatRequestSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.format(),
        },
        { status: 400 }
      );
    }

    const { portfolioId, message, conversationHistory } = validation.data;

    // Verify user has access to portfolio (check membership or admin status)
    const { data: membership } = await supabase
      .from('portfolio_members')
      .select('role')
      .eq('portfolio_id', portfolioId)
      .eq('user_id', user.id)
      .maybeSingle();

    // Also check if user is admin
    const { data: adminData } = await supabase
      .from('admins')
      .select('user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const isAdmin = !!adminData;

    if (!membership && !isAdmin) {
      return NextResponse.json(
        { error: 'Access denied to this portfolio' },
        { status: 403 }
      );
    }

    const sb = supabaseService();

    // Get organization context for this portfolio (if any)
    // This enables module-based tool filtering
    let orgId: string | undefined;
    const { data: orgHolding } = await sb
      .from('organization_holdings')
      .select('organization_id')
      .eq('holding_id', portfolioId)
      .maybeSingle();

    // If portfolio is linked to an org via holdings, use that org
    // Otherwise check if user belongs to an org that might be relevant
    if (orgHolding?.organization_id) {
      orgId = orgHolding.organization_id;
    } else {
      // Check if user has an organization membership
      const { data: userOrg } = await sb
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();

      if (userOrg?.organization_id) {
        orgId = userOrg.organization_id;
      }
    }

    // Get or create AI session
    const { data: sessionIdData } = await sb.rpc('get_or_create_ai_session', {
      p_portfolio_id: portfolioId,
      p_user_id: user.id,
    });

    const sessionId = sessionIdData as string;

    // Update session with new message
    const { data: session } = await sb
      .from('ai_sessions')
      .select('messages')
      .eq('id', sessionId)
      .single();

    const messages = session?.messages || [];
    messages.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    });

    await sb
      .from('ai_sessions')
      .update({
        messages,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    // Initialize Claude AI assistant
    const assistant = new ClaudePortfolioAssistant(SUPABASE_SERVICE_ROLE, ANTHROPIC_API_KEY);

    // Filter conversation history to only include user/assistant messages (Claude doesn't accept system in messages array)
    const filteredHistory = (conversationHistory || [])
      .filter(msg => msg.role === 'user' || msg.role === 'assistant')
      .map(msg => ({ role: msg.role as 'user' | 'assistant', content: msg.content }));

    // Process the message (orgId enables module-based tool filtering)
    const result = await assistant.chat({
      portfolioId,
      orgId,
      userId: user.id,
      sessionId,
      message,
      conversationHistory: filteredHistory,
    });

    // Check if any widgets were created/displayed and fetch their full data
    // Note: Database returns snake_case field names
    const widgetActions = result.actions.filter(
      (a: any) => a.entity_type === 'widget' && (a.action_type === 'create' || a.action_type === 'preview')
    );

    let widgets: any[] = [];
    if (widgetActions.length > 0) {
      // Separate preview widgets from saved widgets
      const previewActions = widgetActions.filter((a: any) => a.action_type === 'preview');
      const savedActions = widgetActions.filter((a: any) => a.action_type === 'create');

      // For preview widgets, extract from operation_data
      const previewWidgets = previewActions.map((a: any) => ({
        ...a.operation_data?.after,
        is_preview: true,
      }));

      // For saved widgets, fetch from database
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

    // Extract content_blocks from tool results if present (for structured reports)
    let contentBlocks: any[] | undefined;
    if (result.toolResults) {
      for (const tr of result.toolResults) {
        try {
          const parsed = typeof tr.content === 'string' ? JSON.parse(tr.content) : tr.content;
          if (parsed?.content_blocks && Array.isArray(parsed.content_blocks)) {
            contentBlocks = parsed.content_blocks;
            break;
          }
        } catch {
          // Ignore parsing errors
        }
      }
    }

    // Save assistant response to session (with widget references if any)
    const assistantMessage: any = {
      role: 'assistant',
      content: result.message,
      timestamp: new Date().toISOString(),
    };

    if (widgets.length > 0) {
      assistantMessage.widgets = widgets;
    }

    if (contentBlocks && contentBlocks.length > 0) {
      assistantMessage.content_blocks = contentBlocks;
    }

    messages.push(assistantMessage);

    await sb
      .from('ai_sessions')
      .update({
        messages,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    return NextResponse.json({
      message: result.message,
      actions: result.actions,
      widgets,
      content_blocks: contentBlocks,
      sessionId,
    });

  } catch (error: any) {
    return NextResponse.json(
      {
        error: error.message || 'AI chat failed',
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined,
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai/chat?portfolioId=xxx
 * Get conversation history
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const portfolioId = searchParams.get('portfolioId');

    if (!portfolioId) {
      return NextResponse.json({ error: 'portfolioId required' }, { status: 400 });
    }

    // Get authenticated user
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
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
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get active session
    const { data: session } = await supabase
      .from('ai_sessions')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .eq('user_id', user.id)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      session: session || null,
      messages: session?.messages || [],
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to get chat history' },
      { status: 500 }
    );
  }
}
