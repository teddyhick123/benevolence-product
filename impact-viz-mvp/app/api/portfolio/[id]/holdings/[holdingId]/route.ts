// app/api/portfolio/[id]/holdings/[holdingId]/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

async function createSb() {
  const c = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => c.get(n)?.value,
        set: (n: string, v: string, o: any) => c.set({ name: n, value: v, ...o }),
        remove: (n: string, o: any) => c.set({ name: n, value: '', ...o }),
      },
    }
  );
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; holdingId: string }> }) {
  const { id: portfolio_id, holdingId } = await ctx.params;
  const sb = await createSb();

  // Permission gate — clearer error than raw RLS
  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  let body: any = {};
  try { body = await req.json(); } catch (_) {}

  // Normalize inputs (canonical snake_case columns)
  const patch: Record<string, any> = {};
  if (typeof body?.name === 'string') patch.name = body.name.trim() || null;
  if (typeof body?.status === 'string') patch.status = body.status.trim() || null;
  if (typeof body?.asset_class === 'string') patch.asset_class = body.asset_class.trim() || null;
  if (typeof body?.custodian === 'string') patch.custodian = body.custodian.trim() || null;
  if (typeof body?.valuation_method === 'string') patch.valuation_method = body.valuation_method.trim() || null;
  if (typeof body?.sector === 'string') patch.sector = body.sector.trim() || null;
  if (typeof body?.country === 'string') patch.country = body.country.trim() || null;
  if (body?.investee_id !== undefined) patch.investee_id = body.investee_id === '' ? null : body.investee_id;

  // funds_allocated: accept either funds_allocated or legacy nav
  if (body?.funds_allocated !== undefined) {
    const n = Number(body.funds_allocated);
    patch.funds_allocated = body.funds_allocated === '' ? null : (Number.isFinite(n) ? n : null);
  } else if (body?.nav !== undefined) {
    const n = Number(body.nav);
    patch.funds_allocated = body.nav === '' ? null : (Number.isFinite(n) ? n : null);
  }

  // as_of: accept YYYY-MM-DD or legacy as_of_date; store as date (YYYY-MM-DD)
  if (typeof body?.as_of === 'string' && body.as_of.trim()) {
    const d = new Date(body.as_of);
    patch.as_of = isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  } else if (typeof body?.as_of_date === 'string' && body.as_of_date.trim()) {
    const d = new Date(body.as_of_date);
    patch.as_of = isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no valid fields to update' }, { status: 400, headers: cacheHeaders() });
  }

  const { error: updErr } = await sb
    .from('holdings')
    .update(patch)
    .eq('id', holdingId)
    .eq('portfolio_id', portfolio_id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500, headers: cacheHeaders() });

  const { data, error: fetchErr } = await sb
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
    .eq('id', holdingId)
    .single();

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500, headers: cacheHeaders() });
  return NextResponse.json({ data }, { headers: cacheHeaders() });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; holdingId: string }> }) {
  const { id: portfolio_id, holdingId } = await ctx.params;
  const sb = await createSb();

  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  const { error } = await sb
    .from('holdings')
    .delete()
    .eq('id', holdingId)
    .eq('portfolio_id', portfolio_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  return new Response(null, { status: 204, headers: cacheHeaders() });
}