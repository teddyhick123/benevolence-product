import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { z } from 'zod';
import { enableModule } from '@/lib/modules';
import type { ModuleId } from '@/lib/modules/registry';

export const runtime = 'nodejs';

function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { persistSession: false } }
  );
}

// Validation schema
const completeSchema = z.object({
  sessionId: z.string().uuid(),
  modules: z.array(z.string()).optional(),
});

/**
 * POST /api/onboarding/complete
 * Complete onboarding and apply modules to organization
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

    const validation = completeSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.error.format() },
        { status: 400 }
      );
    }

    const { sessionId, modules: requestModules } = validation.data;
    const sb = supabaseService();

    // Fetch session with all data
    const { data: session, error: sessionError } = await sb
      .from('onboarding_sessions')
      .select(`
        *,
        onboarding_recommendations (*)
      `)
      .eq('id', sessionId)
      .single();

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.user_id !== user.id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    // Get final modules to apply - prefer request body, fall back to database
    const recommendations = session.onboarding_recommendations?.[0];
    const finalModules = requestModules || recommendations?.final_modules || [];

    if (finalModules.length === 0) {
      return NextResponse.json(
        { error: 'No modules selected. Please select at least one module.' },
        { status: 400 }
      );
    }

    // Save the final modules to the recommendations table if provided via request
    if (requestModules && requestModules.length > 0) {
      await sb
        .from('onboarding_recommendations')
        .update({ final_modules: requestModules })
        .eq('session_id', sessionId);
    }

    // Get or create organization
    let orgId = session.organization_id;
    const quickIntake = session.quick_intake || {};

    console.log('Creating/getting organization:', { orgId, quickIntake });

    if (!orgId && quickIntake.org_name) {
      // Create organization
      const { data: newOrg, error: orgError } = await sb
        .from('organizations')
        .insert({
          name: quickIntake.org_name,
          org_type_config: {
            description: `${quickIntake.org_type || 'nonprofit'} organization`,
          },
          modules: { portfolio: true },
        })
        .select()
        .single();

      if (orgError) {
        console.error('Error creating organization:', orgError);
        return NextResponse.json({ error: `Failed to create organization: ${orgError.message}` }, { status: 500 });
      }

      orgId = newOrg.id;

      // Add user as admin of the organization
      const { error: memberError } = await sb
        .from('organization_members')
        .insert({
          org_id: orgId,
          user_id: user.id,
          role: 'admin',
        });

      if (memberError) {
        console.error('Error adding org member:', memberError);
        // Don't fail completely, org was created
      }

      // Update session with org ID
      await sb
        .from('onboarding_sessions')
        .update({ organization_id: orgId })
        .eq('id', sessionId);
    }

    if (!orgId) {
      return NextResponse.json(
        { error: 'No organization found or created' },
        { status: 400 }
      );
    }

    // Enable modules for the organization
    console.log('Enabling modules:', { orgId, finalModules });
    const enabledModules: string[] = [];
    const errors: string[] = [];

    for (const moduleId of finalModules) {
      console.log(`Enabling module: ${moduleId}`);
      const result = await enableModule(sb, orgId, moduleId as ModuleId, user.id);
      if (result.success) {
        enabledModules.push(moduleId);
        console.log(`Module ${moduleId} enabled successfully`);
      } else {
        console.error(`Module ${moduleId} failed:`, result.error);
        errors.push(`${moduleId}: ${result.error}`);
      }
    }

    // Mark session as completed
    const completedAt = new Date().toISOString();
    await sb
      .from('onboarding_sessions')
      .update({
        status: 'completed',
        completed_at: completedAt,
      })
      .eq('id', sessionId);

    // Update analytics
    const totalDuration = Math.floor(
      (Date.now() - new Date(session.started_at).getTime()) / 1000
    );

    await sb
      .from('onboarding_analytics')
      .update({
        total_duration_seconds: totalDuration,
        completed_successfully: true,
      })
      .eq('session_id', sessionId);

    return NextResponse.json({
      success: true,
      organization_id: orgId,
      enabled_modules: enabledModules,
      errors: errors.length > 0 ? errors : undefined,
    });

  } catch (error: any) {
    console.error('Error in POST /api/onboarding/complete:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
