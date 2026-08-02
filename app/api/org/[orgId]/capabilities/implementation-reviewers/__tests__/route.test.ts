// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  mockRequireUserAccess,
  mockCreateRepository,
  mockList,
  mockGrant,
  mockRevoke,
  mockRpc,
} = vi.hoisted(() => ({
  mockRequireUserAccess: vi.fn(),
  mockCreateRepository: vi.fn(),
  mockList: vi.fn(),
  mockGrant: vi.fn(),
  mockRevoke: vi.fn(),
  mockRpc: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireUserAccess: mockRequireUserAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/implementation-reviewers', () => ({
  ImplementationReviewerRepositoryError: class ImplementationReviewerRepositoryError extends Error {},
  createImplementationReviewerRepository: mockCreateRepository,
}));

import { GET, POST } from '@/app/api/org/[orgId]/capabilities/implementation-reviewers/route';

const context = {
  principal: { kind: 'user', userId: 'actor-1' },
  user: { id: 'actor-1' },
  db: { rpc: mockRpc },
};

function actor(role: string | null, isAppAdmin = false) {
  mockRpc.mockImplementation(async (name: string) => ({
    data: name === 'user_org_role' ? role : isAppAdmin,
    error: null,
  }));
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireUserAccess.mockResolvedValue({ ok: true, context });
  mockCreateRepository.mockReturnValue({ list: mockList, grant: mockGrant, revoke: mockRevoke });
  mockList.mockResolvedValue([]);
  mockGrant.mockResolvedValue([]);
  mockRevoke.mockResolvedValue([]);
  actor('owner');
});

describe('implementation reviewer capability route', () => {
  it('denies before constructing elevated capability access', async () => {
    mockRequireUserAccess.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await GET(
      new NextRequest('http://localhost/api/org/org-1/capabilities/implementation-reviewers'),
      { params: Promise.resolve({ orgId: 'org-1' }) }
    );

    expect(response.status).toBe(401);
    expect(mockCreateRepository).not.toHaveBeenCalled();
  });

  it('lists the guarded org for an organization admin', async () => {
    actor('admin');
    const response = await GET(
      new NextRequest('http://localhost/api/org/org-1/capabilities/implementation-reviewers'),
      { params: Promise.resolve({ orgId: 'org-1' }) }
    );

    expect(mockCreateRepository).toHaveBeenCalledWith({ orgId: 'org-1', actorId: 'actor-1' });
    expect(mockList).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({ reviewers: [], canManage: false });
  });

  it('preserves cross-org support access for app admins', async () => {
    actor(null, true);
    const response = await GET(
      new NextRequest('http://localhost/api/org/org-1/capabilities/implementation-reviewers'),
      { params: Promise.resolve({ orgId: 'org-1' }) }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reviewers: [], canManage: true });
  });

  it('allows only an owner or app admin to grant the capability', async () => {
    actor('admin');
    const denied = await POST(
      new NextRequest('http://localhost/api/org/org-1/capabilities/implementation-reviewers', {
        method: 'POST',
        body: JSON.stringify({ user_id: 'target-1' }),
      }),
      { params: Promise.resolve({ orgId: 'org-1' }) }
    );
    expect(denied.status).toBe(403);
    expect(mockGrant).not.toHaveBeenCalled();

    actor('owner');
    const allowed = await POST(
      new NextRequest('http://localhost/api/org/org-1/capabilities/implementation-reviewers', {
        method: 'POST',
        body: JSON.stringify({ user_id: 'target-1' }),
      }),
      { params: Promise.resolve({ orgId: 'org-1' }) }
    );
    expect(allowed.status).toBe(200);
    expect(mockGrant).toHaveBeenCalledWith('target-1');
  });
});
