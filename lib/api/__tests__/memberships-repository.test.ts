// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMembershipRepository } from '@/lib/api/repositories/memberships';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockFrom, mockListUsers } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockListUsers: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

const db = { from: mockFrom, auth: { admin: { listUsers: mockListUsers } } };
const adminScope = { orgId: 'org-1', role: 'admin' as const, actorId: 'actor-1' };

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue(db);
});

describe('createMembershipRepository', () => {
  it('forces organization scope when listing members', async () => {
    const query = stubQuery({ data: [], error: null });
    mockFrom.mockReturnValue(query);

    await createMembershipRepository(adminScope).list();

    expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(query.calls).toContainEqual({ method: 'is', args: ['deleted_at', null] });
  });

  it('scopes both the target lookup and role update to the authorized org', async () => {
    const lookup = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'membership-1', role: 'member' }, error: null } }
    );
    const update = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'membership-1', role: 'admin' }, error: null } }
    );
    const audit = stubQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(lookup)
      .mockReturnValueOnce(update)
      .mockReturnValueOnce(audit);

    await createMembershipRepository(adminScope).updateRole('user-1', 'admin', false);

    for (const query of [lookup, update]) {
      expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
      expect(query.calls).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] });
    }
    expect(audit.calls).toContainEqual({
      method: 'insert',
      args: [expect.objectContaining({
        org_id: 'org-1',
        actor_id: 'actor-1',
        target_id: 'user-1',
      })],
    });
  });

  it('prevents an admin from changing owner membership before writing', async () => {
    const lookup = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'membership-1', role: 'owner' }, error: null } }
    );
    mockFrom.mockReturnValue(lookup);

    await expect(
      createMembershipRepository(adminScope).updateRole('owner-1', 'admin', false)
    ).rejects.toEqual(expect.objectContaining({
      message: 'Only owners can change owner membership',
      status: 403,
    }));
    expect(mockFrom).toHaveBeenCalledTimes(1);
  });

  it('prevents removal of the last owner using an org-scoped count', async () => {
    const lookup = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'membership-1', role: 'owner' }, error: null } }
    );
    const count = stubQuery({ data: null, error: null } as any);
    count.then = onFulfilled => Promise.resolve(onFulfilled({ count: 1, error: null } as any));
    mockFrom.mockReturnValueOnce(lookup).mockReturnValueOnce(count);

    await expect(createMembershipRepository({
      orgId: 'org-1',
      role: 'owner',
      actorId: 'owner-2',
    }).remove('owner-1')).rejects.toEqual(expect.objectContaining({
      message: 'Cannot remove the last owner',
      status: 400,
    }));

    expect(count.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(count.calls).toContainEqual({ method: 'eq', args: ['role', 'owner'] });
    expect(mockFrom).toHaveBeenCalledTimes(2);
  });

  it('does not expose the elevated client or generic table access', () => {
    const repository = createMembershipRepository(adminScope);
    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });
});
