// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createImplementationReviewerRepository } from '@/lib/api/repositories/implementation-reviewers';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockFrom } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

const db = { from: mockFrom };
const scope = { orgId: 'org-1', actorId: 'actor-1' };

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue(db);
});

describe('createImplementationReviewerRepository', () => {
  it('lists only accepted admin and owner memberships in the authorized org', async () => {
    const members = stubQuery({ data: [], error: null });
    const capabilities = stubQuery({ data: [], error: null });
    mockFrom.mockReturnValueOnce(members).mockReturnValueOnce(capabilities);

    await createImplementationReviewerRepository(scope).list();

    expect(members.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(members.calls).toContainEqual({ method: 'is', args: ['deleted_at', null] });
    expect(members.calls).toContainEqual({ method: 'not', args: ['accepted_at', 'is', null] });
    expect(members.calls).toContainEqual({ method: 'in', args: ['role', ['admin', 'owner']] });
    expect(capabilities.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(capabilities.calls).toContainEqual({
      method: 'eq',
      args: ['capability', 'implementation_reviewer'],
    });
  });

  it('scopes the target lookup and capability grant to the authorized org and actor', async () => {
    const membership = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'member-1', role: 'admin' }, error: null } }
    );
    const upsert = stubQuery({ data: null, error: null });
    const members = stubQuery({ data: [], error: null });
    const capabilities = stubQuery({ data: [], error: null });
    mockFrom
      .mockReturnValueOnce(membership)
      .mockReturnValueOnce(upsert)
      .mockReturnValueOnce(members)
      .mockReturnValueOnce(capabilities);

    await createImplementationReviewerRepository(scope).grant('target-1');

    expect(membership.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(membership.calls).toContainEqual({ method: 'eq', args: ['user_id', 'target-1'] });
    expect(membership.calls).toContainEqual({ method: 'not', args: ['accepted_at', 'is', null] });
    expect(upsert.calls).toContainEqual({
      method: 'upsert',
      args: [{
        org_id: 'org-1',
        user_id: 'target-1',
        capability: 'implementation_reviewer',
        granted_by: 'actor-1',
      }, { onConflict: 'org_id,user_id,capability' }],
    });
  });

  it('scopes capability revocation to the authorized org and target user', async () => {
    const remove = stubQuery({ data: null, error: null });
    const members = stubQuery({ data: [], error: null });
    const capabilities = stubQuery({ data: [], error: null });
    mockFrom
      .mockReturnValueOnce(remove)
      .mockReturnValueOnce(members)
      .mockReturnValueOnce(capabilities);

    await createImplementationReviewerRepository(scope).revoke('target-1');

    expect(remove.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(remove.calls).toContainEqual({ method: 'eq', args: ['user_id', 'target-1'] });
    expect(remove.calls).toContainEqual({
      method: 'eq',
      args: ['capability', 'implementation_reviewer'],
    });
  });

  it('does not expose the elevated client or generic table access', () => {
    const repository = createImplementationReviewerRepository(scope);
    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });
});
