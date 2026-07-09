import { NextResponse } from 'next/server';
import { supabasePublic, createAdminClient } from '@/lib/supabase';
import { createTaxProfileSchema, updateTaxProfileSchema } from '@/lib/schemas/tax';
import { validateRequest } from '@/lib/validation';

/**
 * GET /api/portfolio/[id]/tax/profile?year=2024
 * Get tax profile for a specific year
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year') || new Date().getFullYear());

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
    .from('tax_profiles')
    .select('*')
    .eq('portfolio_id', portfolio_id)
    .eq('tax_year', year)
    .maybeSingle();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!data) {
    // Return null if no profile exists for this year
    return NextResponse.json(
      { data: null },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { data },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * POST /api/portfolio/[id]/tax/profile
 * Create a new tax profile
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
  const validation = await validateRequest(req, createTaxProfileSchema);
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

  // Insert tax profile
  const { data: created, error: insertErr } = await sb
    .from('tax_profiles')
    .insert({
      portfolio_id: validated.portfolio_id,
      tax_year: validated.tax_year,
      filing_status: validated.filing_status ?? null,
      estimated_agi: validated.estimated_agi ?? null,
      carryforward_from_prior: validated.carryforward_from_prior ?? 0,
    })
    .select()
    .single();

  if (insertErr) {
    return NextResponse.json(
      { error: insertErr.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Always ensure the canonical tax_years row exists for downstream tax planning.
  const adminClient = createAdminClient();
  const { error: taxYearError } = await adminClient
    .from('tax_years')
    .upsert({
      portfolio_id: created.portfolio_id,
      tax_year: created.tax_year,
      adjusted_gross_income: created.estimated_agi ?? null,
      filing_status: created.filing_status ?? null,
    }, {
      onConflict: 'portfolio_id,tax_year'
    });

  if (taxYearError) {
    const { error: rollbackError } = await sb
      .from('tax_profiles')
      .delete()
      .eq('id', created.id)
      .eq('portfolio_id', portfolio_id);
    return NextResponse.json(
      { error: taxYearError.message, rollback_error: rollbackError?.message ?? null },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { data: created },
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  );
}

/**
 * PUT /api/portfolio/[id]/tax/profile?year=2024
 * Update an existing tax profile
 */
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year') || new Date().getFullYear());

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
  const validation = await validateRequest(req, updateTaxProfileSchema);
  if (!validation.success) {
    return validation.response;
  }

  const validated = validation.data;

  const { data: existing, error: existingErr } = await sb
    .from('tax_profiles')
    .select('*')
    .eq('portfolio_id', portfolio_id)
    .eq('tax_year', year)
    .single();

  if (existingErr || !existing) {
    return NextResponse.json(
      { error: existingErr?.message ?? 'Tax profile not found' },
      { status: existingErr ? 500 : 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Update tax profile
  const { data: updated, error: updateErr } = await sb
    .from('tax_profiles')
    .update(validated)
    .eq('portfolio_id', portfolio_id)
    .eq('tax_year', year)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json(
      { error: updateErr.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Always ensure the canonical tax_years row exists for downstream tax planning.
  const adminClient = createAdminClient();
  const { error: taxYearError } = await adminClient
    .from('tax_years')
    .upsert({
      portfolio_id,
      tax_year: year,
      adjusted_gross_income: updated.estimated_agi ?? null,
      filing_status: updated.filing_status ?? null,
    }, {
      onConflict: 'portfolio_id,tax_year'
    });

  if (taxYearError) {
    const { error: rollbackError } = await sb
      .from('tax_profiles')
      .update({
        filing_status: existing.filing_status,
        estimated_agi: existing.estimated_agi,
        carryforward_from_prior: existing.carryforward_from_prior,
      })
      .eq('id', existing.id)
      .eq('portfolio_id', portfolio_id);
    return NextResponse.json(
      { error: taxYearError.message, rollback_error: rollbackError?.message ?? null },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { data: updated },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
