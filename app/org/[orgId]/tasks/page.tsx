import Link from 'next/link';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { createOrgTaskRepository } from '@/lib/api/repositories/tasks';
import TaskInbox from '@/components/tasks/TaskInbox';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface Props {
  params: Promise<{ orgId: string }>;
}

async function loadTaskPageData(orgId: string) {
  const access = await requireOrgAccess(orgId, 'viewer');
  if (isAccessDenied(access)) {
    return { error: 'Not authorized', user: null, role: null, org: null, members: [] };
  }

  const { org, members } = await createOrgTaskRepository({
    orgId,
    role: access.context.role,
    actorId: access.context.principal.userId,
  }).getPageContext();
  return {
    error: null,
    user: access.context.user,
    role: access.context.role,
    org,
    members,
  };
}

export default async function OrgTasksPage({ params }: Props) {
  const { orgId } = await params;
  const { error, user, role, org, members } = await loadTaskPageData(orgId);

  if (error || !role || !user) {
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
