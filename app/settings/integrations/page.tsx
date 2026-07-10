import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase';
import IntegrationsTab from '@/components/settings/IntegrationsTab';

export default async function IntegrationsPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get('x-org-id')?.value;
  if (!orgId) redirect('/onboarding');

  const adminClient = createAdminClient();
  const { data: qbConn } = await adminClient
    .from('quickbooks_connections')
    .select('id, expires_at, refresh_expires_at')
    .eq('org_id', orgId)
    .maybeSingle();

  const now = new Date();
  const qbTokenExpired = qbConn?.expires_at ? new Date(qbConn.expires_at) <= now : false;
  const qbNeedsReconnect = qbConn?.refresh_expires_at ? new Date(qbConn.refresh_expires_at) <= now : false;

  return <IntegrationsTab qbConnected={!!qbConn} qbTokenExpired={qbTokenExpired} qbNeedsReconnect={qbNeedsReconnect} orgId={orgId} />;
}
