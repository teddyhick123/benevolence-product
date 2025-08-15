import { NextRequest, NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseServer';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = supabaseServer();
  const { data, error } = await supabase
    .from('holdings')
    .select('id, nav, as_of_date, asset_class, investees(display_name)')
    .eq('portfolio_id', params.id)
    .order('nav', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data||[]).map((h:any)=> ({
    id: h.id,
    name: h.investees?.display_name,
    nav: h.nav,
    asset_class: h.asset_class,
    last_updated: h.as_of_date
  }));

  return NextResponse.json({ rows });
}
