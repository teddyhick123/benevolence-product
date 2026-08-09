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

  it('keeps sibling channel keys when the patch touches only one', async () => {
    const readQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            notification_prefs: {
              digest: 'weekly',
              channels: { in_app: true, email: true },
              alerts: { task_assigned: true, grant_due: false },
            },
          },
          error: null,
        },
      }
    );
    const updateQuery = stubQuery({ data: null, error: null });
    mockFrom.mockReturnValueOnce(readQuery).mockReturnValueOnce(updateQuery);

    const result = await createNotificationPreferenceRepository({
      orgId: 'org-1',
      principal: { kind: 'user', userId: 'member-1' },
    }).updateOwnPreferences({ channels: { email: false } });

    expect(result).toEqual({
      digest: 'weekly',
      channels: { in_app: true, email: false },
      alerts: { task_assigned: true, grant_due: false },
    });
  });

  it('keeps sibling alert keys when the patch touches only one', async () => {
    const readQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            notification_prefs: {
              channels: { in_app: true, email: true },
              alerts: { task_assigned: true, grant_due: true },
            },
          },
          error: null,
        },
      }
    );
    const updateQuery = stubQuery({ data: null, error: null });
    mockFrom.mockReturnValueOnce(readQuery).mockReturnValueOnce(updateQuery);

    const result = await createNotificationPreferenceRepository({
      orgId: 'org-1',
      principal: { kind: 'user', userId: 'member-1' },
    }).updateOwnPreferences({ alerts: { grant_due: false } });

    expect(result).toEqual({
      channels: { in_app: true, email: true },
      alerts: { task_assigned: true, grant_due: false },
    });
  });

  it('still accepts a full replacement payload from the settings form', async () => {
    const readQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            notification_prefs: {
              digest: 'weekly',
              channels: { in_app: true, email: true },
              alerts: { task_assigned: true },
            },
          },
          error: null,
        },
      }
    );
    const updateQuery = stubQuery({ data: null, error: null });
    mockFrom.mockReturnValueOnce(readQuery).mockReturnValueOnce(updateQuery);

    const result = await createNotificationPreferenceRepository({
      orgId: 'org-1',
      principal: { kind: 'user', userId: 'member-1' },
    }).updateOwnPreferences({
      digest: 'never',
      channels: { in_app: false, email: false },
      alerts: { task_assigned: false },
    });

    expect(result).toEqual({
      digest: 'never',
      channels: { in_app: false, email: false },
      alerts: { task_assigned: false },
    });
  });

  it('writes the first preferences for a member with none stored', async () => {
    const readQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { notification_prefs: null }, error: null } }
    );
    const updateQuery = stubQuery({ data: null, error: null });
    mockFrom.mockReturnValueOnce(readQuery).mockReturnValueOnce(updateQuery);

    const result = await createNotificationPreferenceRepository({
      orgId: 'org-1',
      principal: { kind: 'user', userId: 'member-1' },
    }).updateOwnPreferences({ channels: { email: true } });

    expect(result).toEqual({ channels: { email: true } });
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
