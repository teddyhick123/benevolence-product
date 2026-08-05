// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppAdminDirectoryRepository } from '@/lib/api/repositories/admin-directory';

const { mockCreateElevatedClient, mockListUsers } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockListUsers: vi.fn(),
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
  mockCreateElevatedClient.mockReturnValue({
    auth: { admin: { listUsers: mockListUsers } },
  });
});

describe('app-admin directory repository', () => {
  it('returns only the public lookup fields for a case-insensitive email match', async () => {
    mockListUsers.mockResolvedValue({
      data: {
        users: [{
          id: 'user-1',
          email: 'Member@Example.test',
          created_at: '2026-08-05T00:00:00Z',
          user_metadata: { full_name: 'Member' },
          app_metadata: { provider: 'email' },
        }],
      },
      error: null,
    });

    const repository = createAppAdminDirectoryRepository(adminContext as never);

    await expect(repository.findUserByEmail('member@example.test')).resolves.toEqual({
      id: 'user-1',
      email: 'Member@Example.test',
      created_at: '2026-08-05T00:00:00Z',
      user_metadata: { full_name: 'Member' },
    });
    expect(mockListUsers).toHaveBeenCalledWith({ page: 1, perPage: 1000 });
    expect(repository).not.toHaveProperty('db');
  });
});
