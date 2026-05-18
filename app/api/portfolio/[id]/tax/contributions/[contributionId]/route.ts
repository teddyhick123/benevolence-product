import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabase';
import { updateTaxContributionSchema } from '@/lib/schemas/tax';
import { validateRequest } from '@/lib/validation';

/**
 * GET /api/portfolio/[id]/tax/contributions/[contributionId]
 * Get a specific tax contribution
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string; contributionId: string }> }
) {
  const { id: portfolio_id, contributionId } = await ctx.params;
  const sb = await supabasePublic();

  const { data: canView, error: canViewErr } = await sb.rpc('can_view_portfolio', {
    p_portfolio_id: portfolio_id,
  });

  if (canViewErr || !canView) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { data, error } = await sb
    .from('v_tax_contributions_enriched')
    .select('*')
    .eq('id', contributionId)
    .eq('portfolio_id', portfolio_id)
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!data) {
    return NextResponse.json(
      { error: 'Contribution not found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { data },
    { headers: { 'Cache-Control': 'private, s-maxage=60' } }
  );
}

/**
 * PUT /api/portfolio/[id]/tax/contributions/[contributionId]
 * Update a specific tax contribution
 */
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string; contributionId: string }> }
) {
  const { id: portfolio_id, contributionId } = await ctx.params;
  const sb = await supabasePublic();

  // Check edit permissions
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', {
    p_portfolio_id: portfolio_id,
  });

  if (canEditErr) {
    return NextResponse.json(
      { error: canEditErr.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!canEdit) {
    return NextResponse.json(
      { error: 'Not authorized' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Validate request body
  const validation = await validateRequest(req, updateTaxContributionSchema);
  if (!validation.success) {
    return validation.response;
  }

  const validated = validation.data;

  // Update tax contribution
  const { data: updated, error: updateErr } = await sb
    .from('tax_contributions')
    .update(validated)
    .eq('id', contributionId)
    .eq('portfolio_id', portfolio_id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json(
      { error: updateErr.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Fetch enriched version
  const { data: enriched } = await sb
    .from('v_tax_contributions_enriched')
    .select('*')
    .eq('id', updated.id)
    .single();

  return NextResponse.json(
    { data: enriched ?? updated },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * DELETE /api/portfolio/[id]/tax/contributions/[contributionId]
 * Delete a specific tax contribution
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string; contributionId: string }> }
) {
  const { id: portfolio_id, contributionId } = await ctx.params;
  const sb = await supabasePublic();

  // Check if user is owner (only owners can delete)
  const { data: membership } = await sb
    .from('portfolio_members')
    .select('role')
    .eq('portfolio_id', portfolio_id)
    .eq('user_id', (await sb.auth.getUser()).data.user?.id)
    .single();

  if (!membership || membership.role !== 'owner') {
    return NextResponse.json(
      { error: 'Only portfolio owners can delete contributions' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { error: deleteErr } = await sb
    .from('tax_contributions')
    .delete()
    .eq('id', contributionId)
    .eq('portfolio_id', portfolio_id);

  if (deleteErr) {
    return NextResponse.json(
      { error: deleteErr.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { success: true },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
