

// app/api/portfolio/[id]/metrics/sector-aggregate/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

function cacheHeaders() {
  return { 'Cache-Control': 'no-store' } as const;
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolio_id } = await ctx.params;
  const url = new URL(req.url);
  const metric = (url.searchParams.get('metric') || '').trim();

  if (!metric) {
    return NextResponse.json({ error: 'metric query param is required', rows: [] }, { status: 400, headers: cacheHeaders() });
  }

  const c = await cookies();
  const sb = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => c.get(n)?.value,
        set: (n: string, v: string, o: any) => c.set({ name: n, value: v, ...o }),
        remove: (n: string, o: any) => c.set({ name: n, value: '', ...o }),
      },
    }
  );

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
    console.error('sector-aggregate error:', error);
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