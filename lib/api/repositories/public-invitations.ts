import {
  createElevatedClient,
  type ElevatedClient,
} from '@/lib/api/admin-client';
import type { InvitationAccessContext } from '@/lib/api/principals';
import { isOrgRole, type OrgRole } from '@/lib/organizations/roles';

type InvitationScope = {
  invitationId: string;
  orgId: string;
  token: string;
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
      const { data, error } = await db.rpc('accept_org_invitation', {
        p_org_id: scope.orgId,
        p_invitation_id: scope.invitationId,
        p_invitation_token: scope.token,
        p_user_id: userId,
      });
      if (error) throw error;
      return (data as { org_id?: string } | null)?.org_id ?? scope.orgId;
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
    token,
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
