import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase';
import IntegrationsTab from '@/components/settings/IntegrationsTab';

export default async function IntegrationsPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get('x-org-id')?.value;
  if (!orgId) redirect('/welcome');

  const adminClient = createAdminClient();
  const { data: qbConn } = await adminClient
    .from('quickbooks_connections')
    .select('id')
    .eq('org_id', orgId)
    .maybeSingle();

  return <IntegrationsTab qbConnected={!!qbConn} orgId={orgId} />;
}
