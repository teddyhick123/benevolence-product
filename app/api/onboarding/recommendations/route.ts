import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { z } from 'zod';
import { OnboardingAssistant } from '@/lib/onboarding-assistant';
import { MODULE_REGISTRY } from '@/lib/modules/registry';

export const runtime = 'nodejs';
export const maxDuration = 30;

function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { persistSession: false } }
  );
}

// Validation schema for accepting recommendations
const acceptSchema = z.object({
  sessionId: z.string().uuid(),
  accepted_modules: z.array(z.string()),
});

/**
 * GET /api/onboarding/recommendations?sessionId=xxx
 * Get or generate module recommendations
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId required' }, { status: 400 });
    }

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

    const sb = supabaseService();

    // Verify session belongs to user
    const { data: session } = await sb
      .from('onboarding_sessions')
      .select('id, user_id, status')
      .eq('id', sessionId)
      .single();

    if (!session || session.user_id !== user.id) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    // Check if recommendations already exist
    const { data: existing } = await sb
      .from('onboarding_recommendations')
      .select('*')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (existing && existing.recommended_modules?.length > 0) {
      // Enrich with module metadata
      const enrichedRecommendations = (existing.recommended_modules || []).map((rec: any) => ({
        ...rec,
        module: MODULE_REGISTRY[rec.module_id as keyof typeof MODULE_REGISTRY],
      }));

      const enrichedExcluded = (existing.excluded_modules || []).map((exc: any) => ({
        ...exc,
        module: MODULE_REGISTRY[exc.module_id as keyof typeof MODULE_REGISTRY],
      }));

      return NextResponse.json({
        recommendations: enrichedRecommendations,
        excluded: enrichedExcluded,
        final_modules: existing.final_modules,
      });
    }

    // Generate recommendations
    const assistant = new OnboardingAssistant(SUPABASE_SERVICE_ROLE);
    const { recommendations, excluded } = await assistant.generateRecommendations(sessionId);

    await sb
      .from('onboarding_sessions')
      .update({
        status: 'recommendations',
        conversation_completed_at: new Date().toISOString(),
      })
      .eq('id', sessionId);

    // Update analytics
    await sb
      .from('onboarding_analytics')
      .update({ modules_recommended: recommendations.length })
      .eq('session_id', sessionId);

    // Enrich with module metadata
    const enrichedRecommendations = recommendations.map(rec => ({
      ...rec,
      module: MODULE_REGISTRY[rec.module_id as keyof typeof MODULE_REGISTRY],
    }));

    const enrichedExcluded = excluded.map(exc => ({
      ...exc,
      module: MODULE_REGISTRY[exc.module_id as keyof typeof MODULE_REGISTRY],
    }));

    return NextResponse.json({
      recommendations: enrichedRecommendations,
      excluded: enrichedExcluded,
    });

  } catch (error: any) {
    console.error('Error in GET /api/onboarding/recommendations:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * POST /api/onboarding/recommendations
 * Accept/finalize module recommendations
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

    const validation = acceptSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { sessionId, accepted_modules } = validation.data;
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

    // Get original recommendations to track changes
    const { data: recommendations } = await sb
      .from('onboarding_recommendations')
      .select('recommended_modules')
      .eq('session_id', sessionId)
      .single();

    const originalModules = (recommendations?.recommended_modules || [])
      .map((r: any) => r.module_id);

    const userAdded = accepted_modules.filter(m => !originalModules.includes(m));
    const userRemoved = originalModules.filter((m: string) => !accepted_modules.includes(m));

    // Update recommendations with final selection
    const { error: updateError } = await sb
      .from('onboarding_recommendations')
      .update({
        final_modules: accepted_modules,
        user_added: userAdded,
        user_removed: userRemoved,
        finalized_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId);

    if (updateError) {
      console.error('Error updating recommendations:', updateError);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Update analytics
    await sb
      .from('onboarding_analytics')
      .update({
        modules_accepted: accepted_modules.length,
        modules_added: userAdded.length,
        modules_removed: userRemoved.length,
      })
      .eq('session_id', sessionId);

    return NextResponse.json({
      success: true,
      final_modules: accepted_modules,
      user_added: userAdded,
      user_removed: userRemoved,
    });

  } catch (error: any) {
    console.error('Error in POST /api/onboarding/recommendations:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
