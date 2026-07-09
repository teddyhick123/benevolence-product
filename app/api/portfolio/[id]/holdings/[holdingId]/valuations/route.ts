import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { createValuationSchema } from '@/lib/schemas/investment';

const getSupabase = createSupabaseServerClient;

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
}

function normalizeValuationBody(body: any, holdingId: string) {
  return {
    ...body,
    holding_id: holdingId,
    valued_at: body.valued_at ?? body.as_of_date,
    value: body.value ?? body.nav,
    source: body.source ?? body.valuation_source ?? null,
    valuation_type: body.valuation_type ?? 'mark_to_market',
    currency: body.currency ?? 'USD',
  };
}

/**
 * GET /api/portfolio/[id]/holdings/[holdingId]/valuations
 * Get all valuations for a holding
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; holdingId: string }> }
) {
  try {
    const { id: portfolioId, holdingId } = await params;
    const supabase = await getSupabase();

    // Verify holding belongs to portfolio and user has access
    const { data: holding, error: holdingError } = await supabase
      .from('holdings')
      .select('id, name, portfolio_id')
      .eq('id', holdingId)
      .eq('portfolio_id', portfolioId)
      .single();

    if (holdingError || !holding) {
      return json(
        { error: 'Holding not found or access denied' },
        { status: 404 }
      );
    }

    // Get valuations ordered by date (newest first)
    const { data: valuations, error } = await supabase
      .from('holding_valuations')
      .select('*')
      .eq('holding_id', holdingId)
      .order('valued_at', { ascending: false });

    if (error) {
      console.error('Error fetching valuations:', error);
      return json({ error: 'Failed to fetch valuations' }, { status: 500 });
    }

    return json({
      data: valuations || [],
      count: valuations?.length || 0,
    });
  } catch (error) {
    console.error('Unexpected error in GET valuations:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/portfolio/[id]/holdings/[holdingId]/valuations
 * Create a new valuation
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; holdingId: string }> }
) {
  try {
    const { id: portfolioId, holdingId } = await params;
    const body = await req.json();
    const supabase = await getSupabase();

    // Validate request body
    const validated = createValuationSchema.parse(normalizeValuationBody(body, holdingId));

    // Verify holding belongs to portfolio and user can edit
    const { data: canEdit, error: canEditErr } = await supabase.rpc('can_edit_portfolio', {
      p_portfolio_id: portfolioId,
    });

    if (canEditErr || !canEdit) {
      return json(
        { error: 'Permission denied: cannot edit this portfolio' },
        { status: 403 }
      );
    }

    const { data: holding } = await supabase
      .from('holdings')
      .select('id')
      .eq('id', holdingId)
      .eq('portfolio_id', portfolioId)
      .single();

    if (!holding) {
      return json({ error: 'Holding not found' }, { status: 404 });
    }

    // Insert valuation
    const { data: valuation, error } = await supabase
      .from('holding_valuations')
      .insert({
        holding_id: validated.holding_id,
        valued_at: validated.valued_at,
        value: validated.value,
        currency: validated.currency,
        valuation_type: validated.valuation_type,
        source: validated.source ?? null,
        notes: validated.notes ?? null,
      })
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return json(
          { error: 'Valuation already exists for this date. Update existing valuation instead.' },
          { status: 409 }
        );
      }
      console.error('Error creating valuation:', error);
      return json({ error: 'Failed to create valuation' }, { status: 500 });
    }

    return json({ data: valuation }, { status: 201 });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Unexpected error in POST valuation:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
