// app/api/portfolio/[id]/recommendations/route.ts
import { NextResponse } from 'next/server';
import {
  isAccessDenied,
  requirePortfolioAccess,
  requirePortfolioManagerOrAppAdmin,
} from '@/lib/api/access';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

// GET /api/portfolio/[id]/recommendations - Fetch all recommendations for a portfolio
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id);
  if (isAccessDenied(access)) return access.response;
  const supabase = access.context.db;
  const { searchParams } = new URL(req.url);
  const favoritesOnly = searchParams.get('favorites') === 'true';

  try {
    // Get current user
    const { user } = access.context;

    // Base query for recommendations
    let query = supabase
      .from('portfolio_recommendations')
      .select(`
        *,
        recommendation_favorites!left(user_id)
      `)
      .eq('portfolio_id', portfolio_id)
      .eq('status', 'active');

    // If favorites_only filter is enabled, only return favorited recommendations
    if (favoritesOnly && user) {
      const { data: favoriteIds } = await supabase
        .from('recommendation_favorites')
        .select('recommendation_id')
        .eq('user_id', user.id);

      if (!favoriteIds || favoriteIds.length === 0) {
        return NextResponse.json({ data: [] }, { headers: cacheHeaders() });
      }

      query = query.in('id', favoriteIds.map(f => f.recommendation_id));
    }

    const { data, error } = await query
      .order('order_index', { ascending: true })
      .order('recommended_at', { ascending: false });

    if (error) throw error;

    // Transform data to include is_favorited and favorite_count
    const enrichedData = (data || []).map(rec => {
      const favorites = rec.recommendation_favorites || [];
      return {
        ...rec,
        is_favorited: user ? favorites.some((f: any) => f.user_id === user.id) : false,
        favorite_count: favorites.length,
        recommendation_favorites: undefined, // Remove the raw join data
      };
    });

    return NextResponse.json({ data: enrichedData }, { headers: cacheHeaders() });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch recommendations' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}

// POST /api/portfolio/[id]/recommendations - Create a new recommendation
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioManagerOrAppAdmin(portfolio_id);
  if (isAccessDenied(access)) return access.response;
  if (!access.context.isAppAdmin && access.context.role !== 'owner') {
    return NextResponse.json(
      { error: 'Insufficient permissions. Only owners can add recommendations.' },
      { status: 403, headers: cacheHeaders() }
    );
  }
  const supabase = access.context.db;

  try {
    const body = await req.json();

    // Get current user for recommended_by field
    const { user } = access.context;

    // Get current max order_index
    const { data: maxOrder } = await supabase
      .from('portfolio_recommendations')
      .select('order_index')
      .eq('portfolio_id', portfolio_id)
      .order('order_index', { ascending: false })
      .limit(1)
      .single();

    const nextOrderIndex = (maxOrder?.order_index ?? -1) + 1;

    const { data, error } = await supabase
      .from('portfolio_recommendations')
      .insert({
        portfolio_id,
        organization_name: body.organization_name,
        website: body.website || null,
        sector: body.sector || null,
        ein: body.ein || null,
        location: body.location || null,
        description: body.description || null,
        impact_focus: body.impact_focus || [],
        accreditation: body.accreditation || null,
        contact_info: body.contact_info || null,
        min_investment: body.min_investment || null,
        max_investment: body.max_investment || null,
        order_index: nextOrderIndex,
        recommended_by: user.id,
        status: 'active',
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { headers: cacheHeaders() });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to create recommendation' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}
