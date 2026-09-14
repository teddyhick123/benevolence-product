// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockDeliverNewEvent, mockFrom, mockRpc } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(), mockDeliverNewEvent: vi.fn(), mockFrom: vi.fn(), mockRpc: vi.fn(),
}));
vi.mock('@/lib/api/admin-client', () => ({ createElevatedClient: mockCreateElevatedClient }));
vi.mock('@/lib/invitations/email-outbox', () => ({
  deliverNewInvitationEmailOutboxEvent: mockDeliverNewEvent,
}));

import { createInvitationRepository } from '@/lib/api/repositories/invitations';

const db = { from: mockFrom, rpc: mockRpc };
const scope = { orgId: 'org-1', role: 'admin' as const, actorId: 'actor-1' };
beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue(db);
  mockRpc.mockResolvedValue({ data: { invitation: { id: 'invite-1' }, created: true }, error: null });
  mockFrom.mockReturnValue(stubQuery({ data: { id: 'event-1' }, error: null }));
  mockDeliverNewEvent.mockResolvedValue({ scanned: 1, sent: 1, cancelled: 0, failed: 0, errors: [] });
});

describe('createInvitationRepository', () => {
  it('forces organization scope when listing pending invitations', async () => {
    const query = stubQuery({ data: [], error: null }); mockFrom.mockReturnValue(query);
    await createInvitationRepository(scope).list();
    expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(query.calls).toContainEqual({ method: 'in', args: ['status', ['pending']] });
  });

  it('rejects owner invitations from an admin before database access', async () => {
    await expect(createInvitationRepository(scope).create({ email: 'owner@example.com', role: 'owner' }))
      .rejects.toEqual(expect.objectContaining({ message: 'Only owners can invite another owner', status: 403 }));
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('commits invitation state before promptly attempting its new email event', async () => {
    await createInvitationRepository(scope).create({ email: 'a@example.com', role: 'member', message: 'Welcome!' });
    expect(mockRpc).toHaveBeenCalledWith('mutate_org_invitation', {
      p_org_id: 'org-1', p_actor_id: 'actor-1', p_operation: 'create',
      p_email: 'a@example.com', p_role: 'member', p_message: 'Welcome!', p_invitation_id: null,
    });
    expect(mockFrom).toHaveBeenCalledWith('org_invitation_email_outbox');
    expect(mockDeliverNewEvent).toHaveBeenCalledWith(db, 'event-1');
  });

  it('does not deliver cancelled invitations and promptly delivers resends', async () => {
    const repository = createInvitationRepository(scope);
    await repository.cancel('invite-1');
    await repository.resend('invite-1');
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'mutate_org_invitation', expect.objectContaining({ p_operation: 'cancel', p_invitation_id: 'invite-1' }));
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'mutate_org_invitation', expect.objectContaining({ p_operation: 'resend', p_invitation_id: 'invite-1' }));
    expect(mockDeliverNewEvent).toHaveBeenCalledTimes(1);
  });

  it('keeps a committed invitation when prompt delivery cannot be attempted', async () => {
    mockDeliverNewEvent.mockRejectedValue(new Error('email provider unavailable'));

    await expect(createInvitationRepository(scope).create({ email: 'a@example.com', role: 'member' }))
      .resolves.toEqual({ invitation: { id: 'invite-1' }, created: true });
    expect(mockRpc).toHaveBeenCalledWith('mutate_org_invitation', expect.objectContaining({ p_operation: 'create' }));
  });

  it('does not expose elevated database access', () => {
    const repository = createInvitationRepository(scope);
    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });
});
