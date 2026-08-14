import { createElevatedClient } from '@/lib/api/admin-client';
import { isWorkspaceManager } from '@/lib/organizations/roles';

type ImplementationReviewerScope = {
  orgId: string;
  actorId: string;
};

export class ImplementationReviewerRepositoryError extends Error {
  readonly status: 400 | 404;

  constructor(message: string, status: 400 | 404) {
    super(message);
    this.name = 'ImplementationReviewerRepositoryError';
    this.status = status;
  }
}

/** Elevated implementation-reviewer operations constrained to one authorized org. */
export function createImplementationReviewerRepository(scope: ImplementationReviewerScope) {
  const db = createElevatedClient();

  async function list() {
    const [membersRes, capsRes] = await Promise.all([
      db
        .from('organization_members')
        .select('id, user_id, role, created_at')
        .eq('org_id', scope.orgId)
        .is('deleted_at', null)
        .not('accepted_at', 'is', null)
        .in('role', ['admin', 'owner'])
        .order('created_at', { ascending: true }),
      db
        .from('organization_member_capabilities')
        .select('user_id, capability, created_at')
        .eq('org_id', scope.orgId)
        .eq('capability', 'implementation_reviewer'),
    ]);

    if (membersRes.error) throw membersRes.error;
    if (capsRes.error) throw capsRes.error;

    const members = membersRes.data || [];
    const reviewerIds = new Set((capsRes.data || []).map((row: any) => row.user_id));
    const userIds = members.map((member: any) => member.user_id).filter(Boolean);
    const profilesRes = userIds.length > 0
      ? await db
        .from('profiles')
        .select('id, email, full_name, avatar_url')
        .in('id', userIds)
      : { data: [], error: null };
    if (profilesRes.error) throw profilesRes.error;

    const profilesById = new Map(
      (profilesRes.data || []).map((profile: any) => [profile.id, profile])
    );

    return members.map((member: any) => ({
      membership_id: member.id,
      user_id: member.user_id,
      role: member.role,
      created_at: member.created_at,
      email: profilesById.get(member.user_id)?.email || null,
      full_name: profilesById.get(member.user_id)?.full_name || null,
      avatar_url: profilesById.get(member.user_id)?.avatar_url || null,
      implementation_reviewer: reviewerIds.has(member.user_id),
    }));
  }

  return {
    list,

    async grant(userId: string) {
      const { data: membership, error: memberError } = await db
        .from('organization_members')
        .select('id, role')
        .eq('org_id', scope.orgId)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .not('accepted_at', 'is', null)
        .maybeSingle();
      if (memberError) throw memberError;
      if (!membership) {
        throw new ImplementationReviewerRepositoryError('Member not found', 404);
      }
      if (!isWorkspaceManager(membership.role)) {
        throw new ImplementationReviewerRepositoryError(
          'Implementation reviewer can only be granted to admins or owners',
          400
        );
      }

      const { error } = await db
        .from('organization_member_capabilities')
        .upsert({
          org_id: scope.orgId,
          user_id: userId,
          capability: 'implementation_reviewer',
          granted_by: scope.actorId,
        }, { onConflict: 'org_id,user_id,capability' });
      if (error) throw error;

      return list();
    },

    async revoke(userId: string) {
      const { error } = await db
        .from('organization_member_capabilities')
        .delete()
        .eq('org_id', scope.orgId)
        .eq('user_id', userId)
        .eq('capability', 'implementation_reviewer');
      if (error) throw error;

      return list();
    },
  };
}
