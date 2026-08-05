import type { AssistantToolExecutor } from '../../executor-types';

export const executeAnalyzePortfolioRisk: AssistantToolExecutor = async (
  runtime,
) => {
  const { db: supabase, args, portfolioId } = runtime;
  {
    const riskType = args.risk_type || 'all';

    // Get all holdings
    const { data: holdings } = await supabase
      .from('holdings')
      .select('id, name, sector, country, funds_allocated')
      .eq('portfolio_id', portfolioId);

    if (!holdings || holdings.length === 0) {
      return {
        action: null,
        output: { error: 'No holdings found in portfolio' },
      };
    }

    const totalAllocation = holdings.reduce(
      (sum: number, h: any) => sum + (h.funds_allocated || 0),
      0,
    );
    const result: any = {
      total_holdings: holdings.length,
      total_allocation: totalAllocation,
    };

    // Concentration risk (single holding exposure)
    if (riskType === 'concentration' || riskType === 'all') {
      const sorted = [...holdings].sort(
        (a: any, b: any) => (b.funds_allocated || 0) - (a.funds_allocated || 0),
      );
      const top3 = sorted.slice(0, 3);
      const top3Percent =
        totalAllocation > 0
          ? (top3.reduce(
              (sum: number, h: any) => sum + (h.funds_allocated || 0),
              0,
            ) /
              totalAllocation) *
            100
          : 0;

      result.concentration = {
        top_3_holdings: top3.map((h: any) => ({
          name: h.name,
          allocation: h.funds_allocated,
          percent:
            totalAllocation > 0
              ? ((h.funds_allocated || 0) / totalAllocation) * 100
              : 0,
        })),
        top_3_percent: top3Percent,
        risk_level:
          top3Percent > 50 ? 'high' : top3Percent > 30 ? 'medium' : 'low',
      };
    }

    // Sector concentration
    if (riskType === 'sector' || riskType === 'all') {
      const bySector: Record<string, number> = {};
      holdings.forEach((h: any) => {
        const sector = h.sector || 'Unknown';
        bySector[sector] = (bySector[sector] || 0) + (h.funds_allocated || 0);
      });

      const sectorEntries = Object.entries(bySector)
        .map(([sector, amount]) => ({
          sector,
          amount,
          percent: totalAllocation > 0 ? (amount / totalAllocation) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount);

      const topSectorPercent = sectorEntries[0]?.percent || 0;

      result.sector_concentration = {
        sectors: sectorEntries,
        top_sector: sectorEntries[0]?.sector,
        top_sector_percent: topSectorPercent,
        risk_level:
          topSectorPercent > 40
            ? 'high'
            : topSectorPercent > 25
              ? 'medium'
              : 'low',
      };
    }

    // Geographic concentration
    if (riskType === 'geography' || riskType === 'all') {
      const byCountry: Record<string, number> = {};
      holdings.forEach((h: any) => {
        const country = h.country || 'Unknown';
        byCountry[country] =
          (byCountry[country] || 0) + (h.funds_allocated || 0);
      });

      const countryEntries = Object.entries(byCountry)
        .map(([country, amount]) => ({
          country,
          amount,
          percent: totalAllocation > 0 ? (amount / totalAllocation) * 100 : 0,
        }))
        .sort((a, b) => b.amount - a.amount);

      result.geographic_concentration = {
        countries: countryEntries,
        country_count: countryEntries.length,
        top_country: countryEntries[0]?.country,
        top_country_percent: countryEntries[0]?.percent || 0,
      };
    }

    return { action: null, output: result };
  }
};
