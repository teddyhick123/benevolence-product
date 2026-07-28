// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const ORG_ID = '11111111-1111-1111-1111-111111111111';

const { mockRequireOrgAccess, mockFrom } = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
}));

import {
  GET,
  POST,
} from '@/app/api/org/[orgId]/compliance/state-registrations/route';

function params() {
  return { params: Promise.resolve({ orgId: ORG_ID }) } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgAccess.mockResolvedValue({
    ok: true,
    context: {
      orgId: ORG_ID,
      user: { id: 'user-1' },
      db: { from: mockFrom },
    },
  });
});

describe('state registration tenant scope', () => {
  it('scopes list queries to the organization in the authorized context', async () => {
    const query = stubQuery({ data: [], error: null });
    mockFrom.mockReturnValue(query);
    const request = new NextRequest(
      `http://localhost/api/org/${ORG_ID}/compliance/state-registrations`
    );

    const response = await GET(request, params());

    expect(response.status).toBe(200);
    expect(mockRequireOrgAccess).toHaveBeenCalledWith(ORG_ID, 'viewer');
    expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', ORG_ID] });
  });

  it('rejects a caller-supplied org ID instead of allowing a cross-org upsert', async () => {
    const request = new NextRequest(
      `http://localhost/api/org/${ORG_ID}/compliance/state-registrations`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_id: '22222222-2222-2222-2222-222222222222',
          state: 'CA',
        }),
      }
    );

    const response = await POST(request, params());

    expect(response.status).toBe(400);
    expect(mockRequireOrgAccess).toHaveBeenCalledWith(ORG_ID, 'admin');
    expect(mockFrom).not.toHaveBeenCalled();
  });
});
