// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  mockRequireInvitationToken,
  mockRequireUserAccess,
  mockOrganizationName,
  mockMarkExpired,
  mockAccept,
} = vi.hoisted(() => ({
  mockRequireInvitationToken: vi.fn(),
  mockRequireUserAccess: vi.fn(),
  mockOrganizationName: vi.fn(),
  mockMarkExpired: vi.fn(),
  mockAccept: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireInvitationToken: mockRequireInvitationToken,
  requireUserAccess: mockRequireUserAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

import { GET } from '@/app/api/invitations/[token]/route';
import { POST } from '@/app/api/invitations/[token]/accept/route';

const invitationContext = {
  principal: { kind: 'invitation', invitationId: 'invite-1' },
  orgId: 'org-1',
  email: 'invitee@example.test',
  role: 'member',
  status: 'pending',
  expiresAt: '2999-01-01T00:00:00.000Z',
  repository: {
    organizationName: mockOrganizationName,
    markExpired: mockMarkExpired,
    accept: mockAccept,
  },
};

const userContext = {
  principal: { kind: 'user', userId: 'user-1' },
  user: { id: 'user-1', email: 'invitee@example.test' },
  db: {},
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireInvitationToken.mockResolvedValue({ ok: true, context: invitationContext });
  mockRequireUserAccess.mockResolvedValue({ ok: true, context: userContext });
  mockOrganizationName.mockResolvedValue('Example Foundation');
  mockAccept.mockResolvedValue('org-1');
});

describe('public invitation routes', () => {
  it('preserves the public not-found validation response', async () => {
    mockRequireInvitationToken.mockResolvedValueOnce({
      ok: false,
      reason: 'not_found',
      response: NextResponse.json({ error: 'Invitation not found' }, { status: 404 }),
    });

    const response = await GET(
      new NextRequest('http://localhost/api/invitations/missing'),
      { params: Promise.resolve({ token: 'missing' }) }
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ valid: false, reason: 'not_found' });
  });

  it('returns only the token-scoped invitation and organization name', async () => {
    const response = await GET(
      new NextRequest('http://localhost/api/invitations/raw-token'),
      { params: Promise.resolve({ token: 'raw-token' }) }
    );

    expect(mockRequireInvitationToken).toHaveBeenCalledWith('raw-token');
    expect(mockOrganizationName).toHaveBeenCalledOnce();
    expect(await response.json()).toEqual({
      valid: true,
      invitation: {
        id: 'invite-1',
        email: 'invitee@example.test',
        role: 'member',
        orgName: 'Example Foundation',
      },
    });
  });

  it('requires user authentication before resolving an invitation for acceptance', async () => {
    mockRequireUserAccess.mockResolvedValueOnce({
      ok: false,
      reason: 'unauthenticated',
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await POST(
      new NextRequest('http://localhost/api/invitations/raw-token/accept', { method: 'POST' }),
      { params: Promise.resolve({ token: 'raw-token' }) }
    );

    expect(response.status).toBe(401);
    expect(mockRequireInvitationToken).not.toHaveBeenCalled();
  });

  it('rejects an authenticated user whose email does not match the invitation', async () => {
    mockRequireUserAccess.mockResolvedValueOnce({
      ok: true,
      context: {
        ...userContext,
        user: { id: 'user-1', email: 'other@example.test' },
      },
    });

    const response = await POST(
      new NextRequest('http://localhost/api/invitations/raw-token/accept', { method: 'POST' }),
      { params: Promise.resolve({ token: 'raw-token' }) }
    );

    expect(response.status).toBe(403);
    expect(mockAccept).not.toHaveBeenCalled();
  });

  it('accepts through the scoped repository for the matching signed-in user', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/invitations/raw-token/accept', { method: 'POST' }),
      { params: Promise.resolve({ token: 'raw-token' }) }
    );

    expect(mockAccept).toHaveBeenCalledWith('user-1');
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ success: true, orgId: 'org-1' });
  });
});
