// app/api/recommendations/[id]/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';
import { updateRecommendationSchema } from '@/lib/schemas/recommendations';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

// PUT /api/recommendations/[id] - Update a recommendation
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();

  try {
    // Parse and validate request body
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: cacheHeaders() });
    }

    const validation = updateRecommendationSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validation.error.format(),
        },
        { status: 400, headers: cacheHeaders() }
      );
    }

    const validated = validation.data;

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

    // Build update object from validated data (only include provided fields)
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    if (validated.organization_name !== undefined) updateData.organization_name = validated.organization_name;
    if (validated.website !== undefined) updateData.website = validated.website;
    if (validated.sector !== undefined) updateData.sector = validated.sector;
    if (validated.ein !== undefined) updateData.ein = validated.ein;
    if (validated.location !== undefined) updateData.location = validated.location;
    if (validated.description !== undefined) updateData.description = validated.description;
    if (validated.impact_focus !== undefined) updateData.impact_focus = validated.impact_focus;
    if (validated.accreditation !== undefined) updateData.accreditation = validated.accreditation;
    if (validated.contact_info !== undefined) updateData.contact_info = validated.contact_info;
    if (validated.min_investment !== undefined) updateData.min_investment = validated.min_investment;
    if (validated.max_investment !== undefined) updateData.max_investment = validated.max_investment;
    if (validated.order_index !== undefined) updateData.order_index = validated.order_index;

    const { data, error } = await supabase
      .from('portfolio_recommendations')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { headers: cacheHeaders() });
  } catch (error: any) {
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
    return NextResponse.json(
      { error: error.message || 'Failed to archive recommendation' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}
