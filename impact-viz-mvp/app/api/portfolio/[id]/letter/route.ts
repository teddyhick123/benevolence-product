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

    // 2. Fetch KPI definitions and latest values
    const { data: kpis, error: kpisError } = await sb
      .from('kpi_definitions')
      .select('id, metric_code, display_name, target_value, target_date, calculation')
      .eq('portfolio_id', portfolio_id)
      .order('order_index', { ascending: true });

    if (kpisError) throw kpisError;

    // 3. Fetch latest KPI values
    const kpiIds = (kpis || []).map((k: any) => k.id);
    let latestValues: any[] = [];

    if (kpiIds.length > 0) {
      const { data: latest, error: latestError } = await sb
        .from('v_portfolio_kpi_latest')
        .select('kpi_def_id, value, unit, period_start, period_end')
        .eq('portfolio_id', portfolio_id)
        .in('kpi_def_id', kpiIds);

      if (!latestError) latestValues = latest || [];
    }

    // Combine KPIs with their latest values
    const kpisWithValues = (kpis || []).map((kpi: any) => {
      const latest = latestValues.find((l: any) => l.kpi_def_id === kpi.id);
      return {
        ...kpi,
        latest_value: latest?.value ?? null,
        unit: latest?.unit ?? null,
        period_start: latest?.period_start ?? null,
        period_end: latest?.period_end ?? null,
      };
    });

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
