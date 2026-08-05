// app/admin/builder/page.tsx
import { redirect } from 'next/navigation';
import { isAccessDenied, requireAppAdmin } from '@/lib/api/access';
import BuilderProposalsClient from '@/components/admin/BuilderProposalsClient';

export default async function AdminBuilderPage() {
  const access = await requireAppAdmin();
  if (isAccessDenied(access)) redirect('/dashboard');

  return <BuilderProposalsClient />;
}
