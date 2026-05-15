import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createAdminClient, createSupabaseServerClient } from '@/lib/supabase';
import TaskInbox from '@/components/tasks/TaskInbox';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Props {
  params: Promise<{ orgId: string }>;
}

async function loadTaskPageData(orgId: string) {
  const supabase = await createSupabaseServerClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: role } = await supabase.rpc('user_org_role', { p_org_id: orgId });
  if (!role) {
    return { error: 'Not authorized', user, role: null, org: null, members: [] };
  }

  const adminClient = createAdminClient();
  const [{ data: org }, { data: rawMembers, error: membersError }] = await Promise.all([
    adminClient.from('organizations').select('id, name').eq('id', orgId).single(),
    adminClient
      .from('organization_members')
      .select('user_id, role')
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .order('role', { ascending: true }),
  ]);

  if (membersError) {
    return { error: membersError.message, user, role, org, members: [] };
  }

  const userIds = (rawMembers || []).map((member: any) => member.user_id);
  const { data: profiles } = userIds.length > 0
    ? await adminClient.from('profiles').select('id, full_name, email').in('id', userIds)
    : { data: [] };
  const profilesById = new Map((profiles || []).map((profile: any) => [profile.id, profile]));
  const members = (rawMembers || []).map((member: any) => ({
    ...member,
    profiles: profilesById.get(member.user_id) || null,
  }));

  return { error: null, user, role, org, members: members || [] };
}

export default async function OrgTasksPage({ params }: Props) {
  const { orgId } = await params;
  const { error, user, role, org, members } = await loadTaskPageData(orgId);

  if (error || !role) {
    return (
      <div className="card p-6">
        <h2 className="mb-2 text-xl font-semibold text-red-600">Error</h2>
        <p className="text-neutral-600">{error}</p>
        <Link href={`/org/${orgId}`} className="mt-4 inline-block text-azure hover:underline">
          Back to organization
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8">
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <Link href={`/org/${orgId}`} className="hover:text-neutral-900">
          {org?.name || 'Organization'}
        </Link>
        <span>/</span>
        <span>Tasks</span>
      </div>
      <TaskInbox
        orgId={orgId}
        members={members as any}
        currentUserId={user.id}
        currentRole={role}
      />
    </div>
  );
}
