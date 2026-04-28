// app/settings/audit/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import AuditLogTab from '@/components/settings/AuditLogTab';

export default async function AuditPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get('x-org-id')?.value;
  if (!orgId) redirect('/welcome');
  return <AuditLogTab orgId={orgId} />;
}
