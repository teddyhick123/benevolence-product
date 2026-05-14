import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/ai/factory', () => ({
  createAIProvider: vi.fn(() => ({
    createMessage: vi.fn().mockResolvedValue({
      content: [{ type: 'text', text: 'This is a helpful explanation.' }],
      stopReason: null,
      model: 'test-model',
    }),
  })),
}));

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
      }),
    },
  })),
}));

beforeEach(() => {
  process.env.AI_PROVIDER = 'test';
});

describe('POST /api/onboarding/assist', () => {
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
