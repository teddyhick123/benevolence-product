/** Place at app/org/[orgId]/{module_name}/page.tsx. */
import {ModuleName}PageContent from './{ModuleName}PageContent';
import { getPageTitle } from '@/lib/config';

export const metadata = {
  title: getPageTitle('{ModuleName}'),
  description: 'Manage {ModuleName}',
};

interface PageParams {
  params: Promise<{ orgId: string }>;
}

export default async function {ModuleName}Page({ params }: PageParams) {
  const { orgId } = await params;

  // The page carries routing context only. Its domain hook calls an org-scoped
  // API route, where requireOrgAccess remains the authorization boundary.
  return <{ModuleName}PageContent orgId={orgId} />;
}
