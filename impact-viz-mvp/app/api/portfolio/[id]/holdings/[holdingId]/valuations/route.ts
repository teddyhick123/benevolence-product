import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { createValuationSchema } from '@/lib/schemas/investment';

const getSupabase = createSupabaseServerClient;

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
      return NextResponse.json(
        { error: 'Holding not found or access denied' },
        { status: 404 }
      );
    }

    // Get valuations ordered by date (newest first)
    const { data: valuations, error } = await supabase
      .from('holding_valuations')
      .select('*')
      .eq('holding_id', holdingId)
      .order('as_of_date', { ascending: false });

    if (error) {
      console.error('Error fetching valuations:', error);
      return NextResponse.json({ error: 'Failed to fetch valuations' }, { status: 500 });
    }

    return NextResponse.json({
      data: valuations || [],
      count: valuations?.length || 0,
    });
  } catch (error) {
    console.error('Unexpected error in GET valuations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
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
    const validated = createValuationSchema.parse({
      ...body,
      holding_id: holdingId, // Ensure holding_id matches URL
    });

    // Verify holding belongs to portfolio and user can edit
    const { data: canEdit } = await supabase.rpc('can_edit_portfolio', {
      p_portfolio_id: portfolioId,
      p_user_id: (await supabase.auth.getUser()).data.user?.id,
    });

    if (!canEdit) {
      return NextResponse.json(
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
      return NextResponse.json({ error: 'Holding not found' }, { status: 404 });
    }

    // Insert valuation
    const { data: valuation, error } = await supabase
      .from('holding_valuations')
      .insert({
        holding_id: validated.holding_id,
        as_of_date: validated.as_of_date,
        nav: validated.nav,
        units: validated.units ?? null,
        valuation_source: validated.valuation_source ?? null,
        notes: validated.notes ?? null,
      })
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Valuation already exists for this date. Update existing valuation instead.' },
          { status: 409 }
        );
      }
      console.error('Error creating valuation:', error);
      return NextResponse.json({ error: 'Failed to create valuation' }, { status: 500 });
    }

    return NextResponse.json({ data: valuation }, { status: 201 });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Unexpected error in POST valuation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
