// app/api/portfolio/[id]/metric-comparison/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { requirePortfolioAccess, isAccessDenied } from '@/lib/portfolio-auth';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params;
  const access = await requirePortfolioAccess(portfolioId);
  if (isAccessDenied(access)) return access.error;
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
    case '24m':
      startDate = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
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

  const holdingIds = holdings.map(h => h.id);
  const startDateStr = startDate.toISOString().split('T')[0];

  // Single batched query for all holdings
  const { data: rows, error: metricsErr } = await supabase
    .from('metric_facts')
    .select('holding_id, period_end, value')
    .in('holding_id', holdingIds)
    .eq('metric_code', metricCode)
    .gte('period_end', startDateStr)
    .order('period_end');

  if (metricsErr) {
    return NextResponse.json(
      { error: metricsErr.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Group by holding_id in memory
  const byHolding = new Map<string, Array<{ period_end: string; value: number }>>();
  for (const row of rows ?? []) {
    if (!byHolding.has(row.holding_id)) byHolding.set(row.holding_id, []);
    byHolding.get(row.holding_id)!.push({ period_end: row.period_end, value: row.value });
  }

  const holdingMap = new Map(holdings.map(h => [h.id, h]));
  const comparisonData = [];

  for (const [holdingId, points] of byHolding) {
    if (points.length === 0) continue;
    const holding = holdingMap.get(holdingId);
    if (!holding) continue;

    const data = points.map(m => ({
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
