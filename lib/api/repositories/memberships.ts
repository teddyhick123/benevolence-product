import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';
import type { OrgRole } from '@/lib/organizations/roles';

type MembershipScope = Pick<OrgAccessContext, 'orgId' | 'role'> & {
  actorId: string;
};

export class MembershipRepositoryError extends Error {
  readonly status: 400 | 403 | 404 | 409;

  constructor(message: string, status: 400 | 403 | 404 | 409) {
    super(message);
    this.name = 'MembershipRepositoryError';
    this.status = status;
  }
}

/** Elevated membership operations constrained to one authorized org and actor. */
export function createMembershipRepository(scope: MembershipScope) {
  const db = createElevatedClient();

  async function mutate(userId: string, operation: 'add' | 'change_role' | 'remove', role?: OrgRole) {
    const { data, error } = await db.rpc('mutate_organization_membership', {
      p_org_id: scope.orgId,
      p_actor_id: scope.actorId,
      p_target_user_id: userId,
      p_operation: operation,
      p_role: role ?? null,
    });
    if (error) {
      const status = error.code === '42501' ? 403
        : error.code === 'P0002' ? 404
          : error.code === 'P0001' ? 400
            : error.code === '23505' ? 409
              : error.code === '22023' ? 400
                : null;
      // Only the codes the RPC raises deliberately are client errors. Anything
      // else is an infrastructure failure, so surface it as a 500 rather than
      // blaming the caller with a 400.
      if (status === null) throw new Error(error.message);
      throw new MembershipRepositoryError(error.message, status);
    }
    return data;
  }

  return {
    async list() {
      const { data, error } = await db
        .from('organization_members')
        .select('id, org_id, user_id, role, created_at')
        .eq('org_id', scope.orgId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const userIds = Array.from(new Set(
        (data || []).map((member: any) => member.user_id).filter(Boolean)
      ));
      const { data: profiles, error: profilesError } = userIds.length > 0
        ? await db.from('profiles').select('id, email, full_name, avatar_url').in('id', userIds)
        : { data: [], error: null };
      if (profilesError) throw profilesError;

      const profilesById = new Map(
        (profiles || []).map((profile: any) => [profile.id, profile])
      );
      return (data || []).map((member: any) => ({
        id: member.id,
        user_id: member.user_id,
        role: member.role,
        created_at: member.created_at,
        email: profilesById.get(member.user_id)?.email || null,
        full_name: profilesById.get(member.user_id)?.full_name || null,
        avatar_url: profilesById.get(member.user_id)?.avatar_url || null,
      }));
    },

    async add(input: { email?: string; userId?: string; role: OrgRole }) {
      if (input.role === 'owner' && scope.role !== 'owner') {
        throw new MembershipRepositoryError('Only owners can add another owner', 403);
      }

      let targetUserId = input.userId;
      if (input.email && !targetUserId) {
        const { data: users, error } = await db.auth.admin.listUsers();
        if (error) throw new Error('Failed to lookup user');
        targetUserId = users.users.find(
          user => user.email?.toLowerCase() === input.email?.toLowerCase()
        )?.id;
        if (!targetUserId) {
          throw new MembershipRepositoryError('No user found with that email address', 404);
        }
      }
      if (!targetUserId) {
        throw new MembershipRepositoryError('Either email or user_id is required', 400);
      }

      return mutate(targetUserId, 'add', input.role);
    },

    async updateRole(userId: string, role: OrgRole, allowOwnerAssignment: boolean) {
      if (role === 'owner' && !allowOwnerAssignment) {
        throw new MembershipRepositoryError('Invalid role', 400);
      }
      return mutate(userId, 'change_role', role);
    },

    async remove(userId: string) {
      await mutate(userId, 'remove');
    },
  };
}
