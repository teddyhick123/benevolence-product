// app/api/portfolio/[id]/kpis/[kpiId]/route.ts
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

function toIso(v: any): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function toDate(v: any): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; kpiId: string }> }) {
  const { id: portfolio_id, kpiId } = await ctx.params;
  const sb = await createSb();

  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  let body: any = {};
  try { body = await req.json(); } catch (_) {}

  const patch: Record<string, any> = {};
  if (typeof body?.label === 'string') patch.display_name = body.label.trim() || null;
  if (typeof body?.metric_code === 'string') patch.metric_code = body.metric_code.trim() || null;
  if (body?.target_value !== undefined) {
    if (body.target_value === '' || body.target_value === null) patch.target_value = null;
    else {
      const n = Number(body.target_value);
      patch.target_value = Number.isFinite(n) ? n : null;
    }
  }
  if (body?.target_date !== undefined) patch.target_date = toDate(body.target_date);
  if (body?.order_index !== undefined) {
    if (body.order_index === '' || body.order_index === null) patch.order_index = null;
    else {
      const n = Number(body.order_index);
      patch.order_index = Number.isInteger(n) ? n : null;
    }
  }
  if (typeof body?.calculation === 'string') patch.calculation = body.calculation.trim() || null;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no valid fields to update' }, { status: 400, headers: cacheHeaders() });
  }

  const { data: definition, error: updateError } = await sb
    .from('kpi_definitions')
    .update(patch)
    .eq('id', kpiId)
    .eq('portfolio_id', portfolio_id)
    .select('id, portfolio_id, display_name, metric_code, target_value, target_date, calculation, order_index')
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500, headers: cacheHeaders() });

  const { data: latest, error: latestError } = await sb
    .from('v_portfolio_kpi_latest')
    .select('kpi_def_id, value, unit, period_start, period_end')
    .eq('kpi_def_id', kpiId)
    .eq('portfolio_id', portfolio_id)
    .maybeSingle();

  if (latestError && latestError.code !== 'PGRST116') {
    // PGRST116 = no rows found, treat as null latest
    return NextResponse.json({ error: latestError.message }, { status: 500, headers: cacheHeaders() });
  }

  return NextResponse.json({ definition, latest: latest || null }, { headers: cacheHeaders() });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; kpiId: string }> }) {
  const { id: portfolio_id, kpiId } = await ctx.params;
  const sb = await createSb();

  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  const { error } = await sb
    .from('kpi_definitions')
    .delete()
    .eq('id', kpiId)
    .eq('portfolio_id', portfolio_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  return NextResponse.json({ ok: true }, { headers: cacheHeaders() });
}