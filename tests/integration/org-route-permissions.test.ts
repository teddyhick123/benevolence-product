import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
let currentRole: string | null = 'owner';
const mockFrom = vi.fn();

vi.mock('@/lib/api/access', () => ({
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
  requireOrgAccess: vi.fn(async (_orgId: string, minRole = 'viewer') => {
    const rank: Record<string, number> = { viewer: 0, member: 1, admin: 2, owner: 3 };
    if (!currentRole || rank[currentRole] < rank[minRole]) {
      return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
    }
    return {
      ok: true,
      context: {
        db: { from: mockFrom },
        user: { id: 'user-1' },
        role: currentRole,
      },
    };
  }),
}));

import { DELETE } from '@/app/api/org/[orgId]/route';

function params() {
  return { params: Promise.resolve({ orgId: ORG_ID }) } as any;
}

beforeEach(() => {
  currentRole = 'owner';
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
