import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export const runtime = 'nodejs';

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * POST /api/portfolio/[id]/widgets/save-preview
 * Save a preview widget to the dashboard
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: portfolioId } = await params;

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
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: canEdit, error: canEditErr } = await supabase.rpc('can_edit_portfolio', {
      p_portfolio_id: portfolioId,
    });
    if (canEditErr) return json({ error: canEditErr.message }, { status: 500 });
    if (!canEdit) return json({ error: 'Access denied' }, { status: 403 });

    // Parse request body
    const body = await req.json();
    const { type, title, config, holding_id } = body;

    if (!type || !title) {
      return json(
        { error: 'type and title are required' },
        { status: 400 }
      );
    }

    // Use service role client for database operations
    const serviceClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!,
      { auth: { persistSession: false } }
    );

    // Determine which table to use based on whether holding_id is provided
    const table = holding_id ? 'holding_widgets' : 'widgets';

    // Get max position for ordering
    let maxPosition = -1;
    if (holding_id) {
      const { data: holding, error: holdingError } = await serviceClient
        .from('holdings')
        .select('id')
        .eq('id', holding_id)
        .eq('portfolio_id', portfolioId)
        .maybeSingle();
      if (holdingError) throw holdingError;
      if (!holding) return json({ error: 'Holding not found' }, { status: 404 });

      const { data: widgets, error: widgetsError } = await serviceClient
        .from('holding_widgets')
        .select('position')
        .eq('holding_id', holding_id)
        .order('position', { ascending: false })
        .limit(1);
      if (widgetsError) throw widgetsError;
      maxPosition = (widgets?.[0]?.position as number) ?? -1;
    } else {
      const { data: widgets, error: widgetsError } = await serviceClient
        .from('widgets')
        .select('position')
        .eq('portfolio_id', portfolioId)
        .order('position', { ascending: false })
        .limit(1);
      if (widgetsError) throw widgetsError;
      maxPosition = (widgets?.[0]?.position as number) ?? -1;
    }

    // Create the widget
    const widgetData = holding_id
      ? {
          holding_id,
          type,
          title,
          config: config || {},
          position: maxPosition + 1,
        }
      : {
          portfolio_id: portfolioId,
          type,
          title,
          config: config || {},
          position: maxPosition + 1,
        };

    const { data: widget, error } = await serviceClient
      .from(table)
      .insert(widgetData)
      .select()
      .single();

    if (error) {
      return json(
        { error: 'Failed to save widget' },
        { status: 500 }
      );
    }

    return json({ data: widget });

  } catch (error: any) {
    return json(
      { error: error.message || 'Failed to save widget' },
      { status: 500 }
    );
  }
}
