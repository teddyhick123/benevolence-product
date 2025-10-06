import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AIPortfolioAssistant } from '@/lib/ai-assistant';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

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
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await req.json();
    const { portfolioId, message, conversationHistory } = body;

    if (!portfolioId || !message) {
      return NextResponse.json(
        { error: 'portfolioId and message are required' },
        { status: 400 }
      );
    }

    // Verify user has access to portfolio
    const { data: membership } = await supabase
      .from('portfolio_members')
      .select('role')
      .eq('portfolio_id', portfolioId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
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

    // Save assistant response to session
    messages.push({
      role: 'assistant',
      content: result.message,
      timestamp: new Date().toISOString(),
    });

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
      sessionId,
    });

  } catch (error: any) {
    console.error('AI chat error:', error);
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
    console.error('Get chat history error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to get chat history' },
      { status: 500 }
    );
  }
}
