import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { branding } from '@/lib/config';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import QuickBooksSettings from '@/components/integrations/QuickBooksSettings';

export const dynamic = 'force-dynamic';

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const orgId = (await cookies()).get('x-org-id')?.value;
  if (!orgId) redirect('/onboarding');

  const access = await requireOrgAccess(orgId, 'viewer');
  if (isAccessDenied(access)) redirect('/dashboard');

  const params = (await searchParams) ?? {};
  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">Integrations</h1>
        <p className="mt-1 text-sm text-gray-500">
          Connect external accounting tools to sync data with {branding.appName}.
        </p>
      </div>
      {params.connected === '1' && (
        <div className="mb-6 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          QuickBooks connected successfully.
        </div>
      )}
      {params.error && (
        <div className="mb-6 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-800">
          QuickBooks connection error: {params.error}
        </div>
      )}
      <QuickBooksSettings orgId={orgId} />
    </div>
  );
}
