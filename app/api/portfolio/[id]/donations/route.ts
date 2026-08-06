import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { donationQuerySchema } from '@/lib/schemas/donation';

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

/**
 * GET /api/portfolio/[id]/donations
 * Get donation holdings for a portfolio with filtering and sorting
 * Returns individual donations plus portfolio-level summary
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: portfolioId } = await params;
    const supabase = await getSupabase();

    // Parse and validate query parameters
    const { searchParams } = new URL(req.url);
    const queryParams = {
      portfolio_id: portfolioId,
      status: searchParams.get('status') || undefined,
      min_amount: searchParams.get('min_amount') || undefined,
      max_amount: searchParams.get('max_amount') || undefined,
      has_tax_contribution: searchParams.get('has_tax_contribution') || undefined,
      sort_by: searchParams.get('sort_by') || 'created_at',
      sort_order: searchParams.get('sort_order') || 'desc',
      limit: searchParams.get('limit') || '50',
      offset: searchParams.get('offset') || '0',
    };

    const validated = donationQuerySchema.parse(queryParams);

    // Verify user has access to this portfolio
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: canView, error: canViewErr } = await supabase.rpc('can_view_portfolio', {
      p_portfolio_id: portfolioId,
    });
    if (canViewErr) return json({ error: canViewErr.message }, { status: 500 });
    if (!canView) return json({ error: 'Portfolio not found or access denied' }, { status: 403 });

    const { data: linkedRows, error: linkedRowsError } = await supabase
      .from('holding_contributions')
      .select('holding_id')
      .eq('portfolio_id', portfolioId)
      .not('holding_id', 'is', null)
      .not('tax_contribution_id', 'is', null);
    if (linkedRowsError) return json({ error: linkedRowsError.message }, { status: 500 });
    const linkedHoldingIds = [...new Set((linkedRows ?? []).map(row => row.holding_id).filter(Boolean))] as string[];

    // Donations own no direct tax-contribution relationship. Embed tax rows only
    // through the canonical holding_contributions junction.
    let query = supabase
      .from('holdings')
      .select('*, holding_contributions(tax_contribution_id, tax_contributions(*))', { count: 'exact' })
      .eq('portfolio_id', portfolioId)
      .eq('asset_type', 'donation');

    // Apply filters
    if (validated.status) {
      query = query.eq('status', validated.status);
    }

    if (validated.min_amount !== undefined) {
      query = query.gte('funds_allocated', validated.min_amount);
    }

    if (validated.max_amount !== undefined) {
      query = query.lte('funds_allocated', validated.max_amount);
    }

    // Filter by tax contribution linkage
    if (validated.has_tax_contribution === true) {
      query = query.in('id', linkedHoldingIds.length > 0
        ? linkedHoldingIds
        : ['00000000-0000-0000-0000-000000000000']);
    } else if (validated.has_tax_contribution === false && linkedHoldingIds.length > 0) {
      query = query.not('id', 'in', `(${linkedHoldingIds.join(',')})`);
    }

    // Apply sorting
    const sortColumn = validated.sort_by;
    const ascending = validated.sort_order === 'asc';
    query = query.order(sortColumn, { ascending });

    // Apply pagination
    query = query.range(validated.offset, validated.offset + validated.limit - 1);

    const { data: donations, error, count } = await query;

    if (error) {
      console.error('Error fetching donations:', error);
      return json(
        { error: 'Failed to fetch donations' },
        { status: 500 }
      );
    }

    // Fetch portfolio-level summary
    const { data: summary, error: summaryError } = await supabase
      .from('v_portfolio_donation_summary')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .single();
    if (summaryError && summaryError.code !== 'PGRST116') {
      return json({ error: summaryError.message }, { status: 500 });
    }

    const responseDonations = (donations ?? []).map(donation => ({
      ...donation,
      tax_contributions: (donation.holding_contributions ?? [])
        .map(link => link.tax_contributions)
        .filter(Boolean),
    }));

    return json({
      data: responseDonations,
      count: count || 0,
      summary: summary || null,
      pagination: {
        limit: validated.limit,
        offset: validated.offset,
        total: count || 0,
      },
    });
  } catch (error: any) {
    if (error?.name === 'ZodError') {
      return json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Unexpected error in GET donations:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
