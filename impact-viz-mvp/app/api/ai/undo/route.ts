import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { AIActionExecutor } from '@/lib/ai-action-executor';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { aiUndoSchema } from '@/lib/schemas/ai';
import { aiLimiter } from '@/lib/rate-limit';
import { rateLimitExceeded } from '@/lib/rate-limit-response';

export const runtime = 'nodejs';

function supabaseService() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!,
    { auth: { persistSession: false } }
  );
}

/**
 * POST /api/ai/undo
 * Undo an AI action or batch of actions
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

    const { success, reset, remaining, limit } = await aiLimiter.limit(user.id);
    if (!success) return rateLimitExceeded(reset, remaining, limit);

    // Parse and validate request
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = aiUndoSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.format(),
        },
        { status: 400 }
      );
    }

    const { actionId, batchId } = validation.data;

    const sb = supabaseService();
    const executor = new AIActionExecutor(sb as any);

    // Undo action or batch (schema ensures at least one is defined)
    const result = batchId
      ? await executor.undoBatch(batchId)
      : await executor.undoAction(actionId!);

    return NextResponse.json({
      success: true,
      result,
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Undo failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ai/undo?portfolioId=xxx&limit=10
 * Get undo history for a portfolio
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const portfolioId = searchParams.get('portfolioId');
    const limit = parseInt(searchParams.get('limit') || '20');

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

    // Get action history
    const { data: actions, error } = await supabase
      .from('ai_actions')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    return NextResponse.json({
      actions: actions || [],
    });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to get undo history' },
      { status: 500 }
    );
  }
}
