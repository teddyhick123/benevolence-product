// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createContributionReceiptRepository } from '@/lib/api/repositories/contribution-receipts';

const { mockCreateElevatedClient, mockRpc, mockWriteOrgAuditEvent } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockRpc: vi.fn(),
  mockWriteOrgAuditEvent: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({ createElevatedClient: mockCreateElevatedClient }));
vi.mock('@/lib/audit/org-audit', () => ({
  ORG_AUDIT_ACTIONS: { CONTRIBUTION_RECEIPT_GENERATED: 'contribution.receipt_generated' },
  writeOrgAuditEvent: mockWriteOrgAuditEvent,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue({ rpc: mockRpc });
});

describe('contribution receipt repository', () => {
  it('forces the authorized org and actor into the atomic receipt and audit operations', async () => {
    mockRpc.mockResolvedValue({
      data: { letter: { id: 'letter-1' }, receipt_number: 'R-1', sent: true },
      error: null,
    });
    const repository = createContributionReceiptRepository({
      orgId: 'org-1',
      principal: { kind: 'user', userId: 'user-1' },
    });

    await repository.generate({
      contributionId: 'contribution-1',
      subject: 'Receipt',
      body: 'Thank you',
      sendImmediately: true,
      recipientEmail: 'donor@example.test',
      amount: 100,
      contributionDate: '2026-08-05',
    });

    expect(mockRpc).toHaveBeenCalledWith('create_contribution_receipt_acknowledgment', {
      p_org_id: 'org-1',
      p_contribution_id: 'contribution-1',
      p_actor_id: 'user-1',
      p_subject: 'Receipt',
      p_body: 'Thank you',
      p_send_immediately: true,
      p_recipient_email: 'donor@example.test',
    });
    expect(mockWriteOrgAuditEvent).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      orgId: 'org-1',
      actorId: 'user-1',
      targetId: 'contribution-1',
    }));
    expect(repository).not.toHaveProperty('db');
  });
});
