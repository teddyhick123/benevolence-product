import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabase';
import { createTaxCarryforwardSchema } from '@/lib/schemas/tax';
import { validateRequest } from '@/lib/validation';
import { z } from 'zod';

const applyCarryforwardApplicationsSchema = z.object({
  tax_year: z.number().int().min(1900).max(2100),
  applications: z.array(z.object({
    carryforward_id: z.string().uuid(),
    amount_applied: z.number().positive(),
    notes: z.string().max(1000).optional().nullable(),
  })),
});

/**
 * GET /api/portfolio/[id]/tax/carryforwards
 * Get all active carryforwards for a portfolio
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
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

  // Use active carryforwards view
  const { data, error } = await sb
    .from('v_active_carryforwards')
    .select('*')
    .eq('portfolio_id', portfolio_id)
    .order('expires_tax_year', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { data: data ?? [] },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * POST /api/portfolio/[id]/tax/carryforwards
 * Create a new carryforward (typically done automatically, but can be manual)
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
  const validation = await validateRequest(req, createTaxCarryforwardSchema);
  if (!validation.success) {
    return validation.response;
  }

  const validated = validation.data;

  // Ensure portfolio_id matches
  if (validated.portfolio_id !== portfolio_id) {
    return NextResponse.json(
      { error: 'Portfolio ID mismatch' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Insert carryforward
  const { data: created, error: insertErr } = await sb
    .from('tax_carryforwards')
    .insert(validated)
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
 * PATCH /api/portfolio/[id]/tax/carryforwards
 * Persist carryforward applications for a tax year.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const sb = await supabasePublic();

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

  const validation = await validateRequest(req, applyCarryforwardApplicationsSchema);
  if (!validation.success) {
    return validation.response;
  }

  const { tax_year, applications } = validation.data;
  const { data, error } = await sb.rpc('replace_tax_carryforward_applications', {
    p_portfolio_id: portfolio_id,
    p_tax_year: tax_year,
    p_applications: applications,
  });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { data },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
