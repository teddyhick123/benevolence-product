import type { AssistantToolExecutor } from '../../executor-types';

export const executeGetPortfolioSummary: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId, orgId } = runtime;
  {
    const includeKpis = args.include_kpis !== false;
    const includeSectors = args.include_sectors !== false;
    const includeTopHoldings = args.include_top_holdings !== false;

    const { data: holdings } = await supabase
      .from('holdings')
      .select('id, name, sector, status, funds_allocated')
      .eq('portfolio_id', portfolioId)
      .order('funds_allocated', { ascending: false });

    const holdingsData = holdings || [];
    const totalAUM = holdingsData.reduce(
      (sum: number, h: any) => sum + (h.funds_allocated || 0),
      0,
    );
    const totalNAV = holdingsData.reduce(
      (sum: number, h: any) => sum + (h.nav || 0),
      0,
    );

    const summary: any = {
      total_holdings: holdingsData.length,
      active_holdings: holdingsData.filter((h) => h.status === 'Active').length,
      total_aum: totalAUM,
      total_nav: totalNAV,
    };

    if (includeSectors) {
      const sectors: Record<string, { count: number; funds: number }> = {};
      holdingsData.forEach((h: any) => {
        const sector: string = h.sector || 'Unspecified';
        if (!sectors[sector]) sectors[sector] = { count: 0, funds: 0 };
        sectors[sector].count++;
        sectors[sector].funds += h.funds_allocated || 0;
      });
      summary.sector_breakdown = sectors;
    }

    if (includeTopHoldings) {
      summary.top_holdings = holdingsData.slice(0, 5).map((h) => ({
        name: h.name,
        funds_allocated: h.funds_allocated,
        sector: h.sector,
      }));
    }

    if (includeKpis) {
      const { data: kpiDefs } = await supabase
        .from('kpi_definitions')
        .select('slug, name, unit, target_value')
        .eq('org_id', orgId)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      const { data: facts } = await supabase
        .from('metric_facts')
        .select('metric_name, value, unit, holdings!inner(portfolio_id)')
        .eq('holdings.portfolio_id', portfolioId);

      const totals: Record<string, { value: number; unit: string | null }> = {};
      (facts || []).forEach((fact: any) => {
        if (!totals[fact.metric_name]) {
          totals[fact.metric_name] = { value: 0, unit: fact.unit };
        }
        totals[fact.metric_name].value += fact.value || 0;
      });

      const defs = kpiDefs || [];
      const metricCodes = new Set([
        ...Object.keys(totals),
        ...defs.map((kpi: any) => kpi.slug),
      ]);

      summary.kpi_performance = Array.from(metricCodes).map((slug: string) => {
        const kpi = defs.find((k: any) => k.slug === slug);
        const current = totals[slug]?.value || 0;
        const target = kpi?.target_value ?? null;
        return {
          metric: kpi?.name || slug,
          current,
          target,
          percent_complete: target
            ? Math.round((current / target) * 100)
            : null,
          unit: totals[slug]?.unit || kpi?.unit || null,
        };
      });
    }

    return {
      action: null,
      output: summary,
    };
  }
};
