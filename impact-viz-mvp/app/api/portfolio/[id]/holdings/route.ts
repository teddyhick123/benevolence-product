import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabasePublic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const url = new URL(req.url);
  const rawLimit = Number(url.searchParams.get('limit') ?? 50);
  const rawOffset = Number(url.searchParams.get('offset') ?? 0);
  const limit = Math.max(0, Math.min(Number.isFinite(rawLimit) ? rawLimit : 50, 200));
  const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);

  const sb = await supabasePublic();
  const { data, error, count } = await sb
    .from('v_holdings')
    .select(`
      id,
      portfolio_id,
      investee_id,
      name,
      status,
      asset_class,
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

  let body: any = {};
  try {
    body = await req.json();
  } catch (_) {
    // ignore, keep body as {}
  }

  const name = typeof body?.name === 'string' ? body.name.trim() : null;
  const status = typeof body?.status === 'string' ? body.status.trim() : null;
  const asset_class = typeof body?.asset_class === 'string' ? body.asset_class.trim() : null;
  const custodian = typeof body?.custodian === 'string' ? body.custodian.trim() : null;
  const valuation_method = typeof body?.valuation_method === 'string' ? body.valuation_method.trim() : null;
  const sector = typeof body?.sector === 'string' ? body.sector.trim() : null;
  const country = typeof body?.country === 'string' ? body.country.trim() : null;
  const investee_id = body?.investee_id ?? null;

  // funds_allocated: accept either funds_allocated or legacy nav
  let funds_allocated: number | null = null;
  if (body?.funds_allocated !== undefined && body?.funds_allocated !== null && body?.funds_allocated !== '') {
    const n = Number(body.funds_allocated);
    funds_allocated = Number.isFinite(n) ? n : null;
  } else if (body?.nav !== undefined) {
    const n = Number(body.nav);
    funds_allocated = Number.isFinite(n) ? n : null;
  }

  // as_of: accept YYYY-MM-DD or any parseable date (also accept legacy as_of_date)
  let as_of: string | null = null;
  const rawAsOf = (typeof body?.as_of === 'string' && body.as_of.trim()) ? body.as_of
                 : (typeof body?.as_of_date === 'string' && body.as_of_date.trim()) ? body.as_of_date
                 : null;
  if (rawAsOf) {
    const d = new Date(rawAsOf);
    if (!isNaN(d.getTime())) as_of = d.toISOString().slice(0, 10); // date column expects YYYY-MM-DD
  }

  const insertRow: any = {
    portfolio_id,
    name,
    status,
    asset_class,
    custodian,
    valuation_method,
    sector,
    country,
    investee_id,
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
      asset_class,
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