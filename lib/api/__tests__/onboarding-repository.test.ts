// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOnboardingRepository } from '@/lib/api/repositories/onboarding';
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

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue(db);
});

describe('onboarding repository', () => {
  it('scopes latest-session reads to the authenticated user', async () => {
    const query = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'session-1' }, error: null } }
    );
    mockFrom.mockReturnValue(query);

    const result = await createOnboardingRepository('user-1').latestSession();

    expect(result).toEqual({ id: 'session-1' });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] });
  });

  it('creates and refetches a session only for the authenticated user', async () => {
    mockRpc.mockResolvedValue({ data: 'session-1', error: null });
    const query = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'session-1' }, error: null } }
    );
    mockFrom.mockReturnValue(query);

    await createOnboardingRepository('user-1').getOrCreateSession();

    expect(mockRpc).toHaveBeenCalledWith('get_or_create_onboarding_session', {
      p_user_id: 'user-1',
    });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['id', 'session-1'] });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] });
  });

  it('resolves a session with both resource and user scope before child reads', async () => {
    const sessionQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'session-1',
            user_id: 'user-1',
            quick_intake: {},
            conversation_state: {},
            started_at: null,
          },
          error: null,
        },
      }
    );
    const profileQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'profile-1' }, error: null } }
    );
    mockFrom.mockReturnValueOnce(sessionQuery).mockReturnValueOnce(profileQuery);

    const session = await createOnboardingRepository('user-1').resolveSession('session-1');
    await session?.profile();

    expect(sessionQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'session-1'] });
    expect(sessionQuery.calls).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] });
    expect(profileQuery.calls).toContainEqual({ method: 'eq', args: ['session_id', 'session-1'] });
  });

  it('preserves the opaque not-found result for session lookup failures', async () => {
    const query = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: { message: 'lookup failed' } } }
    );
    mockFrom.mockReturnValue(query);

    await expect(
      createOnboardingRepository('user-1').resolveSession('session-1')
    ).resolves.toBeNull();
  });

  it('keeps intake and analytics writes inside the resolved session scope', async () => {
    const sessionQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'session-1',
            user_id: 'user-1',
            quick_intake: {},
            conversation_state: {},
            started_at: '2026-08-02T00:00:00.000Z',
          },
          error: null,
        },
      }
    );
    const sessionUpdate = stubQuery({ data: null, error: null });
    const analyticsUpdate = stubQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(sessionQuery)
      .mockReturnValueOnce(sessionUpdate)
      .mockReturnValueOnce(analyticsUpdate);

    const session = await createOnboardingRepository('user-1').resolveSession('session-1');
    await session?.saveIntake(
      { org_name: 'Example Foundation' },
      [{ role: 'assistant', content: 'Welcome', timestamp: new Date().toISOString() }]
    );

    expect(sessionUpdate.calls).toContainEqual({ method: 'eq', args: ['id', 'session-1'] });
    expect(sessionUpdate.calls).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] });
    expect(analyticsUpdate.calls).toContainEqual({
      method: 'eq',
      args: ['session_id', 'session-1'],
    });
  });

  it('does not expose the elevated client from either repository scope', async () => {
    const query = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'session-1',
            user_id: 'user-1',
            quick_intake: {},
            conversation_state: {},
            started_at: null,
          },
          error: null,
        },
      }
    );
    mockFrom.mockReturnValue(query);

    const repository = createOnboardingRepository('user-1');
    const session = await repository.resolveSession('session-1');

    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
    expect(session).not.toHaveProperty('db');
    expect(session).not.toHaveProperty('from');
  });
});
