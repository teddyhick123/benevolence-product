import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabasePublic';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params; // await per Next.js async params
  const sb = supabasePublic();

  const { data, error } = await sb
    .from('v_portfolio_latest')
    .select('*')
    .eq('portfolio_id', portfolioId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data });
}
