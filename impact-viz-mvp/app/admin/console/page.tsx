// app/admin/console/page.tsx
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import Link from 'next/link';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminConsole() {
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

  // Ensure signed in
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Admin Console</h1>
        <div className="card p-6 text-sm text-neutral-600">
          You’re not signed in. <a href="/login" className="text-azure underline">Sign in</a> to continue.
        </div>
      </div>
    );
  }

  // Check admin via RPC (created in Phase 2 SQL)
  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin');
  if (adminErr || !isAdmin) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Admin Console</h1>
        <div className="card p-6 text-sm text-neutral-600">
          You don’t have access to this area. If you should, ask an existing admin to grant you admin rights.
        </div>
      </div>
    );
  }

  // Load portfolios + member counts
  const { data: portfolios, error: pErr } = await supabase
    .from('portfolios')
    .select(`
      id,
      name,
      base_currency,
      portfolio_members:portfolio_members(count)
    `)
    .order('name', { ascending: true });

  if (pErr) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Admin Console</h1>
        <div className="card p-6 text-sm text-red-700 bg-red-50 border border-red-200">
          Failed to load portfolios: {pErr.message}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Admin Console</h1>
        <div className="flex items-center gap-2">
          <Link href="/admin/imports" className="px-4 py-2 rounded-md border border-black/10 hover:bg-white shadow-sm text-sm transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none">
            Data Imports
          </Link>
          <Link href="/admin/portfolios/new" className="px-4 py-2 rounded-md bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none">
            New Portfolio
          </Link>
        </div>
      </div>

      {(!portfolios || portfolios.length === 0) ? (
        <div className="card p-6 text-sm text-neutral-600 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg will-change-transform rm:transition-none rm:transform-none">
          No portfolios yet. Create one to get started.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {portfolios.map((p: any) => {
            const memberCount = Array.isArray(p.portfolio_members) && p.portfolio_members.length
              ? p.portfolio_members[0].count ?? 0
              : 0;
            return (
              <div key={p.id} className="card p-5 flex flex-col gap-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg will-change-transform rm:transition-none rm:transform-none">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-neutral-500">{p.base_currency || 'USD'}</div>
                  </div>
                  <span className="inline-flex items-center text-xs px-3 py-0.5 rounded-full bg-azure/10 text-azure border border-azure/20 whitespace-nowrap shrink-0 leading-none">
                    {memberCount} member{memberCount === 1 ? '' : 's'}
                  </span>
                </div>

                <div className="flex flex-wrap gap-2 mt-2 justify-between">
                  <Link
                    href={`/dashboard?portfolio_id=${encodeURIComponent(p.id)}`}
                    className="flex-1 text-center text-sm px-3 py-2 rounded-md bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none"
                  >
                    Dashboard
                  </Link>
                  <Link
                    href={`/admin/portfolios/${p.id}/members`}
                    className="flex-1 text-center text-sm px-3 py-2 rounded-md border border-black/10 hover:bg-white shadow-sm hover:shadow transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none"
                  >
                    Members
                  </Link>
                  <Link
                    href={`/admin/portfolios/${p.id}/settings`}
                    className="flex-1 text-center text-sm px-3 py-2 rounded-md border border-black/10 hover:bg-white shadow-sm hover:shadow transition-transform duration-200 hover:-translate-y-0.5 will-change-transform rm:transition-none rm:transform-none"
                  >
                    Settings
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}