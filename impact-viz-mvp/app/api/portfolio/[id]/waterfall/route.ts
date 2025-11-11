// app/api/portfolio/[id]/waterfall/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params;
  const url = new URL(_req.url);
  const mode = (url.searchParams.get('mode') || 'funding').trim();
  const metricCode = url.searchParams.get('metric');
  const holdingId = url.searchParams.get('holdingId');

  const supabase = await createSupabaseServerClient();

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
    // Impact accumulation waterfall
    // Start: 0 (baseline)
    // Each holding: Impact contribution (positive)
    // End: Total impact

    // For simplicity, use funds_allocated as a proxy for impact
    // In a real scenario, you'd use actual impact metrics
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

    const waterfallData = [
      {
        label: 'Baseline',
        value: 0,
        isTotal: true,
        type: 'start'
      }
    ];

    let totalImpact = 0;
    holdings.forEach(h => {
      const impact = Number(h.funds_allocated) || 0;
      if (impact > 0) {
        waterfallData.push({
          label: h.name,
          value: impact,
          isTotal: false,
          type: 'increase'
        });
        totalImpact += impact;
      }
    });

    waterfallData.push({
      label: 'Total Impact',
      value: totalImpact,
      isTotal: true,
      type: 'total'
    });

    return NextResponse.json(
      { data: waterfallData },
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

    // Get latest metric value for each holding
    for (const holding of holdings) {
      const { data: metrics } = await supabase
        .from('metric_facts')
        .select('value')
        .eq('holding_id', holding.id)
        .eq('metric_code', metricCode)
        .order('period_end', { ascending: false })
        .limit(1);

      if (metrics && metrics.length > 0) {
        const value = Number(metrics[0].value) || 0;
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
