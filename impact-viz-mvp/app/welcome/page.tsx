// app/welcome/page.tsx
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Welcome() {
  // 1) Build SSR Supabase client with request cookies
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
          // Route handlers & server components can mutate cookies in Next 14
          c.set({ name, value, ...options });
        },
        remove(name: string, options: any) {
          c.set({ name, value: '', ...options });
        },
      },
    }
  );

  // 2) Get the current user (server-side, no API hop)
  const { data: { user } } = await supabase.auth.getUser();

  // 3) If signed in, load the member portfolios directly
  let portfolios: Array<{ id: string; name: string; base_currency: string | null; role: string }> = [];
  if (user) {
    const { data: memberships } = await supabase
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

    portfolios =
      (memberships ?? [])
        .map((m: any) => ({
          id: m?.portfolios?.id,
          name: m?.portfolios?.name,
          base_currency: m?.portfolios?.base_currency ?? null,
          role: m?.role,
        }))
        .filter(p => p.id);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Welcome</h1>

      {!user ? (
        <div className="card p-6 text-sm text-neutral-600">
          You’re not signed in. <a href="/login" className="text-azure underline">Sign in</a> to see your portfolios.
        </div>
      ) : portfolios.length === 0 ? (
        <div className="card p-6 text-sm text-neutral-600">
          No portfolios yet. An admin can add you to one.
        </div>
      ) : (
        <div className="grid gap-3">
          {portfolios.map((p) => (
            <a
              key={p.id}
              href={`/dashboard?portfolio_id=${encodeURIComponent(p.id)}`}
              className="card p-4 flex items-center justify-between hover:shadow transition"
            >
              <div>
                <div className="font-medium">{p.name}</div>
                <div className="text-xs text-neutral-500">
                  {p.role} • {p.base_currency || 'USD'}
                </div>
              </div>
              <span className="text-azure">Open →</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}