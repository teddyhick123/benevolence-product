// app/api/portfolio/[id]/letter/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const sb = await createSupabaseServerClient();

  try {
    // 1. Fetch portfolio metadata
    const { data: portfolio, error: portfolioError } = await sb
      .from('portfolios')
      .select('id, name, description')
      .eq('id', portfolio_id)
      .single();

    if (portfolioError) throw portfolioError;

    // 2. Fetch latest KPI values with targets from v_portfolio_kpi_latest
    const { data: kpis, error: kpisError } = await sb
      .from('v_portfolio_kpi_latest')
      .select('metric_code, metric_name, display_name, value, unit, period_end, target_value, target_date, progress_percentage')
      .eq('portfolio_id', portfolio_id)
      .order('metric_code', { ascending: true });

    if (kpisError) throw kpisError;

    // Map to consistent structure for letter template
    const kpisWithValues = (kpis || []).map((kpi: any) => ({
      metric_code: kpi.metric_code,
      display_name: kpi.display_name || kpi.metric_name,
      target_value: kpi.target_value,
      target_date: kpi.target_date,
      latest_value: kpi.value,
      unit: kpi.unit,
      period_end: kpi.period_end,
      progress_percentage: kpi.progress_percentage,
    }));

    // 4. Fetch holdings summary
    const { data: holdings, error: holdingsError } = await sb
      .from('holdings')
      .select('id, name, status, sector, funds_allocated, nav')
      .eq('portfolio_id', portfolio_id)
      .order('name', { ascending: true });

    if (holdingsError) throw holdingsError;

    // 5. Calculate portfolio summary stats
    const totalHoldings = (holdings || []).length;
    const totalFundsAllocated = (holdings || []).reduce((sum: number, h: any) => sum + (h.funds_allocated || 0), 0);
    const totalNAV = (holdings || []).reduce((sum: number, h: any) => sum + (h.nav || 0), 0);

    // 6. Return structured data
    return NextResponse.json({
      portfolio: {
        id: portfolio.id,
        name: portfolio.name,
        description: portfolio.description,
      },
      summary: {
        total_holdings: totalHoldings,
        total_funds_allocated: totalFundsAllocated,
        total_nav: totalNAV,
        generated_at: new Date().toISOString(),
      },
      kpis: kpisWithValues,
      holdings: holdings || [],
    }, { headers: cacheHeaders() });

  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || 'Failed to fetch portfolio data' },
      { status: 500, headers: cacheHeaders() }
    );
  }
}
