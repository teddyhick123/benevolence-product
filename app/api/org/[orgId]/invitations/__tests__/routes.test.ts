// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const { mockRequireOrgAccess, mockCreateRepository, mockList, mockCreate } = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(), mockCreateRepository: vi.fn(), mockList: vi.fn(), mockCreate: vi.fn(),
}));
vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));
vi.mock('@/lib/api/repositories/invitations', () => ({
  InvitationRepositoryError: class InvitationRepositoryError extends Error {},
  createInvitationRepository: mockCreateRepository,
}));
import { GET, POST } from '@/app/api/org/[orgId]/invitations/route';

const context = { orgId: 'org-1', role: 'admin', principal: { kind: 'user', userId: 'actor-1' }, user: { id: 'actor-1' }, db: {} };
beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgAccess.mockResolvedValue({ ok: true, context });
  mockCreateRepository.mockReturnValue({ list: mockList, create: mockCreate });
  mockList.mockResolvedValue([]);
  mockCreate.mockResolvedValue({ invitation: { id: 'invite-1' }, created: true });
});

describe('organization invitation routes', () => {
  it('denies before constructing elevated invitation access', async () => {
    mockRequireOrgAccess.mockResolvedValueOnce({ ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) });
    const response = await GET(new NextRequest('http://localhost/api/org/org-1/invitations'), { params: Promise.resolve({ orgId: 'org-1' }) });
    expect(response.status).toBe(403);
    expect(mockCreateRepository).not.toHaveBeenCalled();
  });

  it('constructs listing from the guarded org, role, and actor', async () => {
    const response = await GET(new NextRequest('http://localhost/api/org/org-1/invitations'), { params: Promise.resolve({ orgId: 'org-1' }) });
    expect(mockRequireOrgAccess).toHaveBeenCalledWith('org-1', 'admin');
    expect(mockCreateRepository).toHaveBeenCalledWith({ orgId: 'org-1', role: 'admin', actorId: 'actor-1' });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('passes validated invitation input and returns 201 for a new invitation', async () => {
    const response = await POST(new NextRequest('http://localhost/api/org/org-1/invitations', {
      method: 'POST', body: JSON.stringify({ email: 'person@example.com', role: 'member' }),
    }), { params: Promise.resolve({ orgId: 'org-1' }) });
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ email: 'person@example.com', role: 'member' }));
    expect(response.status).toBe(201);
  });
});
