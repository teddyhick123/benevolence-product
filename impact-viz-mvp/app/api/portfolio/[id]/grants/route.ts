import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { grantQuerySchema } from '@/lib/schemas/grant';

const getSupabase = createSupabaseServerClient;

/**
 * GET /api/portfolio/[id]/grants
 * Get grant summaries for a portfolio with filtering and sorting
 * Queries the v_grants view and v_portfolio_grant_summary for aggregates
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
      asset_type: searchParams.get('asset_type') || undefined,
      grant_type: searchParams.get('grant_type') || undefined,
      grant_period_status: searchParams.get('grant_period_status') || undefined,
      renewal_eligible: searchParams.get('renewal_eligible') || undefined,
      sort_by: searchParams.get('sort_by') || 'name',
      sort_order: searchParams.get('sort_order') || 'asc',
      limit: searchParams.get('limit') || '50',
      offset: searchParams.get('offset') || '0',
    };

    const validated = grantQuerySchema.parse(queryParams);

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

    // Build query on the grants view
    let query = supabase
      .from('v_grants')
      .select('*', { count: 'exact' })
      .eq('portfolio_id', portfolioId);

    // Apply filters
    if (validated.asset_type) {
      query = query.eq('asset_type', validated.asset_type);
    }

    if (validated.grant_type) {
      query = query.eq('grant_type', validated.grant_type);
    }

    if (validated.grant_period_status) {
      query = query.eq('grant_period_status', validated.grant_period_status);
    }

    if (validated.renewal_eligible !== undefined) {
      query = query.eq('renewal_eligible', validated.renewal_eligible);
    }

    // Apply sorting
    const sortColumn = validated.sort_by;
    const ascending = validated.sort_order === 'asc';
    query = query.order(sortColumn, { ascending });

    // Apply pagination
    query = query.range(validated.offset, validated.offset + validated.limit - 1);

    const { data: grants, error, count } = await query;

    if (error) {
      console.error('Error fetching grants:', error);
      return NextResponse.json(
        { error: 'Failed to fetch grants' },
        { status: 500 }
      );
    }

    // Also fetch portfolio-level summary
    const { data: summary } = await supabase
      .from('v_portfolio_grant_summary')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .single();

    return NextResponse.json({
      data: grants || [],
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
    console.error('Unexpected error in GET grants:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
