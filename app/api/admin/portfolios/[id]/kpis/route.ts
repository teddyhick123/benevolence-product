import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabase';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = await ctx.params;
  const sb = await supabasePublic();

  const { data: portfolio } = await sb
    .from('portfolios')
    .select('org_id')
    .eq('id', portfolioId)
    .single();

  if (!portfolio) return NextResponse.json({ data: [] });

  const { data, error } = await sb
    .from('kpi_definitions')
    .select('id, slug, name, target_value, unit, display_order')
    .eq('org_id', portfolio.org_id)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ data: data ?? [] });
}
