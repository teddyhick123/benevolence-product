// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  mockRequireOrgAccess,
  mockCreateOrgTaskRepository,
  mockList,
  mockCreate,
} = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(),
  mockCreateOrgTaskRepository: vi.fn(),
  mockList: vi.fn(),
  mockCreate: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/tasks', () => ({
  TaskRepositoryError: class TaskRepositoryError extends Error {},
  createOrgTaskRepository: mockCreateOrgTaskRepository,
}));

import { GET, POST } from '@/app/api/org/[orgId]/tasks/route';

const context = {
  orgId: 'org-1',
  role: 'member',
  principal: { kind: 'user', userId: 'user-1' },
  user: { id: 'user-1' },
  db: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgAccess.mockResolvedValue({ ok: true, context });
  mockCreateOrgTaskRepository.mockReturnValue({ list: mockList, create: mockCreate });
  mockList.mockResolvedValue([]);
  mockCreate.mockResolvedValue({ id: 'task-1', title: 'Follow up' });
});

describe('organization task routes', () => {
  it('returns a shared access denial before constructing elevated task access', async () => {
    mockRequireOrgAccess.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await POST(
      new NextRequest('http://localhost/api/org/org-1/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: 'Follow up' }),
      }),
      { params: Promise.resolve({ orgId: 'org-1' }) }
    );

    expect(response.status).toBe(403);
    expect(mockCreateOrgTaskRepository).not.toHaveBeenCalled();
  });

  it('constructs list access from the authorized org, role, and actor', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/org/org-1/tasks?tab=mine&limit=25'),
      { params: Promise.resolve({ orgId: 'org-1' }) }
    );

    expect(mockRequireOrgAccess).toHaveBeenCalledWith('org-1', 'viewer');
    expect(mockCreateOrgTaskRepository).toHaveBeenCalledWith({
      orgId: 'org-1',
      role: 'member',
      actorId: 'user-1',
    });
    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ tab: 'mine', limit: 25 }));
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('requires member access and passes validated creation input', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/org/org-1/tasks', {
        method: 'POST',
        body: JSON.stringify({ title: 'Follow up' }),
      }),
      { params: Promise.resolve({ orgId: 'org-1' }) }
    );

    expect(mockRequireOrgAccess).toHaveBeenCalledWith('org-1', 'member');
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ title: 'Follow up' }));
    expect(response.status).toBe(201);
  });
});
