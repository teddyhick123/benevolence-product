// app/welcome/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@supabase/ssr';
import SetupClient from './SetupClient';
import { branding } from '@/lib/config';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function Welcome() {
  const c = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) { return c.get(name)?.value; },
        set(name: string, value: string, options: any) { c.set({ name, value, ...options }); },
        remove(name: string) { c.delete(name); },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // Check if user already belongs to an org
  const { data: orgMemberships } = await supabase
    .from('organization_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1);

  if (orgMemberships && orgMemberships.length > 0) {
    // User has an org — find their first portfolio and go straight to the dashboard
    const { data: portfolioMemberships } = await supabase
      .from('portfolio_members')
      .select('portfolio_id')
      .eq('user_id', user.id)
      .limit(1);

    if (portfolioMemberships && portfolioMemberships.length > 0) {
      redirect(`/dashboard?portfolio_id=${encodeURIComponent(portfolioMemberships[0].portfolio_id)}`);
    }

    // Has org but no portfolio (edge case) — go to dashboard anyway
    redirect('/dashboard');
  }

  // Brand new user — show org setup form
  return (
    <div className="mx-auto max-w-lg space-y-6 py-12 px-4">
      <div>
        <h1 className="text-2xl font-semibold">Welcome to {branding.appName}</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Let&apos;s create your organization to get started. This takes about 30 seconds.
        </p>
      </div>
      <SetupClient />
    </div>
  );
}
