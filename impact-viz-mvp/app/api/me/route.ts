import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function GET() {
  const c = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return c.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          c.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          c.set({ name, value: '', ...options });
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ user: null, portfolios: [] });
  }

  // Fetch memberships -> portfolios
  const { data: memberships, error } = await supabase
    .from('portfolio_members')
    .select(`
      role,
      portfolios:portfolios (
        id,
        name,
        base_currency
      )
    `)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({
      user: { id: user.id, email: user.email },
      portfolios: [],
      error: error.message,
    });
  }

  const portfolios = (memberships ?? [])
    .map((m: any) => ({
      id: m?.portfolios?.id,
      name: m?.portfolios?.name,
      base_currency: m?.portfolios?.base_currency,
      role: m?.role,
    }))
    .filter((p: any) => p.id);

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    portfolios,
  });
}