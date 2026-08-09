// app/settings/notifications/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createNotificationPreferenceRepository } from '@/lib/api/repositories/notifications';
import NotificationsTab from '@/components/settings/NotificationsTab';

export default async function NotificationsPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get('x-org-id')?.value;
  if (!orgId) redirect('/onboarding');

  const access = await requireOrgAccess(orgId, 'viewer');
  if (isAccessDenied(access)) redirect('/dashboard');
  const prefs = await createNotificationPreferenceRepository(access.context)
    .getOwnPreferences();

  return (
    <NotificationsTab
      orgId={orgId}
      userId={access.context.principal.userId}
      initialPrefs={prefs ?? { digest: 'weekly', alerts: ['member_joined', 'module_changed'] }}
    />
  );
}
