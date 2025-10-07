import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabasePublic';

// Members (via RLS) can read kpi_definitions for their portfolios
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params;
  const sb = await supabasePublic();

  const { data, error } = await sb
    .from('kpi_definitions')
    .select('metric_code, display_name, target_value, target_date, order_index')
    .eq('portfolio_id', portfolioId)
    .order('order_index', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}