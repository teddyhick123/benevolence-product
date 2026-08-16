// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { drainInvitationEmailOutbox } from '@/lib/invitations/email-outbox';
import { stubQuery, stubSupabase } from '@/tests/helpers/supabase-mock';

const { mockSendInviteEmail } = vi.hoisted(() => ({ mockSendInviteEmail: vi.fn() }));
vi.mock('@/lib/email/resend', () => ({ sendInviteEmail: mockSendInviteEmail }));

const event = {
  id: 'event-1', org_id: 'org-1', invitation_id: 'invite-1', recipient_email: 'invitee@example.com',
  role: 'member', invitation_token: 'token-1', message: 'Welcome!',
};

beforeEach(() => vi.clearAllMocks());

describe('drainInvitationEmailOutbox', () => {
  it('sends a claimed, still-current invitation then marks its event sent', async () => {
    const invitation = stubQuery({ data: { status: 'pending', token: 'token-1', invited_by: 'actor-1' }, error: null });
    const org = stubQuery({ data: { name: 'Good Org' }, error: null });
    const profile = stubQuery({ data: { full_name: 'Inviter', email: 'inviter@example.com' }, error: null });
    const db = stubSupabase({
      tables: { org_invitations: () => invitation, organizations: () => org, profiles: () => profile },
      rpc: {
        claim_org_invitation_email_outbox: () => ({ data: [event], error: null }),
        finish_org_invitation_email_outbox: () => ({ data: null, error: null }),
      },
    });

    const result = await drainInvitationEmailOutbox(db as any);
    expect(mockSendInviteEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: 'invitee@example.com', orgName: 'Good Org', inviterName: 'Inviter', acceptUrl: expect.stringContaining('token-1'),
    }));
    expect(db.rpc).toHaveBeenLastCalledWith('finish_org_invitation_email_outbox', {
      p_event_id: 'event-1', p_outcome: 'sent', p_error: null,
    });
    expect(result).toMatchObject({ scanned: 1, sent: 1, failed: 0 });
  });

  it('cancels a stale claimed event without sending an outdated token', async () => {
    const invitation = stubQuery({ data: { status: 'pending', token: 'new-token', invited_by: 'actor-1' }, error: null });
    const db = stubSupabase({
      tables: { org_invitations: () => invitation },
      rpc: {
        claim_org_invitation_email_outbox: () => ({ data: [event], error: null }),
        finish_org_invitation_email_outbox: () => ({ data: null, error: null }),
      },
    });

    const result = await drainInvitationEmailOutbox(db as any);
    expect(mockSendInviteEmail).not.toHaveBeenCalled();
    expect(db.rpc).toHaveBeenLastCalledWith('finish_org_invitation_email_outbox', {
      p_event_id: 'event-1', p_outcome: 'cancelled', p_error: null,
    });
    expect(result).toMatchObject({ cancelled: 1 });
  });

  it('records retryable failure when email delivery fails', async () => {
    const invitation = stubQuery({ data: { status: 'pending', token: 'token-1', invited_by: 'actor-1' }, error: null });
    const org = stubQuery({ data: { name: 'Good Org' }, error: null });
    const profile = stubQuery({ data: { full_name: 'Inviter', email: 'inviter@example.com' }, error: null });
    const db = stubSupabase({
      tables: { org_invitations: () => invitation, organizations: () => org, profiles: () => profile },
      rpc: {
        claim_org_invitation_email_outbox: () => ({ data: [event], error: null }),
        finish_org_invitation_email_outbox: () => ({ data: null, error: null }),
      },
    });
    mockSendInviteEmail.mockRejectedValue(new Error('provider unavailable'));

    const result = await drainInvitationEmailOutbox(db as any);
    expect(db.rpc).toHaveBeenLastCalledWith('finish_org_invitation_email_outbox', {
      p_event_id: 'event-1', p_outcome: 'failed', p_error: 'provider unavailable',
    });
    expect(result).toMatchObject({ failed: 1 });
  });

  it('does not claim, send, or strand invitation events during a dry run', async () => {
    const pending = stubQuery({ data: [event], error: null });
    const invitation = stubQuery({ data: { status: 'pending', token: 'token-1', invited_by: 'actor-1' }, error: null });
    const db = stubSupabase({
      tables: {
        org_invitation_email_outbox: () => pending,
        org_invitations: () => invitation,
      },
      rpc: {
        claim_org_invitation_email_outbox: () => ({ data: [event], error: null }),
        finish_org_invitation_email_outbox: () => ({ data: null, error: null }),
      },
    });

    const result = await drainInvitationEmailOutbox(db as any, { dryRun: true });

    expect(db.rpc).not.toHaveBeenCalled();
    expect(mockSendInviteEmail).not.toHaveBeenCalled();
    expect(pending.calls).toContainEqual({ method: 'in', args: ['status', ['pending', 'retry']] });
    expect(result).toMatchObject({ scanned: 1, sent: 1 });
  });

  // Delivery and recording it cannot be atomic. What must never happen is
  // treating a recording failure as a delivery failure: 'failed' becomes
  // 'retry', the event is re-claimed, and the invitee is mailed twice.
  describe('when the email is delivered but recording it fails', () => {
    function stubDeliveredButUnrecordable(finishResults: Array<{ error: { message: string } | null }>) {
      const invitation = stubQuery({ data: { status: 'pending', token: 'token-1', invited_by: 'actor-1' }, error: null });
      const org = stubQuery({ data: { name: 'Good Org' }, error: null });
      const profile = stubQuery({ data: { full_name: 'Inviter', email: 'inviter@example.com' }, error: null });
      // clearAllMocks resets call history but not implementations, so delivery
      // must be re-armed after the earlier rejection test.
      mockSendInviteEmail.mockResolvedValue(undefined);
      let finishCall = 0;
      return stubSupabase({
        tables: { org_invitations: () => invitation, organizations: () => org, profiles: () => profile },
        rpc: {
          claim_org_invitation_email_outbox: () => ({ data: [event], error: null }),
          finish_org_invitation_email_outbox: () => {
            const next = finishResults[Math.min(finishCall, finishResults.length - 1)];
            finishCall++;
            return { data: null, ...next };
          },
        },
      });
    }

    it('never marks the event failed, which would schedule a duplicate send', async () => {
      const db = stubDeliveredButUnrecordable([{ error: { message: 'connection reset' } }]);

      const result = await drainInvitationEmailOutbox(db as any);

      expect(mockSendInviteEmail).toHaveBeenCalledTimes(1);
      const outcomes = (db.rpc as unknown as { mock: { calls: unknown[][] } }).mock.calls
        .filter(([fn]) => fn === 'finish_org_invitation_email_outbox')
        .map(([, args]) => (args as { p_outcome: string }).p_outcome);
      expect(outcomes).not.toContain('failed');
      expect(result.errors.some(e => /delivered but could not be marked sent/.test(e.message))).toBe(true);
    });

    it('retries the record before giving up, so a transient blip still settles', async () => {
      const db = stubDeliveredButUnrecordable([
        { error: { message: 'connection reset' } },
        { error: null },
      ]);

      const result = await drainInvitationEmailOutbox(db as any);

      const finishCalls = (db.rpc as unknown as { mock: { calls: unknown[][] } }).mock.calls
        .filter(([fn]) => fn === 'finish_org_invitation_email_outbox');
      expect(finishCalls.length).toBeGreaterThan(1);
      expect(mockSendInviteEmail).toHaveBeenCalledTimes(1);
      expect(result).toMatchObject({ sent: 1, failed: 0 });
    });
  });
});
