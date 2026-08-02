// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInvitationRepository } from '@/lib/api/repositories/invitations';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockFrom, mockSendInviteEmail } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(), mockFrom: vi.fn(), mockSendInviteEmail: vi.fn(),
}));
vi.mock('@/lib/api/admin-client', () => ({ createElevatedClient: mockCreateElevatedClient }));
vi.mock('@/lib/email/resend', () => ({ sendInviteEmail: mockSendInviteEmail }));

const db = { from: mockFrom };
const scope = { orgId: 'org-1', role: 'admin' as const, actorId: 'actor-1' };
beforeEach(() => { vi.clearAllMocks(); mockCreateElevatedClient.mockReturnValue(db); });

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
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('scopes invite lookup, cancellation, audit, and compensation to one org', async () => {
    const lookup = stubQuery({ data: null, error: null }, { maybeSingle: { data: { id: 'invite-1', email: 'a@example.com', status: 'pending' }, error: null } });
    const update = stubQuery({ data: null, error: null });
    const audit = stubQuery({ data: null, error: { message: 'audit failed' } });
    const rollback = stubQuery({ data: null, error: null });
    mockFrom.mockReturnValueOnce(lookup).mockReturnValueOnce(update).mockReturnValueOnce(audit).mockReturnValueOnce(rollback);

    await expect(createInvitationRepository(scope).cancel('invite-1'))
      .rejects.toEqual({ message: 'audit failed' });
    for (const query of [lookup, update, rollback]) {
      expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    }
    expect(audit.calls).toContainEqual({ method: 'insert', args: [expect.objectContaining({ org_id: 'org-1', actor_id: 'actor-1' })] });
  });

  it('does not expose elevated database access', () => {
    const repository = createInvitationRepository(scope);
    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });
});
