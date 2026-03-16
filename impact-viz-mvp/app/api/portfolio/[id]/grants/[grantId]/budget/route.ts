import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';

export const runtime = 'nodejs';

type Params = { id: string; grantId: string };

/**
 * GET /api/portfolio/[id]/grants/[grantId]/budget
 * List budget items for a grant
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id: portfolioId, grantId } = await params;
    const supabase = await createServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('portfolio_members')
      .select('role')
      .eq('portfolio_id', portfolioId)
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }

    const sb = createAdminClient();
    const { data, error } = await sb
      .from('grant_budget_items')
      .select('*')
      .eq('grant_id', grantId)
      .order('category', { ascending: true });

    if (error) throw error;

    return NextResponse.json({ data: data || [] });
  } catch (err: any) {
    console.error('Error fetching budget items:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * POST /api/portfolio/[id]/grants/[grantId]/budget
 * Create a budget line item
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id: portfolioId, grantId } = await params;
    const supabase = await createServerClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('portfolio_members')
      .select('role')
      .eq('portfolio_id', portfolioId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin', 'editor'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await req.json();
    const { category, description, budgeted_amount } = body;

    if (!category || !description || budgeted_amount == null) {
      return NextResponse.json(
        { error: 'category, description, and budgeted_amount are required' },
        { status: 400 }
      );
    }

    const sb = createAdminClient();
    const { data, error } = await sb
      .from('grant_budget_items')
      .insert({
        grant_id: grantId,
        category,
        description,
        budgeted_amount: Number(budgeted_amount),
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data }, { status: 201 });
  } catch (err: any) {
    console.error('Error creating budget item:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * PATCH /api/portfolio/[id]/grants/[grantId]/budget?itemId=
 * Update a budget line item (e.g. actual_amount)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id: portfolioId, grantId } = await params;
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get('itemId');

    if (!itemId) {
      return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('portfolio_members')
      .select('role')
      .eq('portfolio_id', portfolioId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin', 'editor'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const body = await req.json();
    const allowedFields = ['category', 'description', 'budgeted_amount', 'actual_amount', 'notes'];
    const updates: Record<string, any> = {};
    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field];
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 });
    }

    const sb = createAdminClient();
    const { data, error } = await sb
      .from('grant_budget_items')
      .update(updates)
      .eq('id', itemId)
      .eq('grant_id', grantId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ data });
  } catch (err: any) {
    console.error('Error updating budget item:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

/**
 * DELETE /api/portfolio/[id]/grants/[grantId]/budget?itemId=
 * Delete a budget line item
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<Params> }
) {
  try {
    const { id: portfolioId, grantId } = await params;
    const { searchParams } = new URL(req.url);
    const itemId = searchParams.get('itemId');

    if (!itemId) {
      return NextResponse.json({ error: 'itemId is required' }, { status: 400 });
    }

    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from('portfolio_members')
      .select('role')
      .eq('portfolio_id', portfolioId)
      .eq('user_id', user.id)
      .single();

    if (!membership || !['owner', 'admin', 'editor'].includes(membership.role)) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    const sb = createAdminClient();
    const { error } = await sb
      .from('grant_budget_items')
      .delete()
      .eq('id', itemId)
      .eq('grant_id', grantId);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('Error deleting budget item:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
