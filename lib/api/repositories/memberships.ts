import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';
import type { OrgRole } from '@/lib/roles';

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

  async function countActiveOwners() {
    const { count, error } = await db
      .from('organization_members')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', scope.orgId)
      .eq('role', 'owner')
      .is('deleted_at', null);
    if (error) throw error;
    return count ?? 0;
  }

  async function loadMember(userId: string) {
    const { data, error } = await db
      .from('organization_members')
      .select('id, role')
      .eq('org_id', scope.orgId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new MembershipRepositoryError('Member not found', 404);
    return data;
  }

  async function assertOwnerChangeAllowed(existingRole: string, nextRole?: OrgRole) {
    if (scope.role !== 'owner' && (existingRole === 'owner' || nextRole === 'owner')) {
      throw new MembershipRepositoryError('Only owners can change owner membership', 403);
    }
    if (existingRole === 'owner' && nextRole !== 'owner' && await countActiveOwners() <= 1) {
      throw new MembershipRepositoryError('Cannot change the last owner role', 400);
    }
  }

  async function updateRole(userId: string, role: OrgRole, allowOwnerAssignment: boolean) {
    if (role === 'owner' && !allowOwnerAssignment) {
      throw new MembershipRepositoryError('Invalid role', 400);
    }
    if (role === 'owner' && scope.role !== 'owner') {
      throw new MembershipRepositoryError('Only owners can assign owner role', 403);
    }

    const existing = await loadMember(userId);
    await assertOwnerChangeAllowed(existing.role, role);

    const { data, error } = await db
      .from('organization_members')
      .update({ role })
      .eq('org_id', scope.orgId)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) throw error;

    const { error: auditError } = await db.from('org_audit_log').insert({
      org_id: scope.orgId,
      actor_id: scope.actorId,
      action: 'role_changed',
      target_id: userId,
      metadata: { before_role: existing.role, after_role: role },
    });
    if (auditError) {
      await db
        .from('organization_members')
        .update({ role: existing.role })
        .eq('org_id', scope.orgId)
        .eq('user_id', userId);
      throw auditError;
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

      const { data: existing, error: existingError } = await db
        .from('organization_members')
        .select('id')
        .eq('org_id', scope.orgId)
        .eq('user_id', targetUserId)
        .is('deleted_at', null)
        .maybeSingle();
      if (existingError) throw existingError;
      if (existing) {
        throw new MembershipRepositoryError(
          'User is already a member of this organization',
          409
        );
      }

      const { data: member, error } = await db
        .from('organization_members')
        .insert({ org_id: scope.orgId, user_id: targetUserId, role: input.role })
        .select()
        .single();
      if (error) throw error;

      const { error: auditError } = await db.from('org_audit_log').insert({
        org_id: scope.orgId,
        actor_id: scope.actorId,
        action: 'member_added',
        target_id: targetUserId,
        metadata: { role: input.role },
      });
      if (auditError) {
        await db
          .from('organization_members')
          .update({ deleted_at: new Date().toISOString(), deleted_by: scope.actorId })
          .eq('org_id', scope.orgId)
          .eq('user_id', targetUserId);
        throw auditError;
      }
      return member;
    },

    updateRole,

    async remove(userId: string) {
      const existing = await loadMember(userId);
      if (scope.role !== 'owner' && existing.role === 'owner') {
        throw new MembershipRepositoryError('Only owners can remove owner membership', 403);
      }
      if (existing.role === 'owner' && await countActiveOwners() <= 1) {
        throw new MembershipRepositoryError('Cannot remove the last owner', 400);
      }

      const removedAt = new Date().toISOString();
      const { error } = await db
        .from('organization_members')
        .update({ deleted_at: removedAt, deleted_by: scope.actorId })
        .eq('org_id', scope.orgId)
        .eq('user_id', userId);
      if (error) throw error;

      const { error: auditError } = await db.from('org_audit_log').insert({
        org_id: scope.orgId,
        actor_id: scope.actorId,
        action: 'member_removed',
        target_id: userId,
        metadata: { removed_at: removedAt, previous_role: existing.role },
      });
      if (auditError) {
        await db
          .from('organization_members')
          .update({ deleted_at: null, deleted_by: null })
          .eq('org_id', scope.orgId)
          .eq('user_id', userId);
        throw auditError;
      }
    },
  };
}
