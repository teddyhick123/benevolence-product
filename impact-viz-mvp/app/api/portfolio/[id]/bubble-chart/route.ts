// app/api/portfolio/[id]/bubble-chart/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params;
  const url = new URL(_req.url);
  const xMetric = url.searchParams.get('xMetric');
  const yMetric = url.searchParams.get('yMetric');
  const sizeMetric = url.searchParams.get('sizeMetric');
  const colorMetric = url.searchParams.get('colorMetric');

  if (!xMetric || !yMetric || !sizeMetric) {
    return NextResponse.json(
      { error: 'xMetric, yMetric, and sizeMetric are required' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const supabase = await createSupabaseServerClient();

  // Get all holdings for this portfolio
  const { data: holdings, error: holdingsErr } = await supabase
    .from('holdings')
    .select('id, name, sector, asset_type')
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

  // Get all holding IDs first
  const holdingIds = holdings.map(h => h.id);

  // Single batched query for all metrics
  const { data: metricRows } = await supabase
    .from('metric_facts')
    .select('holding_id, metric_code, value, period_end')
    .in('holding_id', holdingIds)
    .in('metric_code', [xMetric, yMetric, sizeMetric, colorMetric].filter(Boolean) as string[])
    .order('period_end', { ascending: false });

  // Build lookup map in JS — take latest value per (holding_id, metric_code)
  const metricMap = new Map<string, Map<string, number>>();
  for (const row of metricRows ?? []) {
    if (!metricMap.has(row.holding_id)) metricMap.set(row.holding_id, new Map());
    const hMap = metricMap.get(row.holding_id)!;
    if (!hMap.has(row.metric_code)) hMap.set(row.metric_code, row.value); // take latest
  }

  const bubbleData = [];

  for (const holding of holdings) {
    const hMap = metricMap.get(holding.id);
    const xValue = hMap?.get(xMetric);
    const yValue = hMap?.get(yMetric);
    const sizeValue = hMap?.get(sizeMetric);

    // Only include holdings that have all three required metrics
    if (xValue != null && yValue != null && sizeValue != null) {
      const xNum = Number(xValue) || 0;
      const yNum = Number(yValue) || 0;
      const sizeNum = Number(sizeValue) || 0;

      // Only include if size is positive (can't have zero or negative sized bubbles)
      if (sizeNum > 0) {
        const colorValue = colorMetric ? (hMap?.get(colorMetric) != null ? Number(hMap!.get(colorMetric)) || 0 : undefined) : undefined;
        bubbleData.push({
          holdingId: holding.id,
          holdingName: holding.name,
          sector: holding.sector,
          assetType: (holding as any).asset_type || null,
          xValue: xNum,
          yValue: yNum,
          sizeValue: sizeNum,
          colorValue,
          xMetric,
          yMetric,
          sizeMetric,
          colorMetric: colorMetric || undefined
        });
      }
    }
  }

  return NextResponse.json(
    { data: bubbleData },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
