import { NextResponse } from 'next/server';
import { getRequestDatabase } from '@/lib/api/server-client';
import { createTaxYearDetailSchema, updateTaxYearDetailSchema } from '@/lib/schemas/tax';
import { validateRequest } from '@/lib/api/validation';

/**
 * GET /api/portfolio/[id]/tax-years?year=2024
 * Get tax year data for a specific year
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const url = new URL(req.url);
  const year = url.searchParams.get('year');

  const sb = await getRequestDatabase();

  const { data: canView, error: canViewErr } = await sb.rpc('can_view_portfolio', {
    p_portfolio_id: portfolio_id,
  });

  if (canViewErr || !canView) {
    return NextResponse.json(
      { error: 'Forbidden' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (year) {
    // Get specific year
    const { data, error } = await sb
      .from('tax_years')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .eq('tax_year', Number(year))
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    if (!data) {
      // Return null if no tax year data exists
      return NextResponse.json(
        { data: null },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    return NextResponse.json(
      { data },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } else {
    // Get all years for this portfolio
    const { data, error } = await sb
      .from('tax_years')
      .select('*')
      .eq('portfolio_id', portfolio_id)
      .order('tax_year', { ascending: false });

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
}

/**
 * POST /api/portfolio/[id]/tax-years
 * Create a new tax year record
 */
export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const sb = await getRequestDatabase();

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
  const validation = await validateRequest(req, createTaxYearDetailSchema);
  if (!validation.success) {
    return validation.response;
  }

  const validated = validation.data;

  // Insert tax year
  const { data: created, error: insertErr } = await sb
    .from('tax_years')
    .insert({
      portfolio_id: portfolio_id,
      tax_year: validated.tax_year,
      adjusted_gross_income: validated.adjusted_gross_income ?? null,
      filing_status: validated.filing_status ?? null,
      standard_deduction: validated.standard_deduction ?? null,
      amt_exposure: validated.amt_exposure ?? null,
      amt_notes: validated.amt_notes ?? null,
      carryforward_from_prior_years: validated.carryforward_from_prior_years ?? null,
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
 * PUT /api/portfolio/[id]/tax-years?year=2024
 * Update an existing tax year record
 */
export async function PUT(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const { id: portfolio_id } = await ctx.params;
  const url = new URL(req.url);
  const year = Number(url.searchParams.get('year') || new Date().getFullYear());

  const sb = await getRequestDatabase();

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
  const validation = await validateRequest(req, updateTaxYearDetailSchema);
  if (!validation.success) {
    return validation.response;
  }

  const validated = validation.data;

  // Check if record exists
  const { data: existing } = await sb
    .from('tax_years')
    .select('id')
    .eq('portfolio_id', portfolio_id)
    .eq('tax_year', year)
    .maybeSingle();

  if (!existing) {
    // If no existing record, create one (upsert behavior)
    const { data: created, error: insertErr } = await sb
      .from('tax_years')
      .insert({
        portfolio_id: portfolio_id,
        tax_year: year,
        ...validated,
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

  // Update existing tax year
  const { data: updated, error: updateErr } = await sb
    .from('tax_years')
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

  return NextResponse.json(
    { data: updated },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
