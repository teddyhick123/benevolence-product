// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInvitationRepository } from '@/lib/api/repositories/invitations';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockFrom, mockRpc } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(), mockFrom: vi.fn(), mockRpc: vi.fn(),
}));
vi.mock('@/lib/api/admin-client', () => ({ createElevatedClient: mockCreateElevatedClient }));

const db = { from: mockFrom, rpc: mockRpc };
const scope = { orgId: 'org-1', role: 'admin' as const, actorId: 'actor-1' };
beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue(db);
  mockRpc.mockResolvedValue({ data: { invitation: { id: 'invite-1' }, created: true }, error: null });
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

  it('commits invitation state, audit, and email intent through the single transactional RPC', async () => {
    await createInvitationRepository(scope).create({ email: 'a@example.com', role: 'member', message: 'Welcome!' });
    expect(mockRpc).toHaveBeenCalledWith('mutate_org_invitation', {
      p_org_id: 'org-1', p_actor_id: 'actor-1', p_operation: 'create',
      p_email: 'a@example.com', p_role: 'member', p_message: 'Welcome!', p_invitation_id: null,
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('cancels and resends through transactional operations without inline email delivery', async () => {
    const repository = createInvitationRepository(scope);
    await repository.cancel('invite-1');
    await repository.resend('invite-1');
    expect(mockRpc).toHaveBeenNthCalledWith(1, 'mutate_org_invitation', expect.objectContaining({ p_operation: 'cancel', p_invitation_id: 'invite-1' }));
    expect(mockRpc).toHaveBeenNthCalledWith(2, 'mutate_org_invitation', expect.objectContaining({ p_operation: 'resend', p_invitation_id: 'invite-1' }));
  });

  it('does not expose elevated database access', () => {
    const repository = createInvitationRepository(scope);
    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });
});
