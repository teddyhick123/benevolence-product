// app/admin/constructor/page.tsx
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import ConstructorPanel from '@/components/constructor/ConstructorPanel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ConstructorPage() {
  const c = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return c.get(name)?.value; },
        set(name: string, value: string, options: any) { c.set({ name, value, ...options }); },
        remove(name: string, options: any) { c.set({ name, value: '', ...options }); },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Constructor</h1>
        <div className="card p-6 text-sm text-neutral-600">
          You're not signed in. <a href="/login" className="text-azure underline">Sign in</a> to continue.
        </div>
      </div>
    );
  }

  const { data: isAdmin, error: adminErr } = await supabase.rpc('is_admin');
  if (adminErr || !isAdmin) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold">Constructor</h1>
        <div className="card p-6 text-sm text-neutral-600">
          Admin access required. If you should have access, ask an existing admin to grant you admin rights.
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl flex flex-col h-[calc(100vh-8rem)]">
      <div className="flex items-center gap-3 mb-4 shrink-0">
        <h1 className="text-2xl font-semibold">Constructor</h1>
        <span className="inline-flex items-center text-xs px-3 py-0.5 rounded-full bg-azure/10 text-azure border border-azure/20 whitespace-nowrap leading-none">
          AI Coding Assistant
        </span>
      </div>
      <div className="flex-1 card overflow-hidden flex flex-col min-h-0">
        <ConstructorPanel />
      </div>
    </div>
  );
}
