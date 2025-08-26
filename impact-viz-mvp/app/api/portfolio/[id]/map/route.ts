import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabasePublic';

export async function GET(_: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params; // <-- await params
  const sb = supabasePublic();

  const { data, error } = await sb
    .from('holdings')
    .select(`id, portfolio_id, investees:investees (country)`)
    .eq('portfolio_id', portfolioId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const countries = (data ?? []).map((h: any) => h.investees?.country).filter(Boolean) as string[];

  // Count per country (you can enrich with centroids server-side later)
  const counts = countries.reduce<Record<string, number>>((acc, c) => {
    acc[c] = (acc[c] ?? 0) + 1;
    return acc;
  }, {});
  const points = Object.entries(counts).map(([country, weight]) => ({
    country,
    weight,
    lat: null,
    lon: null,
  }));

  return NextResponse.json({ points });
}