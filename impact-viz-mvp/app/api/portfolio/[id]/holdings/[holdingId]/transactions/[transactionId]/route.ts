import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { updateTransactionSchema } from '@/lib/schemas/investment';

const getSupabase = createSupabaseServerClient;

/**
 * PATCH /api/portfolio/[id]/holdings/[holdingId]/transactions/[transactionId]
 * Update an existing transaction
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; holdingId: string; transactionId: string }> }
) {
  try {
    const { id: portfolioId, holdingId, transactionId } = await params;
    const body = await req.json();
    const supabase = await getSupabase();

    // Validate request body (partial update allowed)
    const validated = updateTransactionSchema.parse(body);

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

    // Verify transaction exists and belongs to the holding
    const { data: existingTransaction, error: fetchError } = await supabase
      .from('holding_transactions')
      .select('id, holding_id')
      .eq('id', transactionId)
      .eq('holding_id', holdingId)
      .single();

    if (fetchError || !existingTransaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Update transaction
    const updateData: any = {};
    if (validated.transaction_date !== undefined) updateData.transaction_date = validated.transaction_date;
    if (validated.transaction_type !== undefined) updateData.transaction_type = validated.transaction_type;
    if (validated.amount !== undefined) updateData.amount = validated.amount;
    if (validated.memo !== undefined) updateData.memo = validated.memo;
    updateData.updated_at = new Date().toISOString();

    const { data: transaction, error } = await supabase
      .from('holding_transactions')
      .update(updateData)
      .eq('id', transactionId)
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Transaction already exists with same date, type, and amount' },
          { status: 409 }
        );
      }
      console.error('Error updating transaction:', error);
      return NextResponse.json({ error: 'Failed to update transaction' }, { status: 500 });
    }

    return NextResponse.json({ data: transaction });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Unexpected error in PATCH transaction:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * DELETE /api/portfolio/[id]/holdings/[holdingId]/transactions/[transactionId]
 * Delete a transaction
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; holdingId: string; transactionId: string }> }
) {
  try {
    const { id: portfolioId, holdingId, transactionId } = await params;
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

    // Verify transaction exists and belongs to the holding
    const { data: existingTransaction, error: fetchError } = await supabase
      .from('holding_transactions')
      .select('id, holding_id')
      .eq('id', transactionId)
      .eq('holding_id', holdingId)
      .single();

    if (fetchError || !existingTransaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    // Delete transaction
    const { error } = await supabase
      .from('holding_transactions')
      .delete()
      .eq('id', transactionId);

    if (error) {
      console.error('Error deleting transaction:', error);
      return NextResponse.json({ error: 'Failed to delete transaction' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: 'Transaction deleted' });
  } catch (error) {
    console.error('Unexpected error in DELETE transaction:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
