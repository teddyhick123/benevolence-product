import { NextRequest, NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabase';
import { charitiesLimiter, getIP } from '@/lib/rate-limit';
import { rateLimitExceeded } from '@/lib/rate-limit-response';

/**
 * GET /api/charities
 * Search and list charities with advanced filtering, sorting, and pagination
 *
 * Query Parameters:
 * - q: Search query (searches name, mission, description)
 * - sector: Filter by sector
 * - state: Filter by state
 * - min_rating: Minimum Charity Navigator rating (0-100)
 * - max_rating: Maximum Charity Navigator rating (0-100)
 * - min_revenue: Minimum annual revenue
 * - max_revenue: Maximum annual revenue
 * - impact_focus: Filter by impact focus areas (can be comma-separated)
 * - sort: Sort order (relevance | rating | revenue | name) - default: relevance
 * - page: Page number (default: 1)
 * - limit: Results per page (default: 20, max: 100)
 * - portfolio_id: If provided, only show charities in this portfolio
 */
export async function GET(req: NextRequest) {
  // Rate-limit per IP — protects 2M-row table from scraping
  // Skip gracefully if Redis is not configured (local dev)
  if (process.env.UPSTASH_REDIS_REST_URL) {
    const ip = getIP(req);
    const { success, reset, remaining, limit } = await charitiesLimiter.limit(ip);
    if (!success) return rateLimitExceeded(reset, remaining, limit);
  }

  const sb = await supabasePublic();
  const url = new URL(req.url);

  // Parse query parameters
  const searchQuery = url.searchParams.get('q') || '';
  const sector = url.searchParams.get('sector');
  const state = url.searchParams.get('state');
  const minRating = url.searchParams.get('min_rating');
  const maxRating = url.searchParams.get('max_rating');
  const minRevenue = url.searchParams.get('min_revenue');
  const maxRevenue = url.searchParams.get('max_revenue');
  const impactFocus = url.searchParams.get('impact_focus')?.split(',').filter(Boolean);
  const sortBy = url.searchParams.get('sort') || 'relevance';
  const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '20')));
  const portfolioId = url.searchParams.get('portfolio_id');

  try {
    // If portfolio_id is provided, show only charities in that portfolio
    if (portfolioId) {
      return await getPortfolioCharities(sb, portfolioId, page, limit);
    }

    // Build base query
    let query = sb
      .from('charities')
      .select('*', { count: 'exact' })
      .eq('is_active', true);

    // Full-text search if query provided
    if (searchQuery) {
      // Use PostgreSQL full-text search on search_vector
      query = query.textSearch('search_vector', searchQuery, {
        type: 'websearch',
        config: 'english',
      });
    }

    // Apply filters
    if (state) {
      query = query.eq('state', state);
    }

    // Rating filter on charity_navigator_score (simple numeric column)
    if (minRating) {
      query = query.gte('charity_navigator_score', parseInt(minRating));
    }
    if (maxRating) {
      query = query.lte('charity_navigator_score', parseInt(maxRating));
    }

    // Revenue filters
    if (minRevenue) {
      query = query.gte('total_revenue', parseFloat(minRevenue));
    }
    if (maxRevenue) {
      query = query.lte('total_revenue', parseFloat(maxRevenue));
    }

    // Sorting
    switch (sortBy) {
      case 'rating':
        query = query.order('charity_navigator_score', { ascending: false, nullsFirst: false });
        break;
      case 'revenue':
        query = query.order('total_revenue', { ascending: false, nullsFirst: false });
        break;
      case 'name':
        query = query.order('name', { ascending: true });
        break;
      case 'relevance':
      default:
        // For text search, results are already ordered by relevance
        // For non-search queries, order by created_at (most recent first)
        if (!searchQuery) {
          query = query.order('created_at', { ascending: false });
        }
        break;
    }

    // Pagination
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    // Execute query
    const { data: charities, error, count } = await query;

    if (error) {
      console.error('Error fetching charities:', error);
      return NextResponse.json(
        { error: 'Failed to fetch charities' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const totalPages = count ? Math.ceil(count / limit) : 0;

    return NextResponse.json(
      {
        data: {
          charities,
          total: count,
          page,
          pages: totalPages,
          limit,
        },
      },
      { headers: { 'Cache-Control': 'public, s-maxage=300' } } // Cache for 5 minutes
    );
  } catch (err: any) {
    console.error('Error in charities API:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}

/**
 * Helper: Get charities for a specific portfolio (My Portfolio view)
 */
async function getPortfolioCharities(
  sb: any,
  portfolioId: string,
  page: number,
  limit: number
) {
  // Check if user has access to this portfolio
  const { data: canView, error: canViewErr } = await sb.rpc('can_view_portfolio', {
    p_portfolio_id: portfolioId,
  });

  if (canViewErr || !canView) {
    return NextResponse.json(
      { error: 'Not authorized to view this portfolio' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const offset = (page - 1) * limit;

  const { data, error, count } = await sb
    .from('portfolio_charities')
    .select(`
      id, status, added_by, created_at, notes, min_investment, max_investment,
      charity:charities(*)
    `, { count: 'exact' })
    .eq('portfolio_id', portfolioId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Error fetching portfolio charities:', error);
    return NextResponse.json(
      { error: 'Failed to fetch portfolio charities' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const charities = data?.map((rec: any) => ({
    ...rec.charity,
    portfolio_metadata: {
      entry_id: rec.id,
      status: rec.status,
      added_by: rec.added_by,
      added_at: rec.created_at,
      notes: rec.notes,
      min_investment: rec.min_investment,
      max_investment: rec.max_investment,
    },
  }));

  const totalPages = count ? Math.ceil(count / limit) : 0;

  return NextResponse.json(
    {
      data: {
        charities,
        total: count,
        page,
        pages: totalPages,
        limit,
        portfolio_id: portfolioId,
      },
    },
    { headers: { 'Cache-Control': 'private, s-maxage=60' } }
  );
}

/**
 * POST /api/charities
 * Create a new charity in the global database
 * (Typically called when importing from ProPublica or manual entry)
 */
export async function POST(req: Request) {
  const sb = await supabasePublic();

  try {
    const body = await req.json();

    const {
      ein,
      name,
      website,
      ntee_code,
      address_line1,
      city,
      state,
      zip,
      country,
      mission,
      total_revenue,
      total_expenses,
      net_assets,
      email,
      phone,
      deductibility_code,
    } = body;

    // Validate required fields
    if (!ein || !name) {
      return NextResponse.json(
        { error: 'EIN and name are required' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Check if charity already exists
    const { data: existing } = await sb
      .from('charities')
      .select('id')
      .eq('ein', ein)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: 'Charity with this EIN already exists', charity_id: existing.id },
        { status: 409, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Insert new charity
    const { data: charity, error } = await sb
      .from('charities')
      .insert({
        ein,
        name,
        website,
        ntee_code,
        address_line1,
        city,
        state,
        zip,
        country: country || 'US',
        mission,
        total_revenue,
        total_expenses,
        net_assets,
        email,
        phone,
        deductibility_code,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating charity:', error);
      return NextResponse.json(
        { error: 'Failed to create charity' },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      { data: charity },
      { status: 201, headers: { 'Cache-Control': 'no-store' } }
    );
  } catch (err: any) {
    console.error('Error in charity creation:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
