import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AIActionExecutor } from '@/lib/ai-action-executor';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { aiRedoSchema } from '@/lib/schemas/ai';

export const runtime = 'nodejs';

function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { persistSession: false } }
  );
}

/**
 * POST /api/ai/redo
 * Redo a previously undone AI action
 */
export async function POST(req: NextRequest) {
  try {
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

    // Parse and validate request
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = aiRedoSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.format(),
        },
        { status: 400 }
      );
    }

    const { actionId } = validation.data;

    const sb = supabaseService();
    const executor = new AIActionExecutor(sb as any);

    // Redo action
    const result = await executor.redoAction(actionId);

    return NextResponse.json({
      success: true,
      result,
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Redo failed' },
      { status: 500 }
    );
  }
}
