// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMembershipRepository } from '@/lib/api/repositories/memberships';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockFrom, mockRpc, mockListUsers } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockListUsers: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

const db = { from: mockFrom, rpc: mockRpc, auth: { admin: { listUsers: mockListUsers } } };
const adminScope = { orgId: 'org-1', role: 'admin' as const, actorId: 'actor-1' };

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue(db);
  mockRpc.mockResolvedValue({ data: { id: 'membership-1', role: 'admin' }, error: null });
});

describe('createMembershipRepository', () => {
  it('forces organization scope when listing members', async () => {
    const query = stubQuery({ data: [], error: null });
    mockFrom.mockReturnValue(query);

    await createMembershipRepository(adminScope).list();

    expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(query.calls).toContainEqual({ method: 'is', args: ['deleted_at', null] });
  });

  it('uses the one transactional RPC for role changes and never compensates in application code', async () => {
    await createMembershipRepository(adminScope).updateRole('user-1', 'admin', false);

    expect(mockRpc).toHaveBeenCalledWith('mutate_organization_membership', {
      p_org_id: 'org-1',
      p_actor_id: 'actor-1',
      p_target_user_id: 'user-1',
      p_operation: 'change_role',
      p_role: 'admin',
    });
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('maps transactional ownership denials to the appropriate HTTP-facing error', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Only owners can change owner membership' } });
    await expect(
      createMembershipRepository(adminScope).updateRole('owner-1', 'admin', false)
    ).rejects.toEqual(expect.objectContaining({
      message: 'Only owners can change owner membership',
      status: 403,
    }));
    expect(mockRpc).toHaveBeenCalledTimes(1);
  });

  it('maps a transactional last-owner conflict without a race-prone client count', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { code: 'P0001', message: 'Cannot remove the last owner' } });
    await expect(createMembershipRepository({
      orgId: 'org-1',
      role: 'owner',
      actorId: 'owner-2',
    }).remove('owner-1')).rejects.toEqual(expect.objectContaining({
      message: 'Cannot remove the last owner',
      // A conflict with current state, matching how mutate_org_invitation maps P0001.
      status: 409,
    }));
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('does not expose the elevated client or generic table access', () => {
    const repository = createMembershipRepository(adminScope);
    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });
});
