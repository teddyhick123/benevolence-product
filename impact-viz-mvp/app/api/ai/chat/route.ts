import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AIPortfolioAssistant } from '@/lib/ai-assistant';
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
    // Verify env vars
    const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE, OPENAI_API_KEY } = process.env;
    if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !OPENAI_API_KEY) {
      return NextResponse.json({ error: 'Missing required env vars' }, { status: 500 });
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

    // Initialize AI assistant
    const assistant = new AIPortfolioAssistant(SUPABASE_SERVICE_ROLE, OPENAI_API_KEY);

    // Process the message
    const result = await assistant.chat({
      portfolioId,
      userId: user.id,
      sessionId,
      message,
      conversationHistory: conversationHistory || [],
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

    // Save assistant response to session (with widget references if any)
    const assistantMessage: any = {
      role: 'assistant',
      content: result.message,
      timestamp: new Date().toISOString(),
    };

    if (widgets.length > 0) {
      assistantMessage.widgets = widgets;
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
