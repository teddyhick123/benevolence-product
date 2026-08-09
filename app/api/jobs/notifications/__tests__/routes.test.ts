// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  mockRequireJobAccess,
  mockCreateNotificationJobRepository,
  mockFanout,
  mockDeliver,
  mockDigest,
} = vi.hoisted(() => ({
  mockRequireJobAccess: vi.fn(),
  mockCreateNotificationJobRepository: vi.fn(),
  mockFanout: vi.fn(),
  mockDeliver: vi.fn(),
  mockDigest: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireJobAccess: mockRequireJobAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/notification-jobs', () => ({
  createNotificationJobRepository: mockCreateNotificationJobRepository,
}));

import { POST as fanout } from '@/app/api/jobs/notifications/fanout/route';
import { POST as deliver } from '@/app/api/jobs/notifications/send/route';
import { GET as digestGet, POST as digest } from '@/app/api/jobs/notifications/digest/route';

const context = { principal: { kind: 'job', job: 'notifications' } };

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireJobAccess.mockReturnValue({ ok: true, context });
  mockCreateNotificationJobRepository.mockReturnValue({
    fanout: mockFanout,
    deliver: mockDeliver,
    digest: mockDigest,
  });
  mockFanout.mockResolvedValue({ ok: true, scanned: 0, created: 0, suppressed: 0, errors: [] });
  mockDeliver.mockResolvedValue({ ok: true, scanned: 0, sent: 0, suppressed: 0, failed: 0, errors: [] });
  mockDigest.mockResolvedValue({ ok: true, orgs_processed: 0, sent: 0, skipped: 0, errors: [] });
});

describe('notification job routes', () => {
  it.each([
    ['fanout', fanout],
    ['delivery', deliver],
    ['digest', digest],
  ])('returns the shared denial before constructing the %s worker', async (_name, handler) => {
    mockRequireJobAccess.mockReturnValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await handler(new NextRequest('http://localhost/api/jobs/notifications', {
      method: 'POST',
      body: '{}',
    }));

    expect(response.status).toBe(401);
    expect(mockCreateNotificationJobRepository).not.toHaveBeenCalled();
  });

  it('passes fanout filters to a notifications-principal repository', async () => {
    const request = new NextRequest('http://localhost/api/jobs/notifications/fanout', {
      method: 'POST',
      body: JSON.stringify({
        dry_run: true,
        now: '2026-08-01T12:00:00.000Z',
        since: '2026-08-01T00:00:00.000Z',
        task_event_id: 'event-1',
      }),
    });

    const response = await fanout(request);

    expect(mockRequireJobAccess).toHaveBeenCalledWith(request, 'notifications');
    expect(mockCreateNotificationJobRepository).toHaveBeenCalledWith(context);
    expect(mockFanout).toHaveBeenCalledWith({
      dryRun: true,
      now: '2026-08-01T12:00:00.000Z',
      since: '2026-08-01T00:00:00.000Z',
      taskEventId: 'event-1',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('preserves a worker failure response and status', async () => {
    mockDeliver.mockResolvedValueOnce({
      ok: false,
      error: 'database unavailable',
      scanned: 0,
      sent: 0,
      suppressed: 0,
      failed: 0,
      errors: [],
    });

    const response = await deliver(new NextRequest(
      'http://localhost/api/jobs/notifications/send',
      { method: 'POST', body: '{}' }
    ));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(expect.objectContaining({
      ok: false,
      error: 'database unavailable',
    }));
  });

  it('surfaces a delivery scan failure as a 500 with no counted work', async () => {
    mockDeliver.mockResolvedValueOnce({
      ok: false,
      error: 'pending scan failed',
      scanned: 0,
      sent: 0,
      suppressed: 0,
      failed: 0,
      errors: [],
    });

    const response = await deliver(new NextRequest(
      'http://localhost/api/jobs/notifications/send',
      { method: 'POST', body: '{}' }
    ));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual(expect.objectContaining({
      ok: false,
      error: 'pending scan failed',
      scanned: 0,
      sent: 0,
    }));
  });

  it('accepts the digest cron GET through the same job guard', async () => {
    const request = new NextRequest('http://localhost/api/jobs/notifications/digest', {
      headers: { authorization: 'Bearer cron-secret' },
    });

    const response = await digestGet(request);

    expect(mockRequireJobAccess).toHaveBeenCalledWith(request, 'notifications');
    expect(mockDigest).toHaveBeenCalledWith({
      dryRun: false,
      orgId: undefined,
      now: undefined,
      since: undefined,
    });
    expect(response.status).toBe(200);
  });
});
