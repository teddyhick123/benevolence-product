// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPledgeRepository } from '@/lib/api/repositories/pledges';

const {
  mockCreateElevatedClient,
  mockRpc,
  mockCompleteGeneratedTasks,
  mockCancelGeneratedTasks,
} = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockRpc: vi.fn(),
  mockCompleteGeneratedTasks: vi.fn(),
  mockCancelGeneratedTasks: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

vi.mock('@/lib/tasks/automation/task-writer', () => ({
  completeGeneratedTasks: mockCompleteGeneratedTasks,
  cancelGeneratedTasks: mockCancelGeneratedTasks,
}));

const db = { rpc: mockRpc };

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue(db);
});

describe('createPledgeRepository', () => {
  it('injects org and actor scope into transactional cancellation', async () => {
    mockRpc.mockResolvedValue({ data: { waived_count: 2 }, error: null });

    await createPledgeRepository({ orgId: 'org-1', actorId: 'admin-1' })
      .cancelPledge({
        pledgeId: 'pledge-1',
        cancellationReason: 'Donor request',
        waivePending: true,
      });

    expect(mockRpc).toHaveBeenCalledWith('cancel_pledge_with_obligations', {
      p_org_id: 'org-1',
      p_pledge_id: 'pledge-1',
      p_actor_id: 'admin-1',
      p_cancellation_reason: 'Donor request',
      p_waive_pending: true,
    });
  });

  it('synchronizes terminal installment tasks inside the repository org', async () => {
    const repository = createPledgeRepository({ orgId: 'org-1', actorId: 'member-1' });

    await repository.syncInstallmentTasks('installment-1', 'mark_paid');
    await repository.syncInstallmentTasks('installment-2', 'waive');
    await repository.syncInstallmentTasks('installment-3', 'write_off');
    await repository.syncInstallmentTasks('installment-4', 'reopen');

    expect(mockCompleteGeneratedTasks).toHaveBeenCalledWith(
      db,
      'org-1',
      'pledge_installment:installment-1:',
      'Installment paid'
    );
    expect(mockCancelGeneratedTasks).toHaveBeenNthCalledWith(
      1,
      db,
      'org-1',
      'pledge_installment:installment-2:',
      'Installment waived'
    );
    expect(mockCancelGeneratedTasks).toHaveBeenNthCalledWith(
      2,
      db,
      'org-1',
      'pledge_installment:installment-3:',
      'Installment written off'
    );
    expect(mockCompleteGeneratedTasks).toHaveBeenCalledTimes(1);
    expect(mockCancelGeneratedTasks).toHaveBeenCalledTimes(2);
  });

  it('does not expose the elevated client or generic database access', () => {
    const repository = createPledgeRepository({ orgId: 'org-1', actorId: 'member-1' });
    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('rpc');
  });
});
