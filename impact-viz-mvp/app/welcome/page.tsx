// app/welcome/page.tsx
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import Link from 'next/link';

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
        remove(name: string) {
          c.delete(name);
        },
      },
    }
  );

  // 2) Get the current user (server-side, no API hop)
  const { data: { user } } = await supabase.auth.getUser();

  // 3) Check onboarding status if user is signed in
  let onboardingStatus: 'not_started' | 'in_progress' | 'completed' = 'not_started';
  let onboardingSession: any = null;

  if (user) {
    // Check for onboarding session
    const { data: session } = await supabase
      .from('onboarding_sessions')
      .select('id, status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (session) {
      onboardingSession = session;
      onboardingStatus = session.status === 'completed' ? 'completed' : 'in_progress';
    }
  }

  // 4) If signed in, load the member portfolios directly
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
          You're not signed in. <a href="/login" className="text-azure underline">Sign in</a> to see your portfolios.
        </div>
      ) : (
        <>
          {/* Onboarding CTA */}
          {onboardingStatus === 'not_started' && (
            <div className="card p-6 bg-gradient-to-r from-azure/5 to-azure/10 border-azure/20">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-azure rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h2 className="font-semibold text-neutral-900 mb-1">Get Started with Personalized Setup</h2>
                  <p className="text-sm text-neutral-600 mb-4">
                    Let our AI assistant help you configure your workspace in just a few minutes.
                    We'll learn about your needs and recommend the right modules for you.
                  </p>
                  <Link
                    href="/onboarding"
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-azure text-white rounded-lg font-medium hover:bg-azure/90 transition-colors"
                  >
                    Start Setup
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {onboardingStatus === 'in_progress' && (
            <div className="card p-6 bg-amber-50 border-amber-200">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-amber-500 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h2 className="font-semibold text-neutral-900 mb-1">Continue Your Setup</h2>
                  <p className="text-sm text-neutral-600 mb-4">
                    You have an onboarding session in progress. Pick up where you left off.
                  </p>
                  <Link
                    href="/onboarding"
                    className="inline-flex items-center gap-2 px-6 py-2.5 bg-amber-500 text-white rounded-lg font-medium hover:bg-amber-600 transition-colors"
                  >
                    Continue Setup
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {onboardingStatus === 'completed' && (
            <div className="card p-4 bg-green-50 border-green-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <div className="flex-1">
                  <span className="text-sm text-green-800 font-medium">Setup complete!</span>
                  <span className="text-sm text-green-700 ml-2">
                    Your workspace is configured.{' '}
                    <Link href="/onboarding" className="underline hover:no-underline">
                      Review your setup
                    </Link>
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Portfolios */}
          {portfolios.length === 0 ? (
            <div className="card p-6 text-sm text-neutral-600">
              No portfolios yet. {onboardingStatus !== 'completed' && 'Complete your setup to get started, or'} An admin can add you to one.
            </div>
          ) : (
            <div className="space-y-3">
              <h2 className="text-lg font-medium text-neutral-900">Your Portfolios</h2>
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
            </div>
          )}
        </>
      )}
    </div>
  );
}
