// app/api/portfolio/[id]/waterfall/route.ts
import { NextResponse } from 'next/server';
import { requirePortfolioAccess, isAccessDenied } from '@/lib/api/access';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params;
  const access = await requirePortfolioAccess(portfolioId);
  if (isAccessDenied(access)) return access.response;
  const url = new URL(_req.url);
  const mode = (url.searchParams.get('mode') || 'funding').trim();
  const metricCode = url.searchParams.get('metric');
  const holdingId = url.searchParams.get('holdingId');

  const supabase = access.context.db;

  if (mode === 'funding') {
    // Funding allocation waterfall
    // Start: Total available funds
    // Each holding: Funds allocated (negative change)
    // End: Remaining funds

    // Get portfolio summary
    const { data: summary } = await supabase
      .from('portfolios')
      .select('*')
      .eq('id', portfolioId)
      .single();

    // Get holdings with allocations
    let holdingsQuery = supabase
      .from('holdings')
      .select('id, name, funds_allocated')
      .eq('portfolio_id', portfolioId)
      .order('funds_allocated', { ascending: false, nullsFirst: false });

    if (holdingId) {
      holdingsQuery = holdingsQuery.eq('id', holdingId);
    }

    const { data: holdings } = await holdingsQuery;

    if (!holdings || holdings.length === 0) {
      return NextResponse.json(
        { data: [] },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Calculate total allocated
    const totalAllocated = holdings.reduce((sum, h) => sum + (Number(h.funds_allocated) || 0), 0);

    // Assume total available is sum of all allocations (or could get from portfolio metadata)
    const totalAvailable = totalAllocated;

    const waterfallData = [
      {
        label: 'Total Funds',
        value: totalAvailable,
        isTotal: true,
        type: 'start'
      }
    ];

    // Add each holding as a negative value (funds leaving the pool)
    holdings.forEach(h => {
      const allocated = Number(h.funds_allocated) || 0;
      if (allocated > 0) {
        waterfallData.push({
          label: h.name,
          value: -allocated, // Negative because funds are being allocated out
          isTotal: false,
          type: 'decrease'
        });
      }
    });

    // End: Remaining funds (should be close to 0 if all funds allocated)
    const remaining = totalAvailable - totalAllocated;
    waterfallData.push({
      label: 'Remaining',
      value: remaining,
      isTotal: true,
      type: 'total'
    });

    return NextResponse.json(
      { data: waterfallData },
      { headers: { 'Cache-Control': 'no-store' } }
    );

  } else if (mode === 'impact') {
    // Impact accumulation waterfall — queries actual metric_facts, not funds_allocated.
    // Uses metricCode param if provided, otherwise picks the most prevalent metric.
    let holdingsQuery = supabase
      .from('holdings')
      .select('id, name')
      .eq('portfolio_id', portfolioId)
      .order('name');

    if (holdingId) {
      holdingsQuery = holdingsQuery.eq('id', holdingId);
    }

    const { data: holdings } = await holdingsQuery;

    if (!holdings || holdings.length === 0) {
      return NextResponse.json(
        { data: [] },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const holdingIds = holdings.map(h => h.id);

    // Determine which metric to use
    let targetMetric = metricCode;
    if (!targetMetric) {
      const { data: allCodes } = await supabase
        .from('metric_facts')
        .select('metric_code')
        .in('holding_id', holdingIds);

      if (allCodes && allCodes.length > 0) {
        const counts = new Map<string, number>();
        for (const row of allCodes) {
          counts.set(row.metric_code, (counts.get(row.metric_code) || 0) + 1);
        }
        targetMetric = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
      }
    }

    if (!targetMetric) {
      return NextResponse.json(
        { data: [], message: 'No impact metric data available for this portfolio' },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Batch-fetch latest value per holding for the chosen metric
    const { data: metricRows } = await supabase
      .from('metric_facts')
      .select('holding_id, value')
      .in('holding_id', holdingIds)
      .eq('metric_code', targetMetric)
      .order('period_end', { ascending: false });

    const latestByHolding = new Map<string, number>();
    for (const row of (metricRows || [])) {
      if (!latestByHolding.has(row.holding_id)) {
        latestByHolding.set(row.holding_id, Number(row.value) || 0);
      }
    }

    const waterfallData: { label: string; value: number; isTotal: boolean; type: string; metric?: string }[] = [
      {
        label: 'Baseline',
        value: 0,
        isTotal: true,
        type: 'start',
        metric: targetMetric,
      }
    ];

    let totalImpact = 0;
    for (const h of holdings) {
      const impact = latestByHolding.get(h.id) ?? 0;
      if (impact !== 0) {
        waterfallData.push({
          label: h.name,
          value: impact,
          isTotal: false,
          type: impact >= 0 ? 'increase' : 'decrease',
        });
        totalImpact += impact;
      }
    }

    waterfallData.push({
      label: `Total ${targetMetric}`,
      value: totalImpact,
      isTotal: true,
      type: 'total',
    });

    return NextResponse.json(
      { data: waterfallData, metric: targetMetric },
      { headers: { 'Cache-Control': 'no-store' } }
    );

  } else if (mode === 'metric') {
    // Metric breakdown waterfall
    // Start: 0
    // Each holding: Contribution to metric
    // End: Total metric value

    if (!metricCode) {
      return NextResponse.json(
        { error: 'Metric mode requires metric parameter' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } }
      );
    }

    // Get holdings
    let holdingsQuery = supabase
      .from('holdings')
      .select('id, name')
      .eq('portfolio_id', portfolioId)
      .order('name');

    if (holdingId) {
      holdingsQuery = holdingsQuery.eq('id', holdingId);
    }

    const { data: holdings } = await holdingsQuery;

    if (!holdings || holdings.length === 0) {
      return NextResponse.json(
        { data: [] },
        { headers: { 'Cache-Control': 'no-store' } }
      );
    }

    const waterfallData = [
      {
        label: 'Baseline',
        value: 0,
        isTotal: true,
        type: 'start'
      }
    ];

    let totalMetric = 0;

    // Batch-fetch latest value per holding (avoids N+1)
    const holdingIds = holdings.map(h => h.id);
    const { data: allMetricRows } = await supabase
      .from('metric_facts')
      .select('holding_id, value')
      .in('holding_id', holdingIds)
      .eq('metric_code', metricCode)
      .order('period_end', { ascending: false });

    const latestByHolding = new Map<string, number>();
    for (const row of (allMetricRows || [])) {
      if (!latestByHolding.has(row.holding_id)) {
        latestByHolding.set(row.holding_id, Number(row.value) || 0);
      }
    }

    for (const holding of holdings) {
      const value = latestByHolding.get(holding.id) ?? 0;
      if (value !== 0) {
        waterfallData.push({
          label: holding.name,
          value,
          isTotal: false,
          type: value >= 0 ? 'increase' : 'decrease'
        });
        totalMetric += value;
      }
    }

    waterfallData.push({
      label: `Total ${metricCode}`,
      value: totalMetric,
      isTotal: true,
      type: 'total'
    });

    return NextResponse.json(
      { data: waterfallData },
      { headers: { 'Cache-Control': 'no-store' } }
    );

  } else {
    return NextResponse.json(
      { error: 'Invalid mode. Use "funding", "impact", or "metric"' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
