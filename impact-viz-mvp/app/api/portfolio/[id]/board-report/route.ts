// GET /api/portfolio/[id]/board-report?as_of=2024-12-31
// Generates a board-level portfolio summary PDF

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import type { BoardReportData } from '@/lib/pdf/board-report-generator';

export async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  // Auth guard — require authenticated user
  const authClient = await createServerClient();
  const { data: { user } } = await authClient.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: portfolioId } = await ctx.params;
  const url = new URL(req.url);
  const asOf = url.searchParams.get('as_of') ?? new Date().toISOString().slice(0, 10);
  const taxYear = Number(url.searchParams.get('year') ?? new Date().getFullYear());

  // Use the authed client so RLS enforces portfolio ownership
  const sb = authClient;

  const [
    { data: portfolio },
    { data: holdings },
    { data: contributions },
    { data: kpiSeries },
  ] = await Promise.all([
    sb.from('portfolios').select('name').eq('id', portfolioId).single(),
    sb.from('holdings').select('name, value_usd, asset_class, sector').eq('portfolio_id', portfolioId),
    sb
      .from('v_tax_contributions_enriched')
      .select('amount_usd')
      .eq('portfolio_id', portfolioId)
      .eq('tax_year', taxYear),
    sb
      .from('portfolio_kpis')
      .select('name, value, unit, trend')
      .eq('portfolio_id', portfolioId)
      .limit(12),
  ]);

  if (!portfolio) {
    return NextResponse.json({ error: 'Portfolio not found or access denied' }, { status: 403 });
  }

  const holdingsList = holdings ?? [];
  const contributionsList = contributions ?? [];

  // Aggregate holdings by asset class
  const assetClassMap = new Map<string, number>();
  for (const h of holdingsList) {
    const key = h.asset_class ?? 'Other';
    assetClassMap.set(key, (assetClassMap.get(key) ?? 0) + (h.value_usd ?? 0));
  }
  const totalPortfolioValue = [...assetClassMap.values()].reduce((s, v) => s + v, 0);
  const holdingsByAssetClass = [...assetClassMap.entries()]
    .map(([assetClass, value]) => ({
      assetClass,
      value,
      percent: totalPortfolioValue > 0 ? Math.round((value / totalPortfolioValue) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.value - a.value);

  // Aggregate holdings by sector
  const sectorMap = new Map<string, { value: number; count: number }>();
  for (const h of holdingsList) {
    const key = h.sector ?? 'Other';
    const existing = sectorMap.get(key) ?? { value: 0, count: 0 };
    sectorMap.set(key, { value: existing.value + (h.value_usd ?? 0), count: existing.count + 1 });
  }
  const holdingsBySector = [...sectorMap.entries()]
    .map(([sector, stats]) => ({ sector, ...stats }))
    .sort((a, b) => b.value - a.value);

  // Top holdings by value
  const topHoldings = holdingsList
    .filter(h => h.value_usd != null)
    .sort((a, b) => (b.value_usd ?? 0) - (a.value_usd ?? 0))
    .slice(0, 10)
    .map(h => ({
      name: h.name ?? 'Unknown',
      value: h.value_usd ?? 0,
      sector: h.sector ?? 'Other',
      assetClass: h.asset_class ?? 'Other',
    }));

  const totalContributions = contributionsList.reduce((s, c) => s + (c.amount_usd ?? 0), 0);

  const reportData: BoardReportData = {
    portfolioName: portfolio.name,
    reportDate: new Date().toISOString(),
    asOfDate: asOf,
    totalPortfolioValue,
    holdingsCount: holdingsList.length,
    holdingsByAssetClass,
    holdingsBySector,
    taxYear,
    totalContributions,
    contributionCount: contributionsList.length,
    topHoldings,
    kpis: (kpiSeries ?? []).map((k: any) => ({
      name: k.name,
      value: String(k.value),
      unit: k.unit ?? '',
      trend: k.trend ?? undefined,
    })),
  };

  const { generateBoardReportPDF } = await import('@/lib/pdf/board-report-generator');
  const buffer = generateBoardReportPDF(reportData);

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="board-report-${asOf}.pdf"`,
    },
  });
}
