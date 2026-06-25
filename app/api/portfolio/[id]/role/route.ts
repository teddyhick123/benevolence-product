import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: pid } = await ctx.params;

  const supabase = await createSupabaseServerClient();

  // role string
  const { data: roleVal, error: roleErr } = await supabase.rpc('user_portfolio_role', { p_portfolio_id: pid });
  if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 });

  // can edit boolean
  const { data: canEdit, error: editErr } = await supabase.rpc('can_edit_portfolio', { p_portfolio_id: pid });
  if (editErr) return NextResponse.json({ error: editErr.message }, { status: 500 });

  return NextResponse.json({ role: roleVal ?? 'viewer', can_edit: !!canEdit }, { headers: { 'Cache-Control': 'no-store' } });
}
