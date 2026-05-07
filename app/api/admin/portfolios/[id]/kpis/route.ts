import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabase';

// Members (via RLS) can read portfolio_metric_targets for their portfolios
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params;
  const sb = await supabasePublic();

  const { data, error } = await sb
    .from('portfolio_metric_targets')
    .select('id, metric_code, display_name, target_value, target_date')
    .eq('portfolio_id', portfolioId)
    .order('metric_code', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
