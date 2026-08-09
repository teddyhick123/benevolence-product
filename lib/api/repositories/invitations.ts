import { createElevatedClient } from '@/lib/api/admin-client';
import type { OrgAccessContext } from '@/lib/api/principals';
import { sendInviteEmail } from '@/lib/email/resend';
import type { OrgRole } from '@/lib/roles';

type InvitationScope = Pick<OrgAccessContext, 'orgId' | 'role'> & { actorId: string };

export class InvitationRepositoryError extends Error {
  readonly status: 403 | 404 | 409;

  constructor(message: string, status: 403 | 404 | 409) {
    super(message);
    this.name = 'InvitationRepositoryError';
    this.status = status;
  }
}

/** Elevated invitation operations constrained to one authorized org and actor. */
export function createInvitationRepository(scope: InvitationScope) {
  const db = createElevatedClient();

  async function emailContext() {
    const [{ data: org }, { data: inviter }] = await Promise.all([
      db.from('organizations').select('name').eq('id', scope.orgId).single(),
      db.from('profiles').select('full_name, email').eq('id', scope.actorId).single(),
    ]);
    return {
      orgName: org?.name || 'your organization',
      inviterName: inviter?.full_name || inviter?.email || 'A team member',
    };
  }

  async function loadInvite(inviteId: string, selection: string) {
    const { data, error } = await db
      .from('org_invitations')
      .select(selection)
      .eq('id', inviteId)
      .eq('org_id', scope.orgId)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new InvitationRepositoryError('Invitation not found', 404);
    return data as any;
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

      const { data: profile } = await db
        .from('profiles')
        .select('id')
        .eq('email', input.email)
        .maybeSingle();
      if (profile) {
        const { data: member } = await db
          .from('organization_members')
          .select('id')
          .eq('org_id', scope.orgId)
          .eq('user_id', profile.id)
          .is('deleted_at', null)
          .maybeSingle();
        if (member) {
          throw new InvitationRepositoryError(
            'This person is already a member of your organization.',
            409
          );
        }
      }

      const { data: existing } = await db
        .from('org_invitations')
        .select('id, email, role, created_at, expires_at')
        .eq('org_id', scope.orgId)
        .eq('email', input.email)
        .eq('status', 'pending')
        .maybeSingle();
      if (existing) return { invitation: existing, created: false as const };

      const { data: invitation, error } = await db
        .from('org_invitations')
        .insert({
          org_id: scope.orgId,
          email: input.email,
          role: input.role,
          invited_by: scope.actorId,
        })
        .select()
        .single();
      if (error || !invitation) throw error || new Error('Failed to create invitation');

      const context = await emailContext();
      const { error: auditError } = await db.from('org_audit_log').insert({
        org_id: scope.orgId,
        actor_id: scope.actorId,
        actor_subject_id: scope.actorId,
        action: 'invite_sent',
        target_id: null,
        metadata: { email: input.email, role: input.role },
      });
      if (auditError) {
        await db.from('org_invitations').update({ status: 'cancelled' })
          .eq('id', invitation.id).eq('org_id', scope.orgId);
        throw auditError;
      }

      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        await sendInviteEmail({
          to: input.email,
          ...context,
          role: input.role,
          message: input.message,
          acceptUrl: `${baseUrl}/join?token=${invitation.token}`,
        });
      } catch (emailError) {
        await db.from('org_invitations').update({ status: 'cancelled' })
          .eq('id', invitation.id).eq('org_id', scope.orgId);
        throw emailError;
      }
      return { invitation, created: true as const };
    },

    async cancel(inviteId: string) {
      const invite = await loadInvite(inviteId, 'id, email, status');
      if (invite.status !== 'pending') {
        throw new InvitationRepositoryError('Only pending invitations can be cancelled', 409);
      }
      const { error } = await db.from('org_invitations').update({ status: 'cancelled' })
        .eq('id', inviteId).eq('org_id', scope.orgId);
      if (error) throw error;

      const { error: auditError } = await db.from('org_audit_log').insert({
        org_id: scope.orgId,
        actor_id: scope.actorId,
        actor_subject_id: scope.actorId,
        action: 'invite_cancelled',
        metadata: { email: invite.email },
      });
      if (auditError) {
        await db.from('org_invitations').update({ status: 'pending' })
          .eq('id', inviteId).eq('org_id', scope.orgId);
        throw auditError;
      }
    },

    async resend(inviteId: string) {
      const invite = await loadInvite(inviteId, 'id, email, role, status, token, expires_at');
      if (invite.status !== 'pending') {
        throw new InvitationRepositoryError('Only pending invitations can be resent', 409);
      }

      const newToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');
      const { data: updated, error } = await db.from('org_invitations').update({
        token: newToken,
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }).eq('id', inviteId).eq('org_id', scope.orgId).select().single();
      if (error || !updated) throw error || new Error('Update failed');

      const context = await emailContext();
      const { error: auditError } = await db.from('org_audit_log').insert({
        org_id: scope.orgId,
        actor_id: scope.actorId,
        actor_subject_id: scope.actorId,
        action: 'invite_resent',
        target_id: inviteId,
        metadata: { email: invite.email, role: invite.role },
      });
      if (auditError) {
        await db.from('org_invitations').update({
          token: invite.token,
          expires_at: invite.expires_at,
        }).eq('id', inviteId).eq('org_id', scope.orgId);
        throw auditError;
      }

      try {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        await sendInviteEmail({
          to: invite.email,
          ...context,
          role: invite.role,
          acceptUrl: `${baseUrl}/join?token=${newToken}`,
        });
      } catch (emailError) {
        await db.from('org_invitations').update({
          token: invite.token,
          expires_at: invite.expires_at,
        }).eq('id', inviteId).eq('org_id', scope.orgId);
        throw emailError;
      }
    },
  };
}
