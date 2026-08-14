import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';
import type { OrgRole } from '@/lib/organizations/roles';

type InvitationScope = Pick<OrgAccessContext, 'orgId' | 'role'> & { actorId: string };

export class InvitationRepositoryError extends Error {
  readonly status: 400 | 403 | 404 | 409;

  constructor(message: string, status: 400 | 403 | 404 | 409) {
    super(message);
    this.status = status;
  }
}

/**
 * Elevated invitation operations constrained to one authorized organization.
 * State, audit history, and durable delivery intent are committed by the
 * owning database function; this repository never sends email inline.
 */
export function createInvitationRepository(scope: InvitationScope) {
  const db = createElevatedClient();

  async function mutate(input: {
    operation: 'create' | 'resend' | 'cancel';
    email?: string;
    role?: OrgRole;
    message?: string | null;
    invitationId?: string;
  }) {
    const { data, error } = await db.rpc('mutate_org_invitation', {
      p_org_id: scope.orgId,
      p_actor_id: scope.actorId,
      p_operation: input.operation,
      p_email: input.email ?? null,
      p_role: input.role ?? null,
      p_message: input.message ?? null,
      p_invitation_id: input.invitationId ?? null,
    });
    if (error) {
      const status = error.code === '42501' ? 403
        : error.code === 'P0002' ? 404
          : error.code === '22023' ? 400
            : ['P0001', '23505'].includes(error.code ?? '') ? 409 : 400;
      throw new InvitationRepositoryError(error.message, status);
    }
    return data as { invitation: Record<string, unknown>; created: boolean };
  }

  return {
    async list() {
      const { data, error } = await db
        .from('org_invitations')
        .select('id, email, role, status, created_at, expires_at, invited_by')
        .eq('org_id', scope.orgId)
        .in('status', ['pending'])
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },

    async create(input: { email: string; role: OrgRole; message?: string | null }) {
      if (input.role === 'owner' && scope.role !== 'owner') {
        throw new InvitationRepositoryError('Only owners can invite another owner', 403);
      }
      return mutate({ operation: 'create', ...input });
    },

    async cancel(invitationId: string) {
      await mutate({ operation: 'cancel', invitationId });
    },

    async resend(invitationId: string) {
      await mutate({ operation: 'resend', invitationId });
    },
  };
}
