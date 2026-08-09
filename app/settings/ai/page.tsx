import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AIModelsSettings from '@/components/settings/AIModelsSettings';

export default async function AISettingsTabPage() {
  const orgId = (await cookies()).get('x-org-id')?.value;
  if (!orgId) redirect('/onboarding');
  return <AIModelsSettings orgId={orgId} />;
}
