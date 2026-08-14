import { createElevatedClient } from '@/lib/api/admin-client';
import type { SupabaseClient } from '@/lib/database-client';
import { sendInviteEmail } from '@/lib/email/resend';

type InvitationEmailEvent = {
  id: string;
  org_id: string;
  invitation_id: string;
  recipient_email: string;
  role: string;
  invitation_token: string;
  message: string | null;
};

export type InvitationEmailOutboxResult = {
  scanned: number;
  sent: number;
  cancelled: number;
  failed: number;
  errors: Array<{ eventId: string; message: string }>;
};

export async function drainInvitationEmailOutbox(
  db: SupabaseClient,
  options: { limit?: number; dryRun?: boolean } = {}
): Promise<InvitationEmailOutboxResult> {
  const result: InvitationEmailOutboxResult = { scanned: 0, sent: 0, cancelled: 0, failed: 0, errors: [] };
  const data = options.dryRun
    ? await (async () => {
      const { data: pending, error } = await db
        .from('org_invitation_email_outbox')
        .select('id, org_id, invitation_id, recipient_email, role, invitation_token, message')
        .in('status', ['pending', 'retry'])
        .lte('next_attempt_at', new Date().toISOString())
        .order('created_at', { ascending: true })
        .limit(options.limit ?? 50);
      if (error) throw error;
      return pending;
    })()
    : await (async () => {
      const { data: claimed, error } = await db.rpc('claim_org_invitation_email_outbox', {
        p_limit: options.limit ?? 50,
      });
      if (error) throw error;
      return claimed;
    })();

  for (const event of (data ?? []) as InvitationEmailEvent[]) {
    result.scanned++;
    // Set the moment the provider accepts the message. After that point a
    // failure must never route to the 'failed' outcome, because that schedules
    // a retry and the invitee receives the invitation a second time.
    let delivered = false;
    try {
      const { data: invitation, error: invitationError } = await db
        .from('org_invitations')
        .select('status, token, invited_by')
        .eq('id', event.invitation_id)
        .eq('org_id', event.org_id)
        .maybeSingle();
      if (invitationError) throw invitationError;
      if (!invitation || invitation.status !== 'pending' || invitation.token !== event.invitation_token) {
        if (!options.dryRun) {
          const { error: finishError } = await db.rpc('finish_org_invitation_email_outbox', {
            p_event_id: event.id, p_outcome: 'cancelled', p_error: null,
          });
          if (finishError) throw finishError;
        }
        result.cancelled++;
        continue;
      }

      if (!options.dryRun) {
        const [{ data: org, error: orgError }, { data: inviter, error: inviterError }] = await Promise.all([
          db.from('organizations').select('name').eq('id', event.org_id).single(),
          db.from('profiles').select('full_name, email').eq('id', invitation.invited_by).single(),
        ]);
        if (orgError) throw orgError;
        if (inviterError) throw inviterError;
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
        await sendInviteEmail({
          to: event.recipient_email,
          orgName: org?.name || 'your organization',
          inviterName: inviter?.full_name || inviter?.email || 'A team member',
          role: event.role,
          message: event.message,
          acceptUrl: `${baseUrl}/join?token=${event.invitation_token}`,
        });
        delivered = true;

        // Bookkeeping only. Retry a few times so a transient database blip does
        // not leave a delivered invitation looking unsent.
        let finishError: { message: string } | null = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          ({ error: finishError } = await db.rpc('finish_org_invitation_email_outbox', {
            p_event_id: event.id, p_outcome: 'sent', p_error: null,
          }));
          if (!finishError) break;
        }
        if (finishError) throw finishError;
      }
      result.sent++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.failed++;
      result.errors.push({ eventId: event.id, message });

      if (delivered) {
        // The email went out; only recording it failed. Marking this 'failed'
        // would schedule a duplicate send, so leave the row claimed and let an
        // operator reconcile it from last_error instead.
        result.errors.push({
          eventId: event.id,
          message: `Invitation email was delivered but could not be marked sent: ${message}`,
        });
        continue;
      }

      if (!options.dryRun) {
        const { error: finishError } = await db.rpc('finish_org_invitation_email_outbox', {
          p_event_id: event.id, p_outcome: 'failed', p_error: message,
        });
        if (finishError) result.errors.push({ eventId: event.id, message: `Could not record retry state: ${finishError.message}` });
      }
    }
  }
  return result;
}

export async function drainInvitationEmailOutboxJob(options: { limit?: number; dryRun?: boolean } = {}) {
  return drainInvitationEmailOutbox(createElevatedClient(), options);
}
