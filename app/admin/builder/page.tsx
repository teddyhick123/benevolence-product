// app/admin/builder/page.tsx
import { redirect } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import BuilderProposalsClient from '@/components/admin/BuilderProposalsClient';

export default async function AdminBuilderPage() {
  const userId = await requireAdmin();
  if (!userId) redirect('/dashboard');

  return <BuilderProposalsClient />;
}
