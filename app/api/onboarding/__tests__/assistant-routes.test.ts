// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  mockRequireUserAccess,
  mockCreateOnboardingRepository,
  mockResolveSession,
  mockChat,
  mockExistingRecommendations,
  mockGenerateRecommendations,
  mockFinalizeRecommendations,
} = vi.hoisted(() => ({
  mockRequireUserAccess: vi.fn(),
  mockCreateOnboardingRepository: vi.fn(),
  mockResolveSession: vi.fn(),
  mockChat: vi.fn(),
  mockExistingRecommendations: vi.fn(),
  mockGenerateRecommendations: vi.fn(),
  mockFinalizeRecommendations: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireUserAccess: mockRequireUserAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/onboarding', () => ({
  createOnboardingRepository: mockCreateOnboardingRepository,
}));

import { POST as chat } from '@/app/api/onboarding/chat/route';
import {
  GET as getRecommendations,
  POST as finalizeRecommendations,
} from '@/app/api/onboarding/recommendations/route';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';
const sessionRepository = {
  scope: {
    sessionId: SESSION_ID,
    status: 'conversation',
    quickIntake: {},
    conversationState: {},
  },
  chat: mockChat,
  existingRecommendations: mockExistingRecommendations,
  generateRecommendations: mockGenerateRecommendations,
  finalizeRecommendations: mockFinalizeRecommendations,
};

beforeEach(() => {
  vi.clearAllMocks();
  sessionRepository.scope.status = 'conversation';
  mockRequireUserAccess.mockResolvedValue({
    ok: true,
    context: {
      principal: { kind: 'user', userId: 'user-1' },
      user: { id: 'user-1', email: 'member@example.test' },
      db: {},
    },
  });
  mockCreateOnboardingRepository.mockReturnValue({ resolveSession: mockResolveSession });
  mockResolveSession.mockResolvedValue(sessionRepository);
  mockChat.mockResolvedValue({
    message: 'Assistant reply',
    extractions: { goals: [] },
    updated_state: { message_count: 2 },
    readyForRecommendations: false,
  });
  mockExistingRecommendations.mockResolvedValue(null);
  mockGenerateRecommendations.mockResolvedValue({
    recommendations: [{ module_id: 'impact_tracking', confidence: 0.9 }],
    excluded: [{ module_id: 'analytics', reason: 'Not yet needed' }],
  });
  mockFinalizeRecommendations.mockResolvedValue({
    finalModules: ['impact_tracking'],
    userAdded: [],
    userRemoved: [],
  });
});

describe('onboarding assistant routes', () => {
  it('authenticates before resolving a chat session', async () => {
    mockRequireUserAccess.mockResolvedValueOnce({
      ok: false,
      reason: 'unauthenticated',
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await chat(new NextRequest('http://localhost/api/onboarding/chat', {
      method: 'POST',
      body: JSON.stringify({ sessionId: SESSION_ID, message: 'Hello' }),
    }));

    expect(response.status).toBe(401);
    expect(mockResolveSession).not.toHaveBeenCalled();
  });

  it('conceals an unowned chat session and performs no AI work', async () => {
    mockResolveSession.mockResolvedValueOnce(null);

    const response = await chat(new NextRequest('http://localhost/api/onboarding/chat', {
      method: 'POST',
      body: JSON.stringify({ sessionId: SESSION_ID, message: 'Hello' }),
    }));

    expect(response.status).toBe(404);
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('requires the resolved session to be in conversation state', async () => {
    sessionRepository.scope.status = 'recommendations';

    const response = await chat(new NextRequest('http://localhost/api/onboarding/chat', {
      method: 'POST',
      body: JSON.stringify({ sessionId: SESSION_ID, message: 'Hello' }),
    }));

    expect(response.status).toBe(400);
    expect(mockChat).not.toHaveBeenCalled();
  });

  it('returns the scoped assistant result without exposing repository state', async () => {
    const response = await chat(new NextRequest('http://localhost/api/onboarding/chat', {
      method: 'POST',
      body: JSON.stringify({ sessionId: SESSION_ID, message: 'Hello' }),
    }));

    expect(mockCreateOnboardingRepository).toHaveBeenCalledWith('user-1');
    expect(mockResolveSession).toHaveBeenCalledWith(SESSION_ID);
    expect(mockChat).toHaveBeenCalledWith('Hello');
    expect(await response.json()).toEqual({
      message: 'Assistant reply',
      extractions: { goals: [] },
      conversation_state: { message_count: 2 },
      ready_for_recommendations: false,
    });
  });

  it('returns existing recommendations without regenerating them', async () => {
    mockExistingRecommendations.mockResolvedValueOnce({
      recommended_modules: [{ module_id: 'impact_tracking', confidence: 0.8 }],
      excluded_modules: [{ module_id: 'analytics', reason: 'Not yet needed' }],
      final_modules: ['impact_tracking'],
    });

    const response = await getRecommendations(new NextRequest(
      `http://localhost/api/onboarding/recommendations?sessionId=${SESSION_ID}`
    ));
    const body = await response.json();

    expect(mockGenerateRecommendations).not.toHaveBeenCalled();
    expect(body.final_modules).toEqual(['impact_tracking']);
    expect(body.recommendations[0]).toMatchObject({
      module_id: 'impact_tracking',
      module: { id: 'impact_tracking' },
    });
  });

  it('generates recommendations only through the resolved session', async () => {
    const response = await getRecommendations(new NextRequest(
      `http://localhost/api/onboarding/recommendations?sessionId=${SESSION_ID}`
    ));
    const body = await response.json();

    expect(mockResolveSession).toHaveBeenCalledWith(SESSION_ID);
    expect(mockGenerateRecommendations).toHaveBeenCalledOnce();
    expect(body.recommendations[0]).toMatchObject({ module_id: 'impact_tracking' });
  });

  it('finalizes selected modules through the resolved owned session', async () => {
    const response = await finalizeRecommendations(new NextRequest(
      'http://localhost/api/onboarding/recommendations',
      {
        method: 'POST',
        body: JSON.stringify({
          sessionId: SESSION_ID,
          accepted_modules: ['impact_tracking'],
        }),
      }
    ));

    expect(mockFinalizeRecommendations).toHaveBeenCalledWith(['impact_tracking']);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      success: true,
      final_modules: ['impact_tracking'],
      user_added: [],
      user_removed: [],
    });
  });
});
