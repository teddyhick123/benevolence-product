// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createNotificationPreferenceRepository } from '@/lib/api/repositories/notifications';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockFrom } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue({ from: mockFrom });
});

describe('createNotificationPreferenceRepository', () => {
  it('loads preferences only for the active authorized member row', async () => {
    const readQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: { notification_prefs: { digest: 'daily' } },
          error: null,
        },
      }
    );
    mockFrom.mockReturnValue(readQuery);

    const preferences = await createNotificationPreferenceRepository({
      orgId: 'org-1',
      principal: { kind: 'user', userId: 'member-1' },
    }).getOwnPreferences();

    expect(readQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(readQuery.calls).toContainEqual({ method: 'eq', args: ['user_id', 'member-1'] });
    expect(readQuery.calls).toContainEqual({ method: 'is', args: ['deleted_at', null] });
    expect(preferences).toEqual({ digest: 'daily' });
  });

  it('reads and writes only the authorized member row', async () => {
    const readQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            notification_prefs: {
              digest: 'weekly',
              channels: { in_app: true, email: true },
            },
          },
          error: null,
        },
      }
    );
    const updateQuery = stubQuery({ data: null, error: null });
    mockFrom.mockReturnValueOnce(readQuery).mockReturnValueOnce(updateQuery);

    const repository = createNotificationPreferenceRepository({
      orgId: 'org-1',
      principal: { kind: 'user', userId: 'member-1' },
    });
    const result = await repository.updateOwnPreferences({ digest: 'daily' });

    for (const query of [readQuery, updateQuery]) {
      expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
      expect(query.calls).toContainEqual({ method: 'eq', args: ['user_id', 'member-1'] });
    }
    expect(updateQuery.update).toHaveBeenCalledWith({
      notification_prefs: {
        digest: 'daily',
        channels: { in_app: true, email: true },
      },
    });
    expect(result).toEqual({
      digest: 'daily',
      channels: { in_app: true, email: true },
    });
  });

  it('does not expose the elevated client or generic table access', () => {
    const repository = createNotificationPreferenceRepository({
      orgId: 'org-1',
      principal: { kind: 'user', userId: 'member-1' },
    });

    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });
});
