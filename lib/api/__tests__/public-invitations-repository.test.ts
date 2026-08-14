// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveInvitationToken } from '@/lib/api/repositories/public-invitations';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockFrom, mockRpc } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

const db = { from: mockFrom, rpc: mockRpc };
const invitation = {
  id: 'invite-1',
  org_id: 'org-1',
  email: 'invitee@example.test',
  role: 'member',
  status: 'pending',
  expires_at: '2999-01-01T00:00:00.000Z',
};

function invitationLookup() {
  return stubQuery(
    { data: null, error: null },
    { maybeSingle: { data: invitation, error: null } }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue(db);
});

describe('resolveInvitationToken', () => {
  it('resolves a raw token once and returns only invitation scope', async () => {
    const lookup = invitationLookup();
    mockFrom.mockReturnValue(lookup);

    const result = await resolveInvitationToken('raw-token');

    expect(lookup.calls).toContainEqual({ method: 'eq', args: ['token', 'raw-token'] });
    expect(result).toMatchObject({
      ok: true,
      context: {
        principal: { kind: 'invitation', invitationId: 'invite-1' },
        orgId: 'org-1',
        email: 'invitee@example.test',
      },
    });
    expect(result).not.toHaveProperty('token');
    if (!result.ok) throw new Error('expected resolved invitation');
    expect(result.context).not.toHaveProperty('token');
  });

  it('scopes expiry updates to the resolved invitation and organization', async () => {
    const lookup = invitationLookup();
    const update = stubQuery({ data: null, error: null });
    mockFrom.mockReturnValueOnce(lookup).mockReturnValueOnce(update);

    const result = await resolveInvitationToken('raw-token');
    if (!result.ok) throw new Error('expected resolved invitation');
    await result.repository.markExpired();

    expect(update.calls).toContainEqual({ method: 'eq', args: ['id', 'invite-1'] });
    expect(update.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
  });

  it('accepts through the single token-bound transaction for the resolved invitation', async () => {
    const lookup = invitationLookup();
    mockFrom.mockReturnValueOnce(lookup);
    mockRpc.mockResolvedValueOnce({ data: { org_id: 'org-1', idempotent: false }, error: null });

    const result = await resolveInvitationToken('raw-token');
    if (!result.ok) throw new Error('expected resolved invitation');
    await result.repository.accept('user-1');

    expect(mockRpc).toHaveBeenCalledWith('accept_org_invitation', {
      p_org_id: 'org-1',
      p_invitation_id: 'invite-1',
      p_invitation_token: 'raw-token',
      p_user_id: 'user-1',
    });
  });

  it('does not expose elevated database access', async () => {
    mockFrom.mockReturnValue(invitationLookup());
    const result = await resolveInvitationToken('raw-token');
    if (!result.ok) throw new Error('expected resolved invitation');
    expect(result.repository).not.toHaveProperty('db');
    expect(result.repository).not.toHaveProperty('from');
  });
});
