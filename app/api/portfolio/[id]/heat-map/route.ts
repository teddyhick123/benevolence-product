// app/api/portfolio/[id]/heat-map/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { requirePortfolioAccess, isAccessDenied } from '@/lib/portfolio-auth';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params;
  const access = await requirePortfolioAccess(portfolioId);
  if (isAccessDenied(access)) return access.error;
  const url = new URL(_req.url);
  const mode = (url.searchParams.get('mode') || 'temporal').trim();
  const window = (url.searchParams.get('window') || '12m').trim();

  const supabase = await createSupabaseServerClient();

  if (mode === 'temporal') {
    // Single metric over time periods
    const metricCode = (url.searchParams.get('metric') || '').trim();
    if (!metricCode) {
      return NextResponse.json(
        { error: 'Missing metric parameter' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

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
        startDate = new Date(1970, 0, 1);
        break;
      default:
        startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
    }

    // Get all holdings for this portfolio
    const { data: holdings, error: holdingsErr } = await supabase
      .from('holdings')
      .select('id, name')
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

    // Get metric data for all holdings
    const { data: metrics, error: metricsErr } = await supabase
      .from('metric_facts')
      .select('holding_id, period_end, value')
      .eq('metric_code', metricCode)
      .in('holding_id', holdings.map(h => h.id))
      .gte('period_end', startDate.toISOString().split('T')[0])
      .order('period_end');

    if (metricsErr) {
      return NextResponse.json(
        { error: metricsErr.message },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Create holding name lookup
    const holdingNames = new Map(holdings.map(h => [h.id, h.name]));

    // Group by month/quarter for columns
    const cells = [];
    const periodFormat = window === '12m' || window === '6m' || window === '3m'
      ? 'month'
      : 'quarter';

    for (const m of (metrics || [])) {
      const date = new Date(m.period_end);
      let period: string;
      if (periodFormat === 'month') {
        period = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short' });
      } else {
        const q = Math.floor(date.getMonth() / 3) + 1;
        period = `Q${q} ${date.getFullYear()}`;
      }

      cells.push({
        holding: holdingNames.get(m.holding_id) || 'Unknown',
        holdingId: m.holding_id,
        period,
        value: Number(m.value) || 0
      });
    }

    return NextResponse.json(
      { data: cells },
      { headers: { 'Cache-Control': 'no-store' } }
    );

  } else if (mode === 'metrics') {
    // Multiple metrics for each holding
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

    // Get all holdings for this portfolio
    const { data: holdings, error: holdingsErr } = await supabase
      .from('holdings')
      .select('id, name')
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

    // Single batched query for all holdings × metrics
    const { data: metricRows, error: metricsErr } = await supabase
      .from('metric_facts')
      .select('holding_id, metric_code, value, period_end')
      .in('holding_id', holdingIds)
      .in('metric_code', metricCodes)
      .order('period_end', { ascending: false });

    if (metricsErr) {
      return NextResponse.json(
        { error: metricsErr.message },
        { status: 500, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Build 2D map: holdingId → metricCode → latest value
    const metricMap = new Map<string, Map<string, number>>();
    for (const row of metricRows ?? []) {
      if (!metricMap.has(row.holding_id)) metricMap.set(row.holding_id, new Map());
      const hMap = metricMap.get(row.holding_id)!;
      if (!hMap.has(row.metric_code)) hMap.set(row.metric_code, row.value); // take latest
    }

    const holdingNames = new Map(holdings.map(h => [h.id, h.name]));
    const cells = [];

    for (const holding of holdings) {
      const hMap = metricMap.get(holding.id);
      for (const metricCode of metricCodes) {
        const val = hMap?.get(metricCode);
        if (val != null) {
          cells.push({
            holding: holdingNames.get(holding.id) || holding.name,
            holdingId: holding.id,
            period: metricCode, // In metrics mode, "period" is actually the metric name
            value: Number(val) || 0
          });
        }
      }
    }

    return NextResponse.json(
      { data: cells },
      { headers: { 'Cache-Control': 'no-store' } }
    );

  } else {
    return NextResponse.json(
      { error: 'Invalid mode. Use "temporal" or "metrics"' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
