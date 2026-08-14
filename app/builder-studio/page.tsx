import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { createServerClient } from '@/lib/api/server-client';
import { fetchOrgSnapshot } from '@/lib/builder/context-bundle';
import BuilderStudio from '@/components/builder-studio/BuilderStudio';
import { canReviewImplementation } from '@/lib/organizations/capabilities';

export const dynamic = 'force-dynamic';

interface BuilderStudioPageProps {
  searchParams: Promise<{ org_id?: string }>;
}

export default async function BuilderStudioPage({ searchParams }: BuilderStudioPageProps) {
  const cookieStore = await cookies();
  const requestedOrgId = (await searchParams).org_id;
  const orgId = requestedOrgId || cookieStore.get('x-org-id')?.value;
  if (!orgId) redirect('/onboarding');

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: isAdmin } = await supabase.rpc('is_org_admin', { p_org_id: orgId });
  if (!isAdmin) redirect('/dashboard');

  const [snapshot, sessionRes, canReviewImplementationProposal] = await Promise.all([
    fetchOrgSnapshot(supabase, orgId),
    supabase
      .from('builder_sessions')
      .select('messages')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .maybeSingle(),
    canReviewImplementation(supabase as any, orgId),
  ]);

  if (!snapshot) redirect('/dashboard');

  const initialMessages = (sessionRes.data?.messages as Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>) || [];

  const githubEnabled = !!(
    process.env.GITHUB_TOKEN &&
    process.env.GITHUB_REPO_OWNER &&
    process.env.GITHUB_REPO_NAME
  );

  return (
    <BuilderStudio
      snapshot={snapshot}
      initialMessages={initialMessages}
      githubEnabled={githubEnabled}
      canReviewImplementation={canReviewImplementationProposal}
    />
  );
}
