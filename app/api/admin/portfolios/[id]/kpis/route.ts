import { NextResponse } from 'next/server';
import { supabasePublic } from '@/lib/supabase';
import { requireAdmin } from '@/lib/admin-auth';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const adminUserId = await requireAdmin();
  if (!adminUserId) {
    return NextResponse.json(
      { error: 'not authorized' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const { id: portfolioId } = await ctx.params;
  const sb = await supabasePublic();

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
