// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createOnboardingRepository } from '@/lib/api/repositories/onboarding';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const {
  mockCreateElevatedClient,
  mockFrom,
  mockRpc,
  mockOnboardingAssistant,
  mockAssistantChat,
  mockGenerateRecommendations,
} = vi.hoisted(() => {
  const mockAssistantChat = vi.fn();
  const mockGenerateRecommendations = vi.fn();
  return {
    mockCreateElevatedClient: vi.fn(),
    mockFrom: vi.fn(),
    mockRpc: vi.fn(),
    mockOnboardingAssistant: vi.fn(function MockOnboardingAssistant() {
      return {
        chat: mockAssistantChat,
        generateRecommendations: mockGenerateRecommendations,
      };
    }),
    mockAssistantChat,
    mockGenerateRecommendations,
  };
});

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

vi.mock('@/lib/onboarding-assistant', () => ({
  OnboardingAssistant: mockOnboardingAssistant,
}));

const db = { from: mockFrom, rpc: mockRpc };

beforeEach(() => {
  vi.clearAllMocks();
  mockFrom.mockReset();
  mockRpc.mockReset();
  mockCreateElevatedClient.mockReturnValue(db);
  mockAssistantChat.mockResolvedValue({
    message: 'Assistant reply',
    extractions: { goals: [] },
    updated_state: { message_count: 2, ready_for_recommendations: false },
    trigger_recommendations: false,
  });
  mockGenerateRecommendations.mockResolvedValue({
    recommendations: [{ module_id: 'impact_tracking' }],
    excluded: [{ module_id: 'analytics' }],
  });
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

  it('sends prior turns once and scopes both chat session writes to the owner', async () => {
    const sessionQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'session-1',
            user_id: 'user-1',
            status: 'conversation',
            quick_intake: { org_name: 'Example Foundation' },
            conversation_state: { message_count: 1 },
            messages: [{
              role: 'assistant',
              content: 'Prior turn',
              timestamp: '2026-08-02T00:00:00.000Z',
            }],
            started_at: null,
            intake_completed_at: null,
          },
          error: null,
        },
      }
    );
    const userMessageUpdate = stubQuery({ data: null, error: null });
    const assistantMessageUpdate = stubQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(sessionQuery)
      .mockReturnValueOnce(userMessageUpdate)
      .mockReturnValueOnce(assistantMessageUpdate);

    const session = await createOnboardingRepository('user-1').resolveSession('session-1');
    const result = await session?.chat('New message');

    expect(mockOnboardingAssistant).toHaveBeenCalledWith(db);
    expect(mockAssistantChat).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'session-1',
      userId: 'user-1',
      message: 'New message',
      conversationHistory: [{ role: 'assistant', content: 'Prior turn' }],
    }));
    for (const query of [userMessageUpdate, assistantMessageUpdate]) {
      expect(query.calls).toContainEqual({ method: 'eq', args: ['id', 'session-1'] });
      expect(query.calls).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] });
    }
    expect(result?.readyForRecommendations).toBe(false);
  });

  it('keeps generated recommendation state and analytics inside the owned session', async () => {
    const sessionQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'session-1',
            user_id: 'user-1',
            status: 'recommendations',
            quick_intake: {},
            conversation_state: {},
            messages: [],
            started_at: null,
            intake_completed_at: null,
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
    await session?.generateRecommendations();

    expect(mockGenerateRecommendations).toHaveBeenCalledWith('session-1');
    expect(sessionUpdate.calls).toContainEqual({ method: 'eq', args: ['id', 'session-1'] });
    expect(sessionUpdate.calls).toContainEqual({ method: 'eq', args: ['user_id', 'user-1'] });
    expect(analyticsUpdate.calls).toContainEqual({
      method: 'eq',
      args: ['session_id', 'session-1'],
    });
  });

  it('finalizes recommendations and telemetry only after resolving the owned session', async () => {
    const sessionQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'session-1',
            user_id: 'user-1',
            status: 'recommendations',
            quick_intake: {},
            conversation_state: {},
            messages: [],
            started_at: null,
            intake_completed_at: null,
          },
          error: null,
        },
      }
    );
    const recommendationsQuery = stubQuery(
      { data: null, error: null },
      {
        single: {
          data: { recommended_modules: [{ module_id: 'impact_tracking' }] },
          error: null,
        },
      }
    );
    const recommendationsUpdate = stubQuery({ data: null, error: null });
    const analyticsUpdate = stubQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(sessionQuery)
      .mockReturnValueOnce(recommendationsQuery)
      .mockReturnValueOnce(recommendationsUpdate)
      .mockReturnValueOnce(analyticsUpdate);

    const session = await createOnboardingRepository('user-1').resolveSession('session-1');
    const result = await session?.finalizeRecommendations(['impact_tracking', 'reporting']);

    expect(recommendationsQuery.calls).toContainEqual({
      method: 'eq',
      args: ['session_id', 'session-1'],
    });
    expect(recommendationsUpdate.calls).toContainEqual({
      method: 'eq',
      args: ['session_id', 'session-1'],
    });
    expect(analyticsUpdate.calls).toContainEqual({
      method: 'eq',
      args: ['session_id', 'session-1'],
    });
    expect(result).toEqual({
      finalModules: ['impact_tracking', 'reporting'],
      userAdded: ['reporting'],
      userRemoved: [],
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
