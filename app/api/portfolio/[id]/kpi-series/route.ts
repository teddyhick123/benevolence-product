// app/api/portfolio/[id]/kpi-series/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { requirePortfolioAccess, isAccessDenied } from '@/lib/portfolio-auth';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id);
  if (isAccessDenied(access)) return access.error;
  const url = new URL(_req.url);
  const kpiId = (url.searchParams.get('kpiId') || '').trim();
  const metricParam = (url.searchParams.get('metric') || '').trim();
  const metric = metricParam ? metricParam.toUpperCase() : '';
  if (!kpiId && !metric) {
    return NextResponse.json({ series: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const supabase = await createSupabaseServerClient();

  // Fetch KPI series from view
  // Use .or() with both exact and uppercase matching for reliability
  let query = supabase
    .from('v_portfolio_kpi_series')
    .select('period_end, value, unit, metric_code, metric_name, display_name')
    .eq('portfolio_id', portfolio_id)
    .order('period_end', { ascending: true });

  // Query by metric_code (kpiId parameter is deprecated but kept for backward compatibility)
  const metricCode = kpiId || metric;
  if (metricCode) {
    query = query.or(`metric_code.eq.${metricCode},metric_code.ilike.${metricCode}`);
  }

  const { data: rows, error: qErr } = await query;

  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
  const series = (rows ?? []).map((row: any) => ({
    date: row.period_end,
    value: row.value,
  }));

  // Get display name from first row (view now includes display_name from portfolio_metric_targets)
  let displayName = metricCode;
  if (rows && rows.length > 0) {
    const firstRow = rows[0];
    displayName = firstRow.display_name || firstRow.metric_name || metricCode;
  }

  return NextResponse.json({ series, display_name: displayName }, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=60' } });
}