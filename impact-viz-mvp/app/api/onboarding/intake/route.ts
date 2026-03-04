import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { z } from 'zod';
import { OnboardingAssistant, type QuickIntake } from '@/lib/onboarding-assistant';

export const runtime = 'nodejs';

function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { persistSession: false } }
  );
}

// Validation schema for quick intake
const quickIntakeSchema = z.object({
  sessionId: z.string().uuid(),
  org_type: z.enum(['foundation', 'daf', 'nonprofit', 'impact_investor']),
  org_name: z.string().min(1).max(200),
  org_size: z.enum(['solo', 'small', 'medium', 'large']),
  primary_focus: z.array(z.string()).optional(),
  existing_tools: z.array(z.string()).optional(),
});

/**
 * POST /api/onboarding/intake
 * Save quick intake data
 */
export async function POST(req: NextRequest) {
  try {
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

    const validation = quickIntakeSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { sessionId, ...quickIntake } = validation.data;
    const sb = supabaseService();

    // Verify session belongs to user
    const { data: session } = await sb
      .from('onboarding_sessions')
      .select('id, user_id')
      .eq('id', sessionId)
      .single();

    if (!session || session.user_id !== user.id) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Generate welcome message
    const welcomeMessage = OnboardingAssistant.getWelcomeMessage(quickIntake as QuickIntake);
    const initialMessages = [
      {
        role: 'assistant',
        content: welcomeMessage,
        timestamp: new Date().toISOString(),
      },
    ];

    // Update session with intake data and welcome message
    const { error: updateError } = await sb
      .from('onboarding_sessions')
      .update({
        quick_intake: quickIntake,
        messages: initialMessages,
        status: 'conversation',
        intake_completed_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    if (updateError) {
      console.error('Error updating session:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Update analytics
    const { data: existingSession } = await sb
      .from('onboarding_sessions')
      .select('started_at')
      .eq('id', sessionId)
      .single();

    if (existingSession) {
      const intakeDuration = Math.floor(
        (Date.now() - new Date(existingSession.started_at).getTime()) / 1000
      );

      await sb
        .from('onboarding_analytics')
        .update({ intake_duration_seconds: intakeDuration })
        .eq('session_id', sessionId);
    }

    return NextResponse.json({
      success: true,
      sessionId,
      status: 'conversation',
      messages: initialMessages,
      welcomeMessage,
    });

  } catch (error: any) {
    console.error('Error in POST /api/onboarding/intake:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
