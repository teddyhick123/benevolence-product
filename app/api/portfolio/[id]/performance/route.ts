import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { investmentPerformanceQuerySchema } from '@/lib/schemas/investment';

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
 * GET /api/portfolio/[id]/performance
 * Get investment performance metrics for a portfolio
 * Queries the v_investment_performance view with filtering and sorting
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
      portfolio_id: portfolioId, // Always filter by portfolio from URL
      asset_type: searchParams.get('asset_type') || undefined,
      status: searchParams.get('status') || undefined,
      min_moic: searchParams.get('min_moic') || undefined,
      max_moic: searchParams.get('max_moic') || undefined,
      sort_by: searchParams.get('sort_by') || 'moic',
      sort_order: searchParams.get('sort_order') || 'desc',
      limit: searchParams.get('limit') || '50',
      offset: searchParams.get('offset') || '0',
    };

    const validated = investmentPerformanceQuerySchema.parse(queryParams);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: canView, error: canViewErr } = await supabase.rpc('can_view_portfolio', {
      p_portfolio_id: portfolioId,
    });
    if (canViewErr) return json({ error: canViewErr.message }, { status: 500 });
    if (!canView) return json({ error: 'Portfolio not found or access denied' }, { status: 403 });

    // Build query on the investment performance view
    let query = supabase
      .from('v_investment_performance')
      .select('*', { count: 'exact' })
      .eq('portfolio_id', portfolioId);

    // Apply filters
    if (validated.asset_type) {
      query = query.eq('asset_type', validated.asset_type);
    }

    if (validated.status) {
      query = query.eq('status', validated.status);
    }

    if (validated.min_moic !== undefined) {
      query = query.gte('moic', validated.min_moic);
    }

    if (validated.max_moic !== undefined) {
      query = query.lte('moic', validated.max_moic);
    }

    // Apply sorting
    const sortColumn = validated.sort_by;
    const ascending = validated.sort_order === 'asc';
    query = query.order(sortColumn, { ascending });

    // Apply pagination
    query = query.range(validated.offset, validated.offset + validated.limit - 1);

    const { data: investments, error, count } = await query;

    if (error) {
      console.error('Error fetching investment performance:', error);
      return json(
        { error: 'Failed to fetch investment performance' },
        { status: 500 }
      );
    }

    // Also fetch portfolio-level summary
    const { data: summary } = await supabase
      .from('v_portfolio_investment_summary')
      .select('*')
      .eq('portfolio_id', portfolioId)
      .single();

    return json({
      data: investments || [],
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
    console.error('Unexpected error in GET performance:', error);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
}
