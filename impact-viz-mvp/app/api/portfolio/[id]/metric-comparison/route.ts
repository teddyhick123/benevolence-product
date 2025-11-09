// app/api/portfolio/[id]/metric-comparison/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params;
  const url = new URL(_req.url);
  const metricCode = (url.searchParams.get('metric') || '').trim();
  const window = (url.searchParams.get('window') || '12m').trim();

  if (!metricCode) {
    return NextResponse.json(
      { error: 'Missing metric parameter' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const supabase = await createSupabaseServerClient();

  // Calculate date range based on window
  const now = new Date();
  let startDate: Date;
  switch (window) {
    case '3m':
      startDate = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
      break;
    case '6m':
      startDate = new Date(now.getFullYear(), now.getMonth() - 6, now.getDate());
      break;
    case '12m':
      startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
      break;
    case 'all':
      startDate = new Date(1970, 0, 1); // Far back date
      break;
    default:
      startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
  }

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

  // For each holding, get metric data
  const comparisonData = [];

  for (const holding of holdings) {
    const { data: metrics, error: metricsErr } = await supabase
      .from('metric_facts')
      .select('period_end, value')
      .eq('holding_id', holding.id)
      .eq('metric_code', metricCode)
      .gte('period_end', startDate.toISOString().split('T')[0])
      .order('period_end', { ascending: true });

    if (metricsErr || !metrics || metrics.length === 0) {
      // Skip holdings without data for this metric
      continue;
    }

    // Calculate trend and percent change
    const data = metrics.map((m: any) => ({
      date: m.period_end,
      value: Number(m.value) || 0
    }));

    const latestValue = data[data.length - 1].value;
    const firstValue = data[0].value;
    const percentChange = firstValue !== 0
      ? ((latestValue - firstValue) / Math.abs(firstValue)) * 100
      : 0;

    let trend: 'up' | 'down' | 'flat' = 'flat';
    if (Math.abs(percentChange) < 1) {
      trend = 'flat';
    } else if (percentChange > 0) {
      trend = 'up';
    } else {
      trend = 'down';
    }

    comparisonData.push({
      holdingId: holding.id,
      holdingName: holding.name,
      sector: holding.sector || 'Unknown',
      data,
      latestValue,
      percentChange,
      trend
    });
  }

  return NextResponse.json(
    { data: comparisonData },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
