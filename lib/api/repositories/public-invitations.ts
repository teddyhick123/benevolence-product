import {
  createElevatedClient,
  type ElevatedClient,
} from '@/lib/api/admin-client';
import type { InvitationAccessContext } from '@/lib/api/principals';
import { isOrgRole, type OrgRole } from '@/lib/roles';

type InvitationScope = {
  invitationId: string;
  orgId: string;
  email: string;
  role: OrgRole;
  status: string;
  expiresAt: string;
};

export type PublicInvitationRepository = ReturnType<typeof createScopedInvitationRepository>;

export type ResolvedInvitationToken =
  | {
      ok: true;
      context: InvitationAccessContext;
      repository: PublicInvitationRepository;
    }
  | { ok: false; status: 404 | 500; error: string };

function createScopedInvitationRepository(db: ElevatedClient, scope: InvitationScope) {
  return {
    async organizationName() {
      const { data, error } = await db
        .from('organizations')
        .select('name')
        .eq('id', scope.orgId)
        .maybeSingle();
      if (error) throw error;
      return data?.name || 'Unknown Organization';
    },

    async markExpired() {
      const { error } = await db
        .from('org_invitations')
        .update({ status: 'expired' })
        .eq('id', scope.invitationId)
        .eq('org_id', scope.orgId);
      if (error) throw error;
    },

    async accept(userId: string) {
      const { data: existingMember, error: memberLookupError } = await db
        .from('organization_members')
        .select('id, accepted_at')
        .eq('org_id', scope.orgId)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .maybeSingle();
      if (memberLookupError) throw memberLookupError;

      const acceptedAt = new Date().toISOString();
      if (existingMember) {
        if (!existingMember.accepted_at) {
          const { error } = await db
            .from('organization_members')
            .update({ accepted_at: acceptedAt })
            .eq('id', existingMember.id)
            .eq('org_id', scope.orgId);
          if (error) throw error;
        }

        await db
          .from('org_invitations')
          .update({ status: 'accepted', accepted_at: acceptedAt })
          .eq('id', scope.invitationId)
          .eq('org_id', scope.orgId);
        return scope.orgId;
      }

      const { error: memberError } = await db
        .from('organization_members')
        .insert({
          org_id: scope.orgId,
          user_id: userId,
          role: scope.role,
          invited_by: userId,
          accepted_at: acceptedAt,
        });
      if (memberError) throw memberError;

      await db
        .from('org_invitations')
        .update({ status: 'accepted', accepted_at: acceptedAt })
        .eq('id', scope.invitationId)
        .eq('org_id', scope.orgId);

      await db.from('org_audit_log').insert({
        org_id: scope.orgId,
        actor_id: userId,
        action: 'invite_accepted',
        metadata: { role: scope.role, email: scope.email },
      });

      return scope.orgId;
    },
  };
}

/** Resolve one raw bearer token and retain only its invitation scope. */
export async function resolveInvitationToken(token: string): Promise<ResolvedInvitationToken> {
  const db = createElevatedClient();
  const { data: invitation, error } = await db
    .from('org_invitations')
    .select('id, org_id, email, role, status, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (error) return { ok: false, status: 500, error: error.message };
  if (!invitation || !isOrgRole(invitation.role)) {
    return { ok: false, status: 404, error: 'Invitation not found' };
  }

  const scope: InvitationScope = {
    invitationId: invitation.id,
    orgId: invitation.org_id,
    email: invitation.email,
    role: invitation.role,
    status: invitation.status,
    expiresAt: invitation.expires_at,
  };

  return {
    ok: true,
    context: {
      principal: { kind: 'invitation', invitationId: scope.invitationId },
      orgId: scope.orgId,
      email: scope.email,
      role: scope.role,
      status: scope.status,
      expiresAt: scope.expiresAt,
    },
    repository: createScopedInvitationRepository(db, scope),
  };
}
