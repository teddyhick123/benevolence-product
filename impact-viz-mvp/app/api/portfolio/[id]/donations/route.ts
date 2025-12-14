import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { donationQuerySchema } from '@/lib/schemas/donation';

const getSupabase = createSupabaseServerClient;

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
    const { data: portfolioAccess } = await supabase
      .from('portfolio_members')
      .select('portfolio_id')
      .eq('portfolio_id', portfolioId)
      .eq('user_id', (await supabase.auth.getUser()).data.user?.id)
      .single();

    if (!portfolioAccess) {
      return NextResponse.json(
        { error: 'Portfolio not found or access denied' },
        { status: 404 }
      );
    }

    // Build query on holdings table for donations
    // Optionally join with tax_contributions if needed
    let query = supabase
      .from('holdings')
      .select('*, tax_contributions(*)', { count: 'exact' })
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
      // Only donations with tax contributions
      query = query.not('tax_contributions', 'is', null);
    } else if (validated.has_tax_contribution === false) {
      // Only donations without tax contributions
      query = query.is('tax_contributions', null);
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
      return NextResponse.json(
        { error: 'Failed to fetch donations' },
        { status: 500 }
      );
    }

    // Fetch portfolio-level summary
    const { data: summary } = await supabase
      .from('v_portfolio_donation_summary')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .single();

    return NextResponse.json({
      data: donations || [],
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
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Unexpected error in GET donations:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
