import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { z } from 'zod';
import { OnboardingAssistant } from '@/lib/onboarding-assistant';

export const runtime = 'nodejs';
export const maxDuration = 60;

function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { persistSession: false } }
  );
}

// Validation schema
const chatSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(5000),
});

/**
 * POST /api/onboarding/chat
 * Send message to onboarding AI
 */
export async function POST(req: NextRequest) {
  try {
    // Check required service role; provider-specific API keys are checked by the provider.
    const { SUPABASE_SERVICE_ROLE } = process.env;
    if (!SUPABASE_SERVICE_ROLE) {
      return NextResponse.json(
        { error: 'Missing required environment variables' },
        { status: 500 }
      );
    }

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

    // Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = chatSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { sessionId, message } = validation.data;
    const sb = supabaseService();

    // Fetch session with all data
    const { data: session, error: sessionError } = await sb
      .from('onboarding_sessions')
      .select('*')
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    if (session.status !== 'conversation') {
      return NextResponse.json(
        { error: 'Session not in conversation state' },
        { status: 400 }
      );
    }

    // Add user message to history
    const messages = session.messages || [];
    messages.push({
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    });

    // Update session with user message
    await sb
      .from('onboarding_sessions')
      .update({ messages })
      .eq('id', sessionId);

    // Initialize assistant and process message
    const assistant = new OnboardingAssistant(SUPABASE_SERVICE_ROLE);

    const conversationHistory = (session.messages || []).map((m: any) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    console.log('Calling onboarding assistant chat...');
    const result = await assistant.chat({
      sessionId,
      userId: user.id,
      message,
      quickIntake: session.quick_intake || {},
      conversationHistory,
      conversationState: session.conversation_state || undefined,
    });
    console.log('Assistant response:', {
      hasMessage: !!result.message,
      messageLength: result.message?.length,
      hasExtractions: Object.keys(result.extractions || {}).length > 0
    });

    // Add assistant message to history
    messages.push({
      role: 'assistant',
      content: result.message,
      timestamp: new Date().toISOString(),
    });

    // Update session with assistant message and state
    const updateData: any = {
      messages,
      conversation_state: result.updated_state,
    };

    // If ready for recommendations, update status
    if (result.trigger_recommendations || result.updated_state?.ready_for_recommendations) {
      updateData.status = 'recommendations';
      updateData.conversation_completed_at = new Date().toISOString();

      // Update analytics
      if (session.intake_completed_at) {
        const conversationDuration = Math.floor(
          (Date.now() - new Date(session.intake_completed_at).getTime()) / 1000
        );
        await sb
          .from('onboarding_analytics')
          .update({ conversation_duration_seconds: conversationDuration })
          .eq('session_id', sessionId);
      }
    }

    await sb
      .from('onboarding_sessions')
      .update(updateData)
      .eq('id', sessionId);

    return NextResponse.json({
      message: result.message,
      extractions: result.extractions,
      conversation_state: result.updated_state,
      ready_for_recommendations: result.trigger_recommendations || result.updated_state?.ready_for_recommendations,
    });

  } catch (error: any) {
    console.error('Error in POST /api/onboarding/chat:', error);
    return NextResponse.json(
      { error: error.message || 'Chat failed' },
      { status: 500 }
    );
  }
}
