// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCharityAdminRepository } from '@/lib/api/repositories/charities-admin';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockFrom } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

const adminContext = {
  isAppAdmin: true as const,
  principal: { kind: 'user' as const, userId: 'admin-1' },
  user: { id: 'admin-1' },
  db: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue({ from: mockFrom });
});

describe('charity admin repository', () => {
  it('keeps elevated access behind catalog-specific operations', async () => {
    const lookup = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'charity-1' }, error: null } }
    );
    mockFrom.mockReturnValue(lookup);

    const repository = createCharityAdminRepository(adminContext as never);
    await repository.findByEin('12-3456789');

    expect(mockFrom).toHaveBeenCalledWith('charities');
    expect(lookup.calls).toContainEqual({ method: 'eq', args: ['ein', '12-3456789'] });
    expect(repository).not.toHaveProperty('db');
  });
});
