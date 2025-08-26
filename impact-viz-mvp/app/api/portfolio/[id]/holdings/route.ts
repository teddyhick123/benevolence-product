import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabasePublic';

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params; // <-- await
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const offset = Number(url.searchParams.get('offset') ?? 0);

  const sb = supabasePublic();
  const { data, error, count } = await sb
    .from('holdings')
    .select(`
      id,
      portfolio_id,
      investee_id,
      instrument_type,
      asset_class,
      nav,
      as_of_date,
      custodian,
      valuation_method,
      investees:investees (
        id, display_name, sector, impact_theme, country, region, listed_private
      )
    `, { count: 'exact' })
    .eq('portfolio_id', portfolioId)
    .order('as_of_date', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data: data ?? [],
    count: count ?? 0,
    nextOffset: (count ?? 0) > offset + limit ? offset + limit : null,
  });
}