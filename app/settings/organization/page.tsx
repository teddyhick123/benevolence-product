import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import OrganizationTab from '@/components/settings/OrganizationTab';

export default async function OrganizationPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const activeOrgId = (await cookies()).get('x-org-id')?.value;
  const orgId = params.org ?? activeOrgId;
  if (!orgId) redirect('/onboarding');

  const access = await requireOrgAccess(orgId, 'viewer');
  if (isAccessDenied(access)) redirect('/dashboard');

  const { data: org } = await access.context.db
    .from('organizations')
    .select('name, ein, org_type')
    .eq('id', orgId)
    .maybeSingle();
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
