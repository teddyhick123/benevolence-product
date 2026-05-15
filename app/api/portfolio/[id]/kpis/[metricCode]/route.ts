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

async function getOrgId(sb: any, portfolio_id: string): Promise<string | null> {
  const { data } = await sb.from('portfolios').select('org_id').eq('id', portfolio_id).single();
  return data?.org_id ?? null;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string; metricCode: string }> }) {
  const { id: portfolio_id, metricCode } = await ctx.params;
  const sb = await createSb();

  const { data: canEdit, error: canEditErr } = await sb.rpc('can_edit_portfolio', { p_portfolio_id: portfolio_id });
  if (canEditErr) return NextResponse.json({ error: canEditErr.message }, { status: 500, headers: cacheHeaders() });
  if (!canEdit) return NextResponse.json({ error: 'not authorized' }, { status: 403, headers: cacheHeaders() });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: cacheHeaders() });
  }

  const patch: Record<string, any> = {};
  if (body.target_value !== undefined) patch.target_value = body.target_value;
  if (body.display_name !== undefined) patch.name = body.display_name;
  if (body.name !== undefined) patch.name = body.name;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'no valid fields to update' }, { status: 400, headers: cacheHeaders() });
  }

  const orgId = await getOrgId(sb, portfolio_id);
  if (!orgId) return NextResponse.json({ error: 'Portfolio not found' }, { status: 404, headers: cacheHeaders() });

  const { data: target, error: updateError } = await sb
    .from('kpi_definitions')
    .upsert(
      { org_id: orgId, slug: metricCode, ...patch },
      { onConflict: 'org_id,slug' }
    )
    .select('id, org_id, slug, name, target_value, unit')
    .single();

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500, headers: cacheHeaders() });

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

  const orgId = await getOrgId(sb, portfolio_id);
  if (!orgId) return NextResponse.json({ error: 'Portfolio not found' }, { status: 404, headers: cacheHeaders() });

  const { error } = await sb
    .from('kpi_definitions')
    .delete()
    .eq('org_id', orgId)
    .eq('slug', metricCode);

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  return NextResponse.json({ ok: true }, { headers: cacheHeaders() });
}
