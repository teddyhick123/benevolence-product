import { NextResponse } from 'next/server';
import { isAccessDenied, requireAppAdmin } from '@/lib/api/access';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const access = await requireAppAdmin();
  if (isAccessDenied(access)) return access.response;

  const { id: portfolioId } = await ctx.params;
  const sb = access.context.db;

  const { data: portfolio } = await sb
    .from('portfolios')
    .select('org_id')
    .eq('id', portfolioId)
    .single();

  if (!portfolio) {
    return NextResponse.json({ data: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const { data, error } = await sb
    .from('kpi_definitions')
    .select('id, slug, name, target_value, unit, display_order')
    .eq('org_id', portfolio.org_id)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
  return NextResponse.json({ data: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
}
