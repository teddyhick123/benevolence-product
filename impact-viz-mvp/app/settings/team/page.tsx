// app/settings/team/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import TeamTab from '@/components/settings/TeamTab';

export default async function TeamPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get('x-org-id')?.value;
  if (!orgId) redirect('/welcome');

  return <TeamTab orgId={orgId} />;
}
