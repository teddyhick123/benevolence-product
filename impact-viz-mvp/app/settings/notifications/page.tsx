// app/settings/notifications/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import NotificationsTab from '@/components/settings/NotificationsTab';

export default async function NotificationsPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get('x-org-id')?.value;
  if (!orgId) redirect('/welcome');

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const adminClient = createAdminClient();
  const { data: membership } = await adminClient
    .from('organization_members')
    .select('notification_prefs')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single();

  const prefs = membership?.notification_prefs || { digest: 'weekly', alerts: ['member_joined', 'module_changed'] };

  return (
    <NotificationsTab
      orgId={orgId}
      userId={user.id}
      initialPrefs={prefs}
    />
  );
}
