// app/settings/modules/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase';
import ModulesTab from '@/components/settings/ModulesTab';

export default async function ModulesPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get('x-org-id')?.value;
  if (!orgId) redirect('/welcome');

  const supabase = await createServerClient();
  const { data: org } = await supabase
    .from('organizations')
    .select('modules')
    .eq('id', orgId)
    .single();

  const modules: Record<string, boolean> = org?.modules || {};

  return <ModulesTab orgId={orgId} initialModules={modules} />;
}
