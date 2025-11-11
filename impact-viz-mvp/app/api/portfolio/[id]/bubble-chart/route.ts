// app/api/portfolio/[id]/bubble-chart/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase-server';

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

  const bubbleData = [];

  for (const holding of holdings) {
    // Get latest value for each metric
    const { data: xData } = await supabase
      .from('metric_facts')
      .select('value')
      .eq('holding_id', holding.id)
      .eq('metric_code', xMetric)
      .order('period_end', { ascending: false })
      .limit(1);

    const { data: yData } = await supabase
      .from('metric_facts')
      .select('value')
      .eq('holding_id', holding.id)
      .eq('metric_code', yMetric)
      .order('period_end', { ascending: false })
      .limit(1);

    const { data: sizeData } = await supabase
      .from('metric_facts')
      .select('value')
      .eq('holding_id', holding.id)
      .eq('metric_code', sizeMetric)
      .order('period_end', { ascending: false })
      .limit(1);

    let colorValue: number | undefined;
    if (colorMetric) {
      const { data: colorData } = await supabase
        .from('metric_facts')
        .select('value')
        .eq('holding_id', holding.id)
        .eq('metric_code', colorMetric)
        .order('period_end', { ascending: false })
        .limit(1);

      if (colorData && colorData.length > 0) {
        colorValue = Number(colorData[0].value) || 0;
      }
    }

    // Only include holdings that have all three required metrics
    if (
      xData && xData.length > 0 &&
      yData && yData.length > 0 &&
      sizeData && sizeData.length > 0
    ) {
      const xValue = Number(xData[0].value) || 0;
      const yValue = Number(yData[0].value) || 0;
      const sizeValue = Number(sizeData[0].value) || 0;

      // Only include if size is positive (can't have zero or negative sized bubbles)
      if (sizeValue > 0) {
        bubbleData.push({
          holdingId: holding.id,
          holdingName: holding.name,
          sector: holding.sector,
          xValue,
          yValue,
          sizeValue,
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
