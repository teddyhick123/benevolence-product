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
          try {
            c.set({ name, value, ...options });
          } catch (error) {
            // Safe to ignore in read-only contexts
          }
        },
        remove(name: string) {
          try {
            c.delete(name);
          } catch (error) {
            // Safe to ignore in read-only contexts
          }
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ user: null, portfolios: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }

  // Fetch org membership
  const { data: orgMembership } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .maybeSingle();

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
    }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const portfolios = (memberships ?? [])
    .map((m: any) => ({
      id: m?.portfolios?.id,
      name: m?.portfolios?.name,
      base_currency: m?.portfolios?.base_currency,
      role: m?.role,
    }))
    .filter((p: any) => p.id);
  const recommended_portfolio_id = portfolios[0]?.id ?? null;

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    portfolios,
    // backward-compatible field expected by some pages
    portfolio_id: recommended_portfolio_id,
    // keep the explicit field as well for newer callers
    recommended_portfolio_id,
    // org membership
    organization_id: orgMembership?.org_id ?? null,
    error: null,
  }, { headers: { 'Cache-Control': 'no-store' } });
}
