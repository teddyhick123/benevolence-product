import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase';
import OrganizationTab from '@/components/settings/OrganizationTab';

export default async function OrganizationPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get('x-org-id')?.value;
  if (!orgId) redirect('/onboarding');

  const supabase = await createServerClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('name, ein, org_type')
    .eq('id', orgId)
    .single();

  if (!org) redirect('/dashboard');

  return (
    <OrganizationTab
      orgId={orgId}
      initialName={org.name}
      initialEin={org.ein}
      orgType={org.org_type}
    />
  );
}
