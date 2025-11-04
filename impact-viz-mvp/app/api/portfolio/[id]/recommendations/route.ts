// app/api/portfolio/[id]/recommendations/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

// GET /api/portfolio/[id]/recommendations - Fetch all recommendations for a portfolio
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const supabase = await createSupabaseServerClient();

  try {
    const { data, error } = await supabase
      .from('portfolio_recommendations')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .eq('status', 'active')
      .order('order_index', { ascending: true })
      .order('recommended_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ data: data || [] }, { headers: cacheHeaders() });
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
  const supabase = await createSupabaseServerClient();

  try {
    const body = await req.json();

    // Get current user for recommended_by field
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401, headers: cacheHeaders() }
      );
    }

    // Verify user has owner role for this portfolio
    const { data: member } = await supabase
      .from('portfolio_members')
      .select('role')
      .eq('portfolio_id', portfolio_id)
      .eq('user_id', user.id)
      .single();

    const { data: isAdmin } = await supabase.rpc('is_admin');

    if (!isAdmin && (!member || member.role !== 'owner')) {
      return NextResponse.json(
        { error: 'Insufficient permissions. Only owners can add recommendations.' },
        { status: 403, headers: cacheHeaders() }
      );
    }

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
