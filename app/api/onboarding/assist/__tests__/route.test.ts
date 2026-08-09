import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextResponse } from 'next/server';

const { mockRequireUserAccess } = vi.hoisted(() => ({
  mockRequireUserAccess: vi.fn(),
}));

vi.mock('@/lib/ai/runtime', () => ({
  generateOnboardingText: vi.fn().mockResolvedValue({
    text: 'This is a helpful explanation.',
    response: {
      content: [{ type: 'text', text: 'This is a helpful explanation.' }],
      stopReason: null,
      model: 'test-model',
    },
  }),
}));

vi.mock('@/lib/api/access', () => ({
  requireUserAccess: mockRequireUserAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserAccess.mockResolvedValue({
    ok: true,
    context: {
      principal: { kind: 'user', userId: 'user-123' },
      user: { id: 'user-123' },
      db: {},
    },
  });
});

describe('POST /api/onboarding/assist', () => {
  it('requires authentication before parsing or generating', async () => {
    mockRequireUserAccess.mockResolvedValueOnce({
      ok: false,
      reason: 'unauthenticated',
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/onboarding/assist', {
      method: 'POST',
      body: JSON.stringify({ question: 'org_type_help', context: {} }),
    });

    const res = await POST(req as never);

    expect(res.status).toBe(401);
  });

  it('returns 400 if question type is unknown', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/onboarding/assist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: 'unknown_type', context: {} }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
  });

  it('returns 200 with answer for org_type_help', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/onboarding/assist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'org_type_help',
        context: { org_name: 'Thornwood Foundation' },
      }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.answer).toBe('string');
    expect(json.answer.length).toBeGreaterThan(0);
  });

  it('returns 200 with answer for module_help', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/onboarding/assist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'module_help',
        context: { org_name: 'Thornwood Foundation', org_type: 'private_foundation', module: 'compliance' },
      }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(typeof json.answer).toBe('string');
  });
});
