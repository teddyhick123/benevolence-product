// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const {
  mockRequireOrgAccess,
  mockFrom,
  mockCreateNotificationPreferenceRepository,
  mockUpdateOwnPreferences,
} = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(),
  mockFrom: vi.fn(),
  mockCreateNotificationPreferenceRepository: vi.fn(),
  mockUpdateOwnPreferences: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/notifications', () => ({
  createNotificationPreferenceRepository: mockCreateNotificationPreferenceRepository,
}));

import { GET as listNotifications } from '@/app/api/org/[orgId]/notifications/route';
import { PATCH as markNotificationRead } from '@/app/api/org/[orgId]/notifications/[notificationId]/read/route';
import { POST as markAllNotificationsRead } from '@/app/api/org/[orgId]/notifications/mark-all-read/route';
import { PATCH as updateNotificationPreferences } from '@/app/api/org/[orgId]/members/[userId]/notifications/route';

const accessGranted = {
  ok: true,
  context: {
    orgId: 'org-1',
    role: 'viewer',
    user: { id: 'member-1' },
    principal: { kind: 'user', userId: 'member-1' },
    db: { from: mockFrom },
  },
};

const orgParams = { params: Promise.resolve({ orgId: 'org-1' }) };
const notificationParams = {
  params: Promise.resolve({ orgId: 'org-1', notificationId: 'notification-1' }),
};
const memberParams = {
  params: Promise.resolve({ orgId: 'org-1', userId: 'member-1' }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgAccess.mockResolvedValue(accessGranted);
  mockCreateNotificationPreferenceRepository.mockReturnValue({
    updateOwnPreferences: mockUpdateOwnPreferences,
  });
  mockUpdateOwnPreferences.mockResolvedValue({ digest: 'daily' });
});

describe('organization notification routes', () => {
  it('returns the shared denial before accessing the inbox', async () => {
    mockRequireOrgAccess.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await listNotifications(
      new NextRequest('http://localhost/api/org/org-1/notifications'),
      orgParams
    );

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('lists only the authenticated member inbox within the authorized org', async () => {
    const listQuery = stubQuery({
      data: [{
        id: 'notification-1',
        event_type: 'task_assigned',
        priority: 'normal',
        task_id: 'task-1',
        payload: { title: 'Review grant', body: 'Due today', href: '/tasks/task-1' },
        read_at: null,
        created_at: '2026-08-01T10:00:00.000Z',
        channel: 'in_app',
        status: 'sent',
      }],
      error: null,
    });
    const countQuery = stubQuery({ data: null, error: null, count: 1 } as never);
    mockFrom.mockReturnValueOnce(listQuery).mockReturnValueOnce(countQuery);

    const response = await listNotifications(
      new NextRequest('http://localhost/api/org/org-1/notifications?status=unread&limit=20'),
      orgParams
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({
      data: [{
        id: 'notification-1',
        event_type: 'task_assigned',
        priority: 'normal',
        task_id: 'task-1',
        title: 'Review grant',
        body: 'Due today',
        href: '/tasks/task-1',
        read_at: null,
        created_at: '2026-08-01T10:00:00.000Z',
      }],
      unread_count: 1,
      next_cursor: null,
    });
    for (const query of [listQuery, countQuery]) {
      expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
      expect(query.calls).toContainEqual({
        method: 'eq',
        args: ['recipient_user_id', 'member-1'],
      });
      expect(query.calls).toContainEqual({ method: 'eq', args: ['channel', 'in_app'] });
    }
    expect(listQuery.calls).toContainEqual({ method: 'limit', args: [21] });
  });

  it('rejects invalid list filters before querying notification data', async () => {
    const response = await listNotifications(
      new NextRequest('http://localhost/api/org/org-1/notifications?status=deleted'),
      orgParams
    );

    expect(response.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('marks one notification read inside the org and recipient scope', async () => {
    const updateQuery = stubQuery({ data: null, error: null });
    mockFrom.mockReturnValue(updateQuery);

    const response = await markNotificationRead(
      new NextRequest('http://localhost/api/org/org-1/notifications/notification-1/read', {
        method: 'PATCH',
      }),
      notificationParams
    );

    expect(response.status).toBe(200);
    expect(updateQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'notification-1'] });
    expect(updateQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(updateQuery.calls).toContainEqual({
      method: 'eq',
      args: ['recipient_user_id', 'member-1'],
    });
  });

  it('marks all unread in-app notifications inside the org and recipient scope', async () => {
    const updateQuery = stubQuery({ data: null, error: null });
    mockFrom.mockReturnValue(updateQuery);

    const response = await markAllNotificationsRead(
      new NextRequest('http://localhost/api/org/org-1/notifications/mark-all-read', {
        method: 'POST',
      }),
      orgParams
    );

    expect(response.status).toBe(200);
    expect(updateQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(updateQuery.calls).toContainEqual({
      method: 'eq',
      args: ['recipient_user_id', 'member-1'],
    });
    expect(updateQuery.calls).toContainEqual({ method: 'eq', args: ['channel', 'in_app'] });
  });

  it('updates preferences only for the authenticated member', async () => {
    const response = await updateNotificationPreferences(
      new NextRequest('http://localhost/api/org/org-1/members/member-1/notifications', {
        method: 'PATCH',
        body: JSON.stringify({ digest: 'daily' }),
      }),
      memberParams
    );

    expect(response.status).toBe(200);
    expect(mockCreateNotificationPreferenceRepository).toHaveBeenCalledWith(
      accessGranted.context
    );
    expect(mockUpdateOwnPreferences).toHaveBeenCalledWith({ digest: 'daily' });
    expect(await response.json()).toEqual({ notification_prefs: { digest: 'daily' } });
  });

  it('refuses to update another member preferences', async () => {
    const response = await updateNotificationPreferences(
      new NextRequest('http://localhost/api/org/org-1/members/member-2/notifications', {
        method: 'PATCH',
        body: JSON.stringify({ digest: 'never' }),
      }),
      { params: Promise.resolve({ orgId: 'org-1', userId: 'member-2' }) }
    );

    expect(response.status).toBe(403);
    expect(mockCreateNotificationPreferenceRepository).not.toHaveBeenCalled();
  });
});
