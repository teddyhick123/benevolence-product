// app/api/portfolio/[id]/analytics/benchmarks/route.ts
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';
import { requirePortfolioAccess, isAccessDenied } from '@/lib/portfolio-auth';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

const createSb = createSupabaseServerClient;

type BenchmarkHolding = {
  id: string;
  name: string;
  sector: string | null;
  country?: string | null;
  funds_allocated: number | null;
  amount_invested: number | null;
  current_value: number | null;
};

function allocationValue(holding: BenchmarkHolding): number | null {
  const value = holding.funds_allocated ?? holding.amount_invested ?? holding.current_value;
  return value == null ? null : Number(value);
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id);
  if (isAccessDenied(access)) return access.error;
  const url = new URL(req.url);

  const holding_id = url.searchParams.get('holding_id');
  const benchmark_type = url.searchParams.get('benchmark_type') || 'sector';
  const metrics = url.searchParams.get('metrics')?.split(',') || ['PROGRAM_EXPENSE_RATIO', 'ADMIN_EXPENSE_RATIO'];

  const sb = await createSb();

  if (holding_id) {
    // Benchmark a specific holding
    const { data: holding, error: holdingError } = await sb
      .from('holdings')
      .select('id, name, sector, country, funds_allocated, amount_invested, current_value')
      .eq('id', holding_id)
      .eq('portfolio_id', portfolio_id)
      .is('deleted_at', null)
      .single();

    if (holdingError) {
      if (holdingError.code !== 'PGRST116') {
        return NextResponse.json({ error: holdingError.message }, { status: 500, headers: cacheHeaders() });
      }
      return NextResponse.json({ error: 'Holding not found' }, { status: 404, headers: cacheHeaders() });
    }
    if (!holding) {
      return NextResponse.json({ error: 'Holding not found' }, { status: 404, headers: cacheHeaders() });
    }

    // Get peer holdings
    let peerQuery = sb
      .from('holdings')
      .select('id, name, sector, country, funds_allocated, amount_invested, current_value')
      .eq('portfolio_id', portfolio_id)
      .neq('id', holding_id)
      .is('deleted_at', null);

    if (benchmark_type === 'sector' && holding.sector) {
      peerQuery = peerQuery.eq('sector', holding.sector);
    } else if (benchmark_type === 'geography' && holding.country) {
      peerQuery = peerQuery.eq('country', holding.country);
    }

    const { data: peers, error: peersError } = await peerQuery;
    if (peersError) {
      return NextResponse.json({ error: peersError.message }, { status: 500, headers: cacheHeaders() });
    }

    // Get external benchmark data
    let benchmarkKey = holding.sector || 'General';
    if (benchmark_type === 'size') {
      const revenue = allocationValue(holding) ?? 0;
      if (revenue < 1000000) benchmarkKey = 'Small (<$1M)';
      else if (revenue < 10000000) benchmarkKey = 'Medium ($1M-$10M)';
      else benchmarkKey = 'Large ($10M+)';
    }

    const { data: benchmarks } = await sb
      .from('benchmark_data')
      .select('*')
      .eq('benchmark_type', benchmark_type === 'size' ? 'size_band' : benchmark_type)
      .eq('benchmark_key', benchmarkKey)
      .in('metric_code', metrics.map(m => m.toUpperCase()))
      .order('data_year', { ascending: false });

    // Calculate percentiles for holding
    const metricResults: Record<string, any> = {};

    for (const metric of metrics) {
      const metricUpper = metric.toUpperCase();

      // Get holding's value
      let holdingValue = null;

      if (metricUpper === 'FUNDS_ALLOCATED') {
        holdingValue = allocationValue(holding);
      }

      // Get peer values
      const peerValues = (peers || [])
        .map((p: BenchmarkHolding) => {
          if (metricUpper === 'FUNDS_ALLOCATED') return allocationValue(p);
          return null;
        })
        .filter((v): v is number => v !== null && v !== undefined);

      // Calculate percentile within portfolio
      const allValues = [...peerValues, holdingValue].filter((v): v is number => v !== null).sort((a, b) => a - b);
      const portfolioPercentile = holdingValue !== null && allValues.length > 1
        ? (allValues.indexOf(holdingValue) / (allValues.length - 1)) * 100
        : null;

      // Get external benchmark
      const externalBenchmark = benchmarks?.find(b => b.metric_code === metricUpper);

      // Calculate percentile vs external benchmark
      let externalPercentile = null;
      if (holdingValue !== null && externalBenchmark) {
        if (holdingValue <= externalBenchmark.percentile_25) {
          externalPercentile = 25 * (holdingValue / externalBenchmark.percentile_25);
        } else if (holdingValue <= externalBenchmark.percentile_50) {
          externalPercentile = 25 + 25 * ((holdingValue - externalBenchmark.percentile_25) / (externalBenchmark.percentile_50 - externalBenchmark.percentile_25));
        } else if (holdingValue <= externalBenchmark.percentile_75) {
          externalPercentile = 50 + 25 * ((holdingValue - externalBenchmark.percentile_50) / (externalBenchmark.percentile_75 - externalBenchmark.percentile_50));
        } else {
          externalPercentile = 75 + 25 * Math.min(1, (holdingValue - externalBenchmark.percentile_75) / (externalBenchmark.percentile_75 * 0.5));
        }
      }

      metricResults[metricUpper] = {
        holding_value: holdingValue,
        portfolio_peer_count: peerValues.length,
        portfolio_percentile: portfolioPercentile !== null ? Math.round(portfolioPercentile) : null,
        portfolio_average: peerValues.length > 0 ? peerValues.reduce((a, b) => a + b, 0) / peerValues.length : null,
        portfolio_median: peerValues.length > 0 ? peerValues[Math.floor(peerValues.length / 2)] : null,
        external_benchmark: externalBenchmark ? {
          benchmark_key: benchmarkKey,
          percentile_25: externalBenchmark.percentile_25,
          percentile_50: externalBenchmark.percentile_50,
          percentile_75: externalBenchmark.percentile_75,
          sample_size: externalBenchmark.sample_size,
          data_source: externalBenchmark.data_source,
        } : null,
        external_percentile: externalPercentile !== null ? Math.round(externalPercentile) : null,
      };
    }

    return NextResponse.json({
      benchmark: {
        holding: {
          id: holding.id,
          name: holding.name,
          sector: holding.sector,
          country: holding.country,
        },
        benchmark_type,
        benchmark_key: benchmarkKey,
        metrics: metricResults,
      },
    }, { headers: cacheHeaders() });

  } else {
    // Portfolio-wide benchmark summary
    const { data: holdings, error: holdingsError } = await sb
      .from('holdings')
      .select('id, name, sector, country, funds_allocated, amount_invested, current_value')
      .eq('portfolio_id', portfolio_id)
      .is('deleted_at', null);

    if (holdingsError) {
      return NextResponse.json({ error: holdingsError.message }, { status: 500, headers: cacheHeaders() });
    }

    if (!holdings || holdings.length === 0) {
      return NextResponse.json({ error: 'No holdings found' }, { status: 404, headers: cacheHeaders() });
    }

    // Group by sector
    const bySector: Record<string, any[]> = {};
    holdings.forEach((h: any) => {
      const sector = h.sector || 'Unknown';
      if (!bySector[sector]) bySector[sector] = [];
      bySector[sector].push(h);
    });

    // Get benchmarks for all sectors
    const sectors = Object.keys(bySector);
    const { data: benchmarks } = await sb
      .from('benchmark_data')
      .select('*')
      .eq('benchmark_type', 'sector')
      .in('benchmark_key', sectors)
      .order('data_year', { ascending: false });

    const sectorResults: Record<string, any> = {};

    for (const [sector, sectorHoldings] of Object.entries(bySector)) {
      const sectorBenchmarks = benchmarks?.filter(b => b.benchmark_key === sector) || [];

      // Calculate sector averages
      const avgProgramRatio = null;

      const benchmark = sectorBenchmarks.find(b => b.metric_code === 'PROGRAM_EXPENSE_RATIO');

      sectorResults[sector] = {
        holding_count: sectorHoldings.length,
        total_allocation: sectorHoldings.reduce((sum, h) => sum + (allocationValue(h) ?? 0), 0),
        avg_program_expense_ratio: avgProgramRatio,
        benchmark_median: benchmark?.percentile_50,
        vs_benchmark: avgProgramRatio && benchmark?.percentile_50
          ? ((avgProgramRatio - benchmark.percentile_50) / benchmark.percentile_50) * 100
          : null,
      };
    }

    return NextResponse.json({
      portfolio_benchmarks: {
        total_holdings: holdings.length,
        sector_count: sectors.length,
        by_sector: sectorResults,
      },
    }, { headers: cacheHeaders() });
  }
}
