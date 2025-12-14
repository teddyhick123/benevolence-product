// app/api/portfolio/[id]/comparison-table/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params;
  const url = new URL(_req.url);
  const metricsParam = (url.searchParams.get('metrics') || '').trim();

  if (!metricsParam) {
    return NextResponse.json(
      { error: 'Missing metrics parameter' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const metricCodes = metricsParam.split(',').map(m => m.trim()).filter(Boolean);

  if (metricCodes.length === 0) {
    return NextResponse.json(
      { error: 'No valid metrics provided' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const supabase = await createSupabaseServerClient();

  // Get all holdings for this portfolio
  const { data: holdings, error: holdingsErr } = await supabase
    .from('holdings')
    .select('id, name, sector')
    .eq('portfolio_id', portfolioId)
    .order('name');

  if (holdingsErr) {
    return NextResponse.json(
      { error: holdingsErr.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  if (!holdings || holdings.length === 0) {
    return NextResponse.json(
      { data: [] },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Get metric metadata (names, units, directionality)
  const { data: metricMeta, error: metaErr } = await supabase
    .from('metrics')
    .select('code, name, unit, directionality')
    .in('code', metricCodes);

  if (metaErr) {
    return NextResponse.json(
      { error: metaErr.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const metaMap = new Map(
    (metricMeta || []).map(m => [
      m.code,
      {
        name: m.name || m.code,
        unit: m.unit,
        directionality: m.directionality
      }
    ])
  );

  // Build result rows
  const rows = [];

  for (const holding of holdings) {
    const metrics = [];

    for (const metricCode of metricCodes) {
      // Get latest value for this metric for this holding
      const { data: metricData, error: metricErr } = await supabase
        .from('metric_facts')
        .select('value, unit')
        .eq('holding_id', holding.id)
        .eq('metric_code', metricCode)
        .order('period_end', { ascending: false })
        .limit(1);

      if (!metricErr && metricData && metricData.length > 0) {
        const meta = metaMap.get(metricCode);
        metrics.push({
          metric_code: metricCode,
          metric_name: meta?.name || metricCode,
          value: Number(metricData[0].value) || 0,
          unit: metricData[0].unit || meta?.unit || null,
          directionality: meta?.directionality || null
        });
      }
    }

    // Only include holdings that have at least one metric value
    if (metrics.length > 0) {
      rows.push({
        holdingId: holding.id,
        holdingName: holding.name,
        sector: holding.sector,
        metrics
      });
    }
  }

  return NextResponse.json(
    { data: rows },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
