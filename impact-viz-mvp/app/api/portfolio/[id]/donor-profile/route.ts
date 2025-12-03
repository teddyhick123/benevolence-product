import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabasePublic';
import { createDonorProfileSchema, updateDonorProfileSchema } from '@/lib/schemas/tax';
import { validateRequest } from '@/lib/validation';

/**
 * GET /api/portfolio/[id]/donor-profile
 * Get donor profile for a portfolio
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;

  const sb = await supabasePublic();

  const { data, error } = await sb
    .from('donor_profiles')
    .select('*')
    .eq('portfolio_id', portfolio_id)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!data) {
    // Return null if no donor profile exists
    return NextResponse.json(
      { data: null },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { data },
    { headers: { 'Cache-Control': 'private, s-maxage=60' } }
  );
}

/**
 * POST /api/portfolio/[id]/donor-profile
 * Create a new donor profile
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
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
  const validation = await validateRequest(req, createDonorProfileSchema);
  if (!validation.success) {
    return validation.response;
  }

  const validated = validation.data;

  // Insert donor profile
  const { data: created, error: insertErr } = await sb
    .from('donor_profiles')
    .insert({
      portfolio_id: portfolio_id,
      date_of_birth: validated.date_of_birth ?? null,
      filing_status: validated.filing_status ?? null,
      notes: validated.notes ?? null,
    })
    .select()
    .single();

  if (insertErr) {
    return NextResponse.json(
      { error: insertErr.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { data: created },
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * PUT /api/portfolio/[id]/donor-profile
 * Update existing donor profile
 */
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;

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
  const validation = await validateRequest(req, updateDonorProfileSchema);
  if (!validation.success) {
    return validation.response;
  }

  const validated = validation.data;

  // Update donor profile
  const { data: updated, error: updateErr } = await sb
    .from('donor_profiles')
    .update(validated)
    .eq('portfolio_id', portfolio_id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json(
      { error: updateErr.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { data: updated },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
