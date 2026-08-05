

// app/api/portfolio/[id]/metrics/sector-aggregate/route.ts
import { NextResponse } from 'next/server';
import { requirePortfolioAccess, isAccessDenied } from '@/lib/api/access';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const access = await requirePortfolioAccess(portfolio_id);
  if (isAccessDenied(access)) return access.response;
  const url = new URL(req.url);
  const metric = (url.searchParams.get('metric') || '').trim();

  if (!metric) {
    return NextResponse.json({ error: 'metric query param is required', rows: [] }, { status: 400, headers: cacheHeaders() });
  }

  const sb = access.context.db;

  // Pull a recent slice of facts for this metric, scoped to holdings in the portfolio.
  // We'll aggregate by sector in Node to avoid requiring a DB view for now.
  const { data, error } = await sb
    .from('metric_facts')
    .select(`
      value,
      metric_code,
      investees:investees ( sector ),
      holdings!inner ( portfolio_id )
    `)
    .eq('metric_code', metric)
    .eq('holdings.portfolio_id', portfolio_id)
    .order('period_end', { ascending: false })
    .limit(2000); // safety cap

  if (error) {
    return NextResponse.json({ error: error.message, rows: [] }, { status: 500, headers: cacheHeaders() });
  }

  // Aggregate in memory by sector
  const bySector: Record<string, number> = {};
  for (const r of (data ?? [])) {
    const sector = (r as any)?.investees?.sector || 'Other';
    const v = Number((r as any)?.value);
    if (Number.isFinite(v)) bySector[sector] = (bySector[sector] ?? 0) + v;
  }

  const rows = Object.entries(bySector)
    .map(([sector, value]) => ({ sector, value }))
    .sort((a, b) => b.value - a.value);

  return NextResponse.json({ rows }, { headers: cacheHeaders() });
}
