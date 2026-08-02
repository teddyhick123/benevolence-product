// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  mockRequireUserAccess,
  mockCreateOnboardingRepository,
  mockLatestSession,
  mockGetOrCreateSession,
  mockResolveSession,
  mockProfile,
  mockSaveIntake,
} = vi.hoisted(() => ({
  mockRequireUserAccess: vi.fn(),
  mockCreateOnboardingRepository: vi.fn(),
  mockLatestSession: vi.fn(),
  mockGetOrCreateSession: vi.fn(),
  mockResolveSession: vi.fn(),
  mockProfile: vi.fn(),
  mockSaveIntake: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireUserAccess: mockRequireUserAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/onboarding', () => ({
  createOnboardingRepository: mockCreateOnboardingRepository,
}));

import { GET as getSession, POST as createSession } from '@/app/api/onboarding/session/route';
import { GET as getProfile } from '@/app/api/onboarding/profile/route';
import { POST as saveIntake } from '@/app/api/onboarding/intake/route';

const sessionRepository = {
  scope: {
    sessionId: '11111111-1111-4111-8111-111111111111',
    quickIntake: { org_name: 'Example Foundation' },
    conversationState: { message_count: 0 },
  },
  profile: mockProfile,
  saveIntake: mockSaveIntake,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserAccess.mockResolvedValue({
    ok: true,
    context: {
      principal: { kind: 'user', userId: 'user-1' },
      user: { id: 'user-1', email: 'member@example.test' },
      db: {},
    },
  });
  mockCreateOnboardingRepository.mockReturnValue({
    latestSession: mockLatestSession,
    getOrCreateSession: mockGetOrCreateSession,
    resolveSession: mockResolveSession,
  });
  mockLatestSession.mockResolvedValue({ id: 'session-1', status: 'conversation' });
  mockGetOrCreateSession.mockResolvedValue({ id: 'session-1', status: 'intake' });
  mockResolveSession.mockResolvedValue(sessionRepository);
  mockProfile.mockResolvedValue({ id: 'profile-1' });
});

describe('onboarding session core routes', () => {
  it('requires authentication before accessing the session repository', async () => {
    mockRequireUserAccess.mockResolvedValueOnce({
      ok: false,
      reason: 'unauthenticated',
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await getSession(new NextRequest('http://localhost/api/onboarding/session'));

    expect(response.status).toBe(401);
    expect(mockCreateOnboardingRepository).not.toHaveBeenCalled();
  });

  it('scopes session retrieval and creation to the signed-in user', async () => {
    const getResponse = await getSession(
      new NextRequest('http://localhost/api/onboarding/session')
    );
    const postResponse = await createSession(
      new NextRequest('http://localhost/api/onboarding/session', { method: 'POST' })
    );

    expect(mockCreateOnboardingRepository).toHaveBeenNthCalledWith(1, 'user-1');
    expect(mockCreateOnboardingRepository).toHaveBeenNthCalledWith(2, 'user-1');
    expect(await getResponse.json()).toEqual({
      session: { id: 'session-1', status: 'conversation' },
      hasCompletedOnboarding: false,
    });
    expect(await postResponse.json()).toEqual({
      session: { id: 'session-1', status: 'intake' },
    });
  });

  it('returns 404 without reading a profile when the session is not owned', async () => {
    mockResolveSession.mockResolvedValueOnce(null);

    const response = await getProfile(new NextRequest(
      'http://localhost/api/onboarding/profile?sessionId=other-session'
    ));

    expect(response.status).toBe(404);
    expect(mockProfile).not.toHaveBeenCalled();
  });

  it('returns only profile data attached to the resolved owned session', async () => {
    const response = await getProfile(new NextRequest(
      'http://localhost/api/onboarding/profile?sessionId=owned-session'
    ));

    expect(mockResolveSession).toHaveBeenCalledWith('owned-session');
    expect(await response.json()).toEqual({
      profile: { id: 'profile-1' },
      quick_intake: { org_name: 'Example Foundation' },
      conversation_state: { message_count: 0 },
    });
  });

  it('does not write intake data when the session is not owned', async () => {
    mockResolveSession.mockResolvedValueOnce(null);

    const response = await saveIntake(new NextRequest(
      'http://localhost/api/onboarding/intake',
      {
        method: 'POST',
        body: JSON.stringify({
          sessionId: '11111111-1111-4111-8111-111111111111',
          org_type: 'private_foundation',
          org_name: 'Example Foundation',
          org_size: 'small',
        }),
      }
    ));

    expect(response.status).toBe(404);
    expect(mockSaveIntake).not.toHaveBeenCalled();
  });

  it('writes validated intake through the owned session repository', async () => {
    const response = await saveIntake(new NextRequest(
      'http://localhost/api/onboarding/intake',
      {
        method: 'POST',
        body: JSON.stringify({
          sessionId: '11111111-1111-4111-8111-111111111111',
          org_type: 'private_foundation',
          org_name: 'Example Foundation',
          org_size: 'small',
        }),
      }
    ));

    expect(mockSaveIntake).toHaveBeenCalledWith(
      expect.objectContaining({ org_name: 'Example Foundation' }),
      [expect.objectContaining({ role: 'assistant' })]
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      success: true,
      sessionId: '11111111-1111-4111-8111-111111111111',
      status: 'conversation',
    });
  });
});
