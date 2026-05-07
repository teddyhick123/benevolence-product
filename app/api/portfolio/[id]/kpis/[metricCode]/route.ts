// app/api/portfolio/[id]/kpis/[metricCode]/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const createSb = createSupabaseServerClient;

export async function GET(req: Request, ctx: { params: Promise<{ id: string; metricCode: string }> }) {
  const { id: portfolio_id, metricCode } = await ctx.params;
  const sb = await createSb();

  // Get metric data from v_portfolio_kpi_latest
  const { data: metric, error } = await sb
    .from('v_portfolio_kpi_latest')
    .select('*')
    .eq('portfolio_id', portfolio_id)
    .eq('metric_code', metricCode)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  if (!metric) {
    return NextResponse.json({ error: 'Metric not found' }, { status: 404, headers: cacheHeaders() });
  }

  return NextResponse.json({ data: metric }, { headers: cacheHeaders() });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; metricCode: string }> }) {
  const { id: portfolio_id, metricCode } = await ctx.params;
  const sb = await createSb();

  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  // Parse request body
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: cacheHeaders() });
  }

  // Build patch object for portfolio_metric_targets
  const patch: Record<string, any> = {};
  if (body.target_value !== undefined) patch.target_value = body.target_value;
  if (body.target_date !== undefined) patch.target_date = body.target_date;
  if (body.display_name !== undefined) patch.display_name = body.display_name;
  if (body.notes !== undefined) patch.notes = body.notes;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no valid fields to update' }, { status: 400, headers: cacheHeaders() });
  }

  // Update or insert target
  const { data: target, error: updateError } = await sb
    .from('portfolio_metric_targets')
    .upsert(
      {
        portfolio_id,
        metric_code: metricCode,
        ...patch,
      },
      { onConflict: 'portfolio_id,metric_code' }
    )
    .select('id, portfolio_id, metric_code, target_value, target_date, display_name, notes')
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500, headers: cacheHeaders() });

  // Get latest metric data
  const { data: latest, error: latestError } = await sb
    .from('v_portfolio_kpi_latest')
    .select('*')
    .eq('portfolio_id', portfolio_id)
    .eq('metric_code', metricCode)
    .maybeSingle();

  if (latestError && latestError.code !== 'PGRST116') {
    return NextResponse.json({ error: latestError.message }, { status: 500, headers: cacheHeaders() });
  }

  return NextResponse.json({ target, latest: latest || null }, { headers: cacheHeaders() });
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string; metricCode: string }> }) {
  const { id: portfolio_id, metricCode } = await ctx.params;
  const sb = await createSb();

  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  // Delete target from portfolio_metric_targets
  const { error } = await sb
    .from('portfolio_metric_targets')
    .delete()
    .eq('portfolio_id', portfolio_id)
    .eq('metric_code', metricCode);

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  return NextResponse.json({ ok: true }, { headers: cacheHeaders() });
}
