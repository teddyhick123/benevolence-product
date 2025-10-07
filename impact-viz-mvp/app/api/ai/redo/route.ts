import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AIActionExecutor } from '@/lib/ai-action-executor';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

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

    // Parse request
    const body = await req.json();
    const { actionId } = body;

    if (!actionId) {
      return NextResponse.json(
        { error: 'actionId required' },
        { status: 400 }
      );
    }

    const sb = supabaseService();
    const executor = new AIActionExecutor(sb as any);

    // Redo action
    const result = await executor.redoAction(actionId);

    return NextResponse.json({
      success: true,
      result,
    });

  } catch (error: any) {
    console.error('Redo error:', error);
    return NextResponse.json(
      { error: error.message || 'Redo failed' },
      { status: 500 }
    );
  }
}
