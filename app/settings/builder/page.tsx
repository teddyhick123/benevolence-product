// app/settings/builder/page.tsx
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/supabase';
import { fetchOrgSnapshot } from '@/lib/builder/context-bundle';
import BuilderTab from '@/components/settings/BuilderTab';

export default async function BuilderPage() {
  const cookieStore = await cookies();
  const orgId = cookieStore.get('x-org-id')?.value;
  if (!orgId) redirect('/welcome');

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [snapshot, sessionRes] = await Promise.all([
    fetchOrgSnapshot(supabase, orgId),
    supabase
      .from('builder_sessions')
      .select('messages')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle(),
  ]);

  if (!snapshot) redirect('/dashboard');

  const initialMessages = (sessionRes.data?.messages as Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>) || [];

  return <BuilderTab snapshot={snapshot} initialMessages={initialMessages} />;
}
