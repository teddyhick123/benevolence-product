import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRpc = vi.fn();
const mockEq = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(() => ({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-123' } },
      }),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: mockEq.mockResolvedValue({ data: [], error: null }),
      })),
    })),
  })),
  createAdminClient: vi.fn(() => ({
    rpc: mockRpc,
    from: vi.fn(() => ({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { id: 'portfolio-123' }, error: null }),
        })),
      })),
    })),
  })),
}));

describe('POST /api/onboarding/provision — validation', () => {
  beforeEach(() => {
    mockRpc.mockResolvedValue({ data: 'org-123', error: null });
  });

  it('returns 400 if name is missing', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/onboarding/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ org_type: 'private_foundation' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/name/i);
  });

  it('returns 400 if org_type is invalid', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/onboarding/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Org', org_type: 'daf' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/org_type/i);
  });

  it('returns 201 with org_id and portfolio_id on success', async () => {
    const { POST } = await import('../route');
    const req = new Request('http://localhost/api/onboarding/provision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Thornwood Foundation', org_type: 'private_foundation' }),
    });
    const res = await POST(req as any);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.org_id).toBe('org-123');
    expect(json.portfolio_id).toBe('portfolio-123');
  });
});
