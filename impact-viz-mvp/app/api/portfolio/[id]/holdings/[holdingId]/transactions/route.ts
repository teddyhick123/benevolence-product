import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { createTransactionSchema } from '@/lib/schemas/investment';

const getSupabase = createSupabaseServerClient;

/**
 * GET /api/portfolio/[id]/holdings/[holdingId]/transactions
 * Get all transactions for a holding
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

    // Get transactions ordered by date (newest first)
    const { data: transactions, error } = await supabase
      .from('holding_transactions')
      .select('*')
      .eq('holding_id', holdingId)
      .order('transaction_date', { ascending: false });

    if (error) {
      console.error('Error fetching transactions:', error);
      return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
    }

    return NextResponse.json({
      data: transactions || [],
      count: transactions?.length || 0,
    });
  } catch (error) {
    console.error('Unexpected error in GET transactions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/portfolio/[id]/holdings/[holdingId]/transactions
 * Create a new transaction
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
    const validated = createTransactionSchema.parse({
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

    // Insert transaction
    const { data: transaction, error } = await supabase
      .from('holding_transactions')
      .insert({
        holding_id: validated.holding_id,
        transaction_date: validated.transaction_date,
        transaction_type: validated.transaction_type,
        amount: validated.amount,
        memo: validated.memo ?? null,
      })
      .select()
      .single();

    if (error) {
      // Handle unique constraint violation
      if (error.code === '23505') {
        return NextResponse.json(
          { error: 'Transaction already exists with same date, type, and amount. Modify to avoid duplicates.' },
          { status: 409 }
        );
      }
      console.error('Error creating transaction:', error);
      return NextResponse.json({ error: 'Failed to create transaction' }, { status: 500 });
    }

    return NextResponse.json({ data: transaction }, { status: 201 });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Unexpected error in POST transaction:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
