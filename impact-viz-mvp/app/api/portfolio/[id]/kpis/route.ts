// app/api/portfolio/[id]/kpis/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const createSb = createSupabaseServerClient;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const url = new URL(req.url);
  const offset = Number(url.searchParams.get('offset') ?? '0') || 0;
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '50') || 50, 200);

  const sb = await createSb();

  // Query v_portfolio_kpi_latest which now shows ALL metrics with data
  // Targets are included as optional overlay from portfolio_metric_targets
  const { data: metrics, error, count } = await sb
    .from('v_portfolio_kpi_latest')
    .select('*', { count: 'exact' })
    .eq('portfolio_id', portfolio_id)
    .order('metric_code', { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  return NextResponse.json(
    {
      data: metrics ?? [],
      count: count ?? 0,
      nextOffset: (count ?? 0) > offset + limit ? offset + limit : null,
    },
    { headers: cacheHeaders() }
  );
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const sb = await createSb();

  // Permission gate
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

  // Validate required fields
  if (!body.metric_code) {
    return NextResponse.json({ error: 'metric_code is required' }, { status: 400, headers: cacheHeaders() });
  }

  // Verify metric exists in metrics table
  const { data: metricExists } = await sb
    .from('metrics')
    .select('code')
    .eq('code', body.metric_code)
    .maybeSingle();

  if (!metricExists) {
    return NextResponse.json({ error: 'Invalid metric_code' }, { status: 400, headers: cacheHeaders() });
  }

  const insertRow: any = {
    portfolio_id,
    metric_code: body.metric_code,
    target_value: body.target_value ?? null,
    target_date: body.target_date ?? null,
    display_name: body.display_name ?? null,
    notes: body.notes ?? null,
  };

  // Insert or update target (UPSERT on unique constraint)
  const { data: inserted, error: insErr } = await sb
    .from('portfolio_metric_targets')
    .upsert(insertRow, { onConflict: 'portfolio_id,metric_code' })
    .select('id, portfolio_id, metric_code, target_value, target_date, display_name, notes')
    .single();

  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500, headers: cacheHeaders() });

  // Get latest metric data
  const { data: latest, error: latestErr } = await sb
    .from('v_portfolio_kpi_latest')
    .select('metric_code, metric_name, value, unit, period_end, progress_percentage')
    .eq('portfolio_id', portfolio_id)
    .eq('metric_code', body.metric_code)
    .maybeSingle();

  if (latestErr) return NextResponse.json({ error: latestErr.message }, { status: 500, headers: cacheHeaders() });

  return NextResponse.json({ target: inserted, latest }, { headers: cacheHeaders() });
}