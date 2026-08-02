// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  mockRequireUserAccess,
  mockTranscribeAudio,
} = vi.hoisted(() => ({
  mockRequireUserAccess: vi.fn(),
  mockTranscribeAudio: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireUserAccess: mockRequireUserAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/rate-limit-response', () => ({
  aiAuthRequired: () => NextResponse.json({ error: 'Authentication required' }, { status: 401 }),
}));

vi.mock('@/lib/ai/transcription', () => ({
  transcribeAudio: mockTranscribeAudio,
}));

import { POST as transcribe } from '@/app/api/ai/transcribe/route';

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserAccess.mockResolvedValue({
    ok: true,
    context: {
      principal: { kind: 'user', userId: 'user-1' },
      user: { id: 'user-1' },
      db: {},
    },
  });
  mockTranscribeAudio.mockResolvedValue('Hello world');
});

describe('AI transcription route', () => {
  it('blocks anonymous transcription before invoking the AI provider', async () => {
    mockRequireUserAccess.mockResolvedValueOnce({
      ok: false,
      reason: 'unauthenticated',
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await transcribe(new NextRequest('http://localhost/api/ai/transcribe', {
      method: 'POST',
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Authentication required' });
    expect(mockTranscribeAudio).not.toHaveBeenCalled();
  });
});
