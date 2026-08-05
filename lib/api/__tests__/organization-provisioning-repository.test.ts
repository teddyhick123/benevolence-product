// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOrganizationProvisioningRepository } from '@/lib/api/repositories/organization-provisioning';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockRpc, mockFrom } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockRpc: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({ createElevatedClient: mockCreateElevatedClient }));

const context = {
  principal: { kind: 'user' as const, userId: 'user-1' },
  user: { id: 'user-1' },
  db: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue({ rpc: mockRpc, from: mockFrom });
  mockRpc.mockResolvedValue({ data: 'org-1', error: null });
  mockFrom.mockImplementation((table: string) => {
    if (table === 'organizations') {
      return stubQuery(
        { data: null, error: null },
        { single: { data: { id: 'org-1', name: 'Foundation' }, error: null } }
      );
    }
    if (table === 'portfolios') {
      return stubQuery(
        { data: null, error: null },
        { single: { data: { id: 'portfolio-1' }, error: null } }
      );
    }
    return stubQuery({ data: null, error: null });
  });
});

describe('organization provisioning repository', () => {
  it('binds organization and portfolio ownership to the authenticated creator', async () => {
    const repository = createOrganizationProvisioningRepository(context as never);

    await expect(repository.create({
      name: 'Foundation',
      orgType: 'private_foundation',
    })).resolves.toMatchObject({ id: 'org-1', portfolio_id: 'portfolio-1' });

    expect(mockRpc).toHaveBeenCalledWith('provision_organization', expect.objectContaining({
      p_owner_user_id: 'user-1',
      p_name: 'Foundation',
      p_modules: { portfolio: true },
    }));
    const portfolioMembers = mockFrom.mock.results
      .find((result, index) => mockFrom.mock.calls[index][0] === 'portfolio_members')?.value;
    expect(portfolioMembers.calls).toContainEqual({
      method: 'insert',
      args: [{ user_id: 'user-1', portfolio_id: 'portfolio-1', role: 'owner' }],
    });
    expect(repository).not.toHaveProperty('db');
  });
});
