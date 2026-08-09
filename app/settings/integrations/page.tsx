import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createQuickBooksRepository } from '@/lib/api/repositories/quickbooks';
import IntegrationsTab from '@/components/settings/IntegrationsTab';

export default async function IntegrationsPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get('x-org-id')?.value;
  if (!orgId) redirect('/onboarding');

  const access = await requireOrgAccess(orgId, 'viewer');
  if (isAccessDenied(access)) redirect('/dashboard');
  const status = await createQuickBooksRepository({
    orgId,
    actorId: access.context.principal.userId,
  }).getConnectionStatus();

  return (
    <IntegrationsTab
      qbConnected={status.connected}
      qbTokenExpired={status.tokenExpired}
      qbNeedsReconnect={status.needsReconnect}
      orgId={orgId}
    />
  );
}
