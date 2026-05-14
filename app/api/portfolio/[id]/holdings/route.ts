import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabase';
import { createHoldingSchema } from '@/lib/schemas/portfolio';
import { validateRequest } from '@/lib/validation';

function normalizeHoldingStatus(status: string | null | undefined): string | null {
  if (!status) return null;
  const map: Record<string, string> = {
    Active: 'active',
    Pipeline: 'pending',
    Exited: 'exited',
    'On Hold': 'committed',
  };
  return map[status] ?? status;
}

function normalizeAssetType(assetType: string | null | undefined): string | null {
  if (!assetType) return null;
  const map: Record<string, string> = {
    equity_investment: 'equity',
    private_equity_investment: 'private_equity',
    venture_capital_investment: 'private_equity',
    debt_investment: 'fixed_income',
    impact_bond: 'fixed_income',
    conservation_investment: 'other',
    pri: 'program_related_investment',
    mri: 'mission_related_investment',
    real_estate_donation: 'real_estate',
    qcd_distribution: 'cash_equivalent',
    cryptocurrency_donation: 'cryptocurrency',
    artwork_collectible_donation: 'other',
  };
  return map[assetType] ?? assetType;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get('limit') ?? 50);
  const rawOffset = Number(url.searchParams.get('offset') ?? 0);
  const limit = Math.max(0, Math.min(Number.isFinite(rawLimit) ? rawLimit : 50, 200));
  const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);

  const sb = await supabasePublic();

  // Explicit auth check — RLS blocks unauthenticated reads, but we should return
  // a clear 401 rather than an empty 200 for unauthenticated requests.
  const { data: { user } } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }
  const { data, error, count } = await sb
    .from('v_holdings')
    .select(`
      id,
      portfolio_id,
      investee_id,
      name,
      status,
      asset_type,
      funds_allocated,
      as_of,
      sector,
      country,
      custodian,
      valuation_method,
      created_at,
      updated_at
    `, { count: 'exact' })
    .eq('portfolio_id', portfolio_id)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });

  return NextResponse.json({
    data: data ?? [],
    count: count ?? 0,
    nextOffset: (count ?? 0) > offset + limit ? offset + limit : null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;

  const sb = await supabasePublic();

  // Gate with can_edit_portfolio to produce a clear 403 before relying on RLS errors
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) {
    return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
  if (!canEdit) {
    return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  // Validate request body
  const validation = await validateRequest(req, createHoldingSchema);
  if (!validation.success) {
    return validation.response;
  }

  const validated = validation.data;

  // Handle legacy nav field by preferring funds_allocated
  const funds_allocated = validated.funds_allocated ?? validated.nav ?? null;

  // Handle date parsing for as_of field (accepts as_of or legacy as_of_date)
  let as_of: string | null = null;
  const rawAsOf = validated.as_of ?? validated.as_of_date ?? null;
  if (rawAsOf) {
    const d = new Date(rawAsOf);
    if (!isNaN(d.getTime())) {
      as_of = d.toISOString().slice(0, 10); // date column expects YYYY-MM-DD
    }
  }

  const insertRow: any = {
    portfolio_id,
    name: validated.name,
    status: normalizeHoldingStatus(validated.status),
    asset_type: normalizeAssetType(validated.asset_type),
    custodian: validated.custodian ?? null,
    valuation_method: validated.valuation_method ?? null,
    sector: validated.sector ?? null,
    country: validated.country ?? null,
    investee_id: validated.investee_id ?? null,
    funds_allocated,
    as_of,
  };

  const { data: inserted, error: insErr } = await sb
    .from('holdings')
    .insert(insertRow)
    .select('id')
    .single();

  if (insErr) {
    return NextResponse.json({ error: insErr.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }

  const { data: created, error: fetchErr } = await sb
    .from('v_holdings')
    .select(`
      id,
      portfolio_id,
      investee_id,
      name,
      status,
      asset_type,
      funds_allocated,
      as_of,
      sector,
      country,
      custodian,
      valuation_method,
      created_at,
      updated_at
    `)
    .eq('id', inserted.id)
    .single();

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }

  return NextResponse.json({ data: created }, { headers: { 'Cache-Control': 'no-store' } });
}
