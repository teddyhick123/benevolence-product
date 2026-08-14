// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInvitationJobRepository, InvalidInvitationJobPrincipalError } from '@/lib/api/repositories/invitation-jobs';

const { mockCreateElevatedClient, mockDrain } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(), mockDrain: vi.fn(),
}));
vi.mock('@/lib/api/admin-client', () => ({ createElevatedClient: mockCreateElevatedClient }));
vi.mock('@/lib/invitations/email-outbox', () => ({ drainInvitationEmailOutbox: mockDrain }));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue({});
  mockDrain.mockResolvedValue({ scanned: 1, sent: 1, cancelled: 0, failed: 0, errors: [] });
});

describe('createInvitationJobRepository', () => {
  it('rejects another job principal before constructing elevated access', () => {
    expect(() => createInvitationJobRepository({ principal: { kind: 'job', job: 'notifications' } }))
      .toThrow(InvalidInvitationJobPrincipalError);
    expect(mockCreateElevatedClient).not.toHaveBeenCalled();
  });

  it('drains the invitation outbox only for the invitations job principal', async () => {
    const result = await createInvitationJobRepository({ principal: { kind: 'job', job: 'invitations' } })
      .deliver({ dryRun: false, limit: 25 });
    expect(mockDrain).toHaveBeenCalledWith({}, { dryRun: false, limit: 25 });
    expect(result).toMatchObject({ ok: true, sent: 1 });
  });
});
