// app/api/recommendations/[id]/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

// PUT /api/recommendations/[id] - Update a recommendation
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();

  try {
    const body = await req.json();

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: cacheHeaders() }
      );
    }

    // Get the recommendation to check portfolio ownership
    const { data: rec, error: recError } = await supabase
      .from('portfolio_recommendations')
      .select('portfolio_id')
      .eq('id', id)
      .single();

    if (recError || !rec) {
      return NextResponse.json(
        { error: 'Recommendation not found' },
        { status: 404, headers: cacheHeaders() }
      );
    }

    // Verify user has owner role for this portfolio
    const { data: member } = await supabase
      .from('portfolio_members')
      .select('role')
      .eq('portfolio_id', rec.portfolio_id)
      .eq('user_id', user.id)
      .single();

    const { data: isAdmin } = await supabase.rpc('is_admin');

    if (!isAdmin && (!member || member.role !== 'owner')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403, headers: cacheHeaders() }
      );
    }

    const { data, error } = await supabase
      .from('portfolio_recommendations')
      .update({
        organization_name: body.organization_name,
        website: body.website,
        sector: body.sector,
        ein: body.ein,
        location: body.location,
        description: body.description,
        impact_focus: body.impact_focus,
        accreditation: body.accreditation,
        contact_info: body.contact_info,
        min_investment: body.min_investment,
        max_investment: body.max_investment,
        order_index: body.order_index,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { headers: cacheHeaders() });
  } catch (error: any) {
    console.error('Failed to update recommendation:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update recommendation' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}

// DELETE /api/recommendations/[id] - Archive a recommendation
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();

  try {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: cacheHeaders() }
      );
    }

    // Get the recommendation to check portfolio ownership
    const { data: rec, error: recError } = await supabase
      .from('portfolio_recommendations')
      .select('portfolio_id')
      .eq('id', id)
      .single();

    if (recError || !rec) {
      return NextResponse.json(
        { error: 'Recommendation not found' },
        { status: 404, headers: cacheHeaders() }
      );
    }

    // Verify user has owner role for this portfolio
    const { data: member } = await supabase
      .from('portfolio_members')
      .select('role')
      .eq('portfolio_id', rec.portfolio_id)
      .eq('user_id', user.id)
      .single();

    const { data: isAdmin } = await supabase.rpc('is_admin');

    if (!isAdmin && (!member || member.role !== 'owner')) {
      return NextResponse.json(
        { error: 'Insufficient permissions' },
        { status: 403, headers: cacheHeaders() }
      );
    }

    // Archive instead of hard delete
    const { data, error } = await supabase
      .from('portfolio_recommendations')
      .update({
        status: 'archived',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { headers: cacheHeaders() });
  } catch (error: any) {
    console.error('Failed to archive recommendation:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to archive recommendation' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}
