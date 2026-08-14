import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/api/server-client';
import { updateValuationSchema } from '@/lib/schemas/investment';

const getSupabase = createServerClient;

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
}

function normalizeValuationBody(body: any) {
  return {
    ...body,
    valued_at: body.valued_at ?? body.as_of_date,
    value: body.value,
    source: body.source ?? body.valuation_source,
  };
}

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
    const validated = updateValuationSchema.parse(normalizeValuationBody(body));

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

    // Verify valuation exists and belongs to the holding
    const { data: existingValuation, error: fetchError } = await supabase
      .from('holding_valuations')
      .select('id, holding_id')
      .eq('id', valuationId)
      .eq('holding_id', holdingId)
      .single();

    if (fetchError || !existingValuation) {
      return json(
        { error: 'Valuation not found' },
        { status: 404 }
      );
    }

    // Update valuation
    const updateData: any = {};
    if (validated.valued_at !== undefined) updateData.valued_at = validated.valued_at;
    if (validated.value !== undefined) updateData.value = validated.value;
    if (validated.currency !== undefined) updateData.currency = validated.currency;
    if (validated.valuation_type !== undefined) updateData.valuation_type = validated.valuation_type;
    if (validated.source !== undefined) updateData.source = validated.source;
    if (validated.notes !== undefined) updateData.notes = validated.notes;

    const { data: valuation, error } = await supabase
      .from('holding_valuations')
      .update(updateData)
      .eq('id', valuationId)
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation if date was changed
      if (error.code === '23505') {
        return json(
          { error: 'Valuation already exists for this date' },
          { status: 409 }
        );
      }
      console.error('Error updating valuation:', error);
      return json({ error: 'Failed to update valuation' }, { status: 500 });
    }

    return json({ data: valuation });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Unexpected error in PATCH valuation:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
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
    const { data: canEdit, error: canEditErr } = await supabase.rpc('can_edit_portfolio', {
      p_portfolio_id: portfolioId,
    });

    if (canEditErr || !canEdit) {
      return json(
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
      return json(
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
      return json({ error: 'Failed to delete valuation' }, { status: 500 });
    }

    return json({ success: true, message: 'Valuation deleted' });
  } catch (error) {
    console.error('Unexpected error in DELETE valuation:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
