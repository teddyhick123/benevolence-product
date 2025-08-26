// app/api/portfolio/[id]/kpi-series/route.ts
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params;
  const url = new URL(req.url);
  const metric = url.searchParams.get('metric') || 'WACI';

  const c = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n) => c.get(n)?.value,
        set: (n, v, o) => c.set({ name: n, value: v, ...o }),
        remove: (n, o) => c.set({ name, value: '', ...o }),
      },
    }
  );

  // Get holdings in portfolio
  const { data: holdings, error: hErr } = await supabase
    .from('holdings')
    .select('id')
    .eq('portfolio_id', portfolioId);
  if (hErr) return NextResponse.json({ error: hErr.message }, { status: 500 });

  const holdingIds = (holdings ?? []).map((h: any) => h.id);
  if (!holdingIds.length) return NextResponse.json({ series: [] });

  // Fetch facts for metric, sort by period_end
  const { data: facts, error: fErr } = await supabase
    .from('metric_facts')
    .select('holding_id, metric_code, value, period_end')
    .in('holding_id', holdingIds)
    .eq('metric_code', metric)
    .order('period_end', { ascending: true });

  if (fErr) return NextResponse.json({ error: fErr.message }, { status: 500 });

  // Aggregate by date
  const byDate = new Map<string, number>();
  for (const row of facts ?? []) {
    const d = row.period_end || '1970-01-01';
    const v = Number(row.value ?? 0);
    byDate.set(d, (byDate.get(d) ?? 0) + (isFinite(v) ? v : 0));
  }
  const series = Array.from(byDate.entries()).map(([date, value]) => ({ date, value }));
  series.sort((a, b) => a.date.localeCompare(b.date));

  return NextResponse.json({ series });
}