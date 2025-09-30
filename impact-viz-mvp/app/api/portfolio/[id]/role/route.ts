import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: pid } = await ctx.params;

  // await cookies()
  const c = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (n: string) => c.get(n)?.value,
        set: (n: string, v: string, o: any) => c.set({ name: n, value: v, ...o }),
        remove: (n: string, o: any) => c.set({ name: n, value: '', ...o }),
      },
    }
  );

  // role string
  const { data: roleVal, error: roleErr } = await supabase.rpc('role_for_portfolio', { p_portfolio_id: pid });
  if (roleErr) return NextResponse.json({ error: roleErr.message }, { status: 500 });

  // can edit boolean
  const { data: canEdit, error: editErr } = await supabase.rpc('can_edit_portfolio', { p_portfolio_id: pid });
  if (editErr) return NextResponse.json({ error: editErr.message }, { status: 500 });

  return NextResponse.json({ role: roleVal ?? 'viewer', can_edit: !!canEdit }, { headers: { 'Cache-Control': 'no-store' } });
}