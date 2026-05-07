// app/admin/builder/page.tsx
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase';
import BuilderProposalsClient from '@/components/admin/BuilderProposalsClient';

export default async function AdminBuilderPage() {
  const supabase = await createServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_super_admin')
    .eq('id', user.id)
    .single();

  if (!profile?.is_super_admin) redirect('/dashboard');

  return <BuilderProposalsClient />;
}
