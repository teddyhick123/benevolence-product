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

  // Query latest KPI values and all metric_facts periods in parallel
  const [latestResult, factsResult] = await Promise.all([
    sb
      .from('v_portfolio_kpi_latest')
      .select('*', { count: 'exact' })
      .eq('portfolio_id', portfolio_id)
      .order('metric_code', { ascending: true })
      .range(offset, offset + limit - 1),
    // Get recent metric_facts to compute previous-period delta
    // Supabase table metric_facts joined via holdings; use a view-friendly query
    sb
      .from('metric_facts')
      .select('metric_code, value, period_end, holding_id')
      .in(
        'holding_id',
        sb
          .from('holdings')
          .select('id')
          .eq('portfolio_id', portfolio_id)
          .is('deleted_at', null) as any
      )
      .order('period_end', { ascending: false })
      .limit(2000),
  ]);

  const { data: metrics, error, count } = latestResult;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500, headers: cacheHeaders() });
  }

  // Build previous-period lookup: for each metric_code, find the sum of the
  // second-most-recent period_end (so we can show % change vs last period)
  const latestByCode = new Map<string, string>();   // metric_code → latest period_end
  const prevSumByCode = new Map<string, number>();  // metric_code → prev period sum

  for (const m of (metrics ?? []) as any[]) {
    if (m.metric_code) latestByCode.set(m.metric_code, m.latest_date ?? '');
  }

  if (factsResult.data) {
    const accumPrev: Record<string, { period: string; sum: number }> = {};
    for (const f of factsResult.data as any[]) {
      const latestPeriod = latestByCode.get(f.metric_code);
      if (!latestPeriod || f.period_end >= latestPeriod) continue;
      if (!accumPrev[f.metric_code] || f.period_end > accumPrev[f.metric_code].period) {
        accumPrev[f.metric_code] = { period: f.period_end, sum: Number(f.value) };
      } else if (f.period_end === accumPrev[f.metric_code].period) {
        accumPrev[f.metric_code].sum += Number(f.value);
      }
    }
    for (const [code, { sum }] of Object.entries(accumPrev)) {
      prevSumByCode.set(code, sum);
    }
  }

  const enriched = (metrics ?? []).map((m: any) => {
    const current = m.total_value ?? m.value ?? null;
    const prev = prevSumByCode.get(m.metric_code) ?? null;
    const delta = current != null && prev != null && prev !== 0
      ? ((current - prev) / Math.abs(prev)) * 100
      : null;
    return { ...m, value: current, delta };
  });

  return NextResponse.json(
    {
      data: enriched,
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