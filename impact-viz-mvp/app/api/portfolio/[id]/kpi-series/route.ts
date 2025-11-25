// app/api/portfolio/[id]/kpi-series/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const url = new URL(_req.url);
  const kpiId = (url.searchParams.get('kpiId') || '').trim();
  const metricParam = (url.searchParams.get('metric') || '').trim();
  const metric = metricParam ? metricParam.toUpperCase() : '';
  if (!kpiId && !metric) {
    return NextResponse.json({ series: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const supabase = await createSupabaseServerClient();

  // Fetch KPI series from view
  let query = supabase
    .from('v_portfolio_kpi_series')
    .select('period_end, value, unit, metric_code, kpi_def_id')
    .eq('portfolio_id', portfolio_id)
    .order('period_end', { ascending: true });
  if (kpiId) {
    query = query.eq('kpi_def_id', kpiId);
  } else {
    query = query.eq('metric_code', metric);
  }
  const { data: rows, error: qErr } = await query;
  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
  const series = (rows ?? []).map((row: any) => ({
    date: row.period_end,
    value: row.value,
  }));

  // Get display name from kpi_definitions
  let displayName = metric;
  if (rows && rows.length > 0) {
    const firstRow = rows[0];
    if (firstRow.kpi_def_id) {
      const { data: kpiDef } = await supabase
        .from('kpi_definitions')
        .select('display_name')
        .eq('id', firstRow.kpi_def_id)
        .single();
      if (kpiDef?.display_name) {
        displayName = kpiDef.display_name;
      }
    } else {
      // Try looking up by metric_code and portfolio_id
      const { data: kpiDef } = await supabase
        .from('kpi_definitions')
        .select('display_name')
        .eq('metric_code', metric)
        .eq('portfolio_id', portfolio_id)
        .single();
      if (kpiDef?.display_name) {
        displayName = kpiDef.display_name;
      }
    }
  }

  return NextResponse.json({ series, display_name: displayName }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' } });
}