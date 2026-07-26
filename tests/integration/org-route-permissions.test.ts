import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
let currentRole: string | null = 'owner';
const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(async () => ({
    rpc: mockRpc,
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } } })) },
    from: mockFrom,
  })),
}));

import { DELETE } from '@/app/api/org/[orgId]/route';

function params() {
  return { params: Promise.resolve({ orgId: ORG_ID }) } as any;
}

beforeEach(() => {
  currentRole = 'owner';
  mockRpc.mockResolvedValue({ data: currentRole, error: null });
  mockFrom.mockImplementation(() => {
    const query: any = {
      update: vi.fn(() => query),
      eq: vi.fn(() => query),
      is: vi.fn(() => query),
      select: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: { id: ORG_ID }, error: null })),
    };
    return query;
  });
});

describe('DELETE /api/org/[orgId]', () => {
  it('rejects an admin before attempting an organization deletion', async () => {
    currentRole = 'admin';
    mockRpc.mockResolvedValue({ data: currentRole, error: null });

    const response = await DELETE(new NextRequest(`http://localhost/api/org/${ORG_ID}`, { method: 'DELETE' }), params());

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('allows an owner to soft-delete the organization', async () => {
    const response = await DELETE(new NextRequest(`http://localhost/api/org/${ORG_ID}`, { method: 'DELETE' }), params());

    expect(response.status).toBe(204);
    expect(mockFrom).toHaveBeenCalledWith('organizations');
  });
});
// Integration test.
