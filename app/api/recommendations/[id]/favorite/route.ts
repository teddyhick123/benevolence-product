// app/api/recommendations/[id]/favorite/route.ts
import { NextResponse } from 'next/server';
import { isAccessDenied, requireRecommendationAccess } from '@/lib/api/access';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

// POST /api/recommendations/[id]/favorite - Add to favorites
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireRecommendationAccess(id);
  if (isAccessDenied(access)) return access.response;
  const supabase = access.context.db;

  try {
    // Verify the recommendation is active before favoriting it.
    const { data: rec, error: recError } = await supabase
      .from('portfolio_recommendations')
      .select('id, portfolio_id')
      .eq('id', id)
      .eq('status', 'active')
      .single();

    if (recError || !rec) {
      return NextResponse.json(
        { error: 'Recommendation not found' },
        { status: 404, headers: cacheHeaders() }
      );
    }

    // Add to favorites (upsert to handle duplicate attempts gracefully)
    const { data, error } = await supabase
      .from('recommendation_favorites')
      .upsert({
        user_id: access.context.user.id,
        recommendation_id: id,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { headers: cacheHeaders() });
  } catch (error: any) {
    // Handle unique constraint violation gracefully
    if (error.code === '23505') {
      return NextResponse.json(
        { message: 'Already favorited' },
        { status: 200, headers: cacheHeaders() }
      );
    }

    return NextResponse.json(
      { error: error.message || 'Failed to add favorite' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}

// DELETE /api/recommendations/[id]/favorite - Remove from favorites
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireRecommendationAccess(id);
  if (isAccessDenied(access)) return access.response;
  const supabase = access.context.db;

  try {
    // Remove from favorites
    const { error } = await supabase
      .from('recommendation_favorites')
      .delete()
      .eq('user_id', access.context.user.id)
      .eq('recommendation_id', id);

    if (error) throw error;

    return NextResponse.json(
      { message: 'Removed from favorites' },
      { headers: cacheHeaders() }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to remove favorite' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}
