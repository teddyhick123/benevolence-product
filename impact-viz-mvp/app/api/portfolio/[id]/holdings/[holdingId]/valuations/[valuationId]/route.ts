import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { updateValuationSchema } from '@/lib/schemas/investment';

const getSupabase = createSupabaseServerClient;

/**
 * PATCH /api/portfolio/[id]/holdings/[holdingId]/valuations/[valuationId]
 * Update an existing valuation
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; holdingId: string; valuationId: string }> }
) {
  try {
    const { id: portfolioId, holdingId, valuationId } = await params;
    const body = await req.json();
    const supabase = await getSupabase();

    // Validate request body (partial update allowed)
    const validated = updateValuationSchema.parse(body);

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

    // Verify valuation exists and belongs to the holding
    const { data: existingValuation, error: fetchError } = await supabase
      .from('holding_valuations')
      .select('id, holding_id')
      .eq('id', valuationId)
      .eq('holding_id', holdingId)
      .single();

    if (fetchError || !existingValuation) {
      return NextResponse.json(
        { error: 'Valuation not found' },
        { status: 404 }
      );
    }

    // Update valuation
    const updateData: any = {};
    if (validated.as_of_date !== undefined) updateData.as_of_date = validated.as_of_date;
    if (validated.nav !== undefined) updateData.nav = validated.nav;
    if (validated.units !== undefined) updateData.units = validated.units;
    if (validated.valuation_source !== undefined) updateData.valuation_source = validated.valuation_source;
    if (validated.notes !== undefined) updateData.notes = validated.notes;
    updateData.updated_at = new Date().toISOString();

    const { data: valuation, error } = await supabase
      .from('holding_valuations')
      .update(updateData)
      .eq('id', valuationId)
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation if date was changed
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Valuation already exists for this date' },
          { status: 409 }
        );
      }
      console.error('Error updating valuation:', error);
      return NextResponse.json({ error: 'Failed to update valuation' }, { status: 500 });
    }

    return NextResponse.json({ data: valuation });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Unexpected error in PATCH valuation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/portfolio/[id]/holdings/[holdingId]/valuations/[valuationId]
 * Delete a valuation
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; holdingId: string; valuationId: string }> }
) {
  try {
    const { id: portfolioId, holdingId, valuationId } = await params;
    const supabase = await getSupabase();

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

    // Verify valuation exists and belongs to the holding
    const { data: existingValuation, error: fetchError } = await supabase
      .from('holding_valuations')
      .select('id, holding_id')
      .eq('id', valuationId)
      .eq('holding_id', holdingId)
      .single();

    if (fetchError || !existingValuation) {
      return NextResponse.json(
        { error: 'Valuation not found' },
        { status: 404 }
      );
    }

    // Delete valuation
    const { error } = await supabase
      .from('holding_valuations')
      .delete()
      .eq('id', valuationId);

    if (error) {
      console.error('Error deleting valuation:', error);
      return NextResponse.json({ error: 'Failed to delete valuation' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Valuation deleted' });
  } catch (error) {
    console.error('Unexpected error in DELETE valuation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
