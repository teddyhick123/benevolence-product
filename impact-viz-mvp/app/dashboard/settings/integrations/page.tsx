// app/dashboard/settings/integrations/page.tsx
// Settings page for third-party integrations (QuickBooks Online, etc.)

import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase';
import QuickBooksSettings from '@/components/integrations/QuickBooksSettings';

export const dynamic = 'force-dynamic';

export default async function IntegrationsSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  // Resolve the active portfolio from membership
  const { data: memberships } = await supabase
    .from('portfolio_members')
    .select('portfolio_id, role, portfolios(id, name)')
    .eq('user_id', user.id)
    .order('role')
    .limit(1);

  const portfolioId = memberships?.[0]?.portfolio_id;

  if (!portfolioId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <p className="text-sm text-gray-500">No portfolio found. Please contact your administrator.</p>
      </div>
    );
  }

  const sp = (await searchParams) ?? {};

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Integrations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect external accounting tools to sync data with Benevolence.
        </p>
      </div>

      {/* OAuth feedback banners */}
      {sp.connected === '1' && (
        <div className="mb-6 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          QuickBooks connected successfully.
        </div>
      )}
      {sp.error && (
        <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          QuickBooks connection error: {sp.error}
        </div>
      )}

      <QuickBooksSettings portfolioId={portfolioId} />
    </div>
  );
}
