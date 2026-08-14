import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import AIModelsSettings from '@/components/settings/AIModelsSettings';

export const dynamic = 'force-dynamic';

export default async function AISettingsPage() {
  const orgId = (await cookies()).get('x-org-id')?.value;
  if (!orgId) redirect('/onboarding');

  const access = await requireOrgAccess(orgId, 'admin');
  if (isAccessDenied(access)) redirect('/dashboard');

  return <AIModelsSettings orgId={orgId} />;
}
