// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InvalidNotificationJobPrincipalError,
  createNotificationJobRepository,
} from '@/lib/api/repositories/notification-jobs';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const {
  mockCreateElevatedClient,
  mockFrom,
  mockFanOutTaskEvent,
  mockDeliverEmailNotification,
  mockRunDigestForOrg,
} = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockFanOutTaskEvent: vi.fn(),
  mockDeliverEmailNotification: vi.fn(),
  mockRunDigestForOrg: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

vi.mock('@/lib/notifications/fanout', () => ({
  fanOutTaskEvent: mockFanOutTaskEvent,
}));

vi.mock('@/lib/notifications/delivery', () => ({
  deliverEmailNotification: mockDeliverEmailNotification,
}));

vi.mock('@/lib/notifications/digest', () => ({
  runDigestForOrg: mockRunDigestForOrg,
}));

const db = { from: mockFrom };
const context = { principal: { kind: 'job' as const, job: 'notifications' } };

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue(db);
});

describe('createNotificationJobRepository', () => {
  it('rejects another job principal before constructing elevated access', () => {
    expect(() => createNotificationJobRepository({
      principal: { kind: 'job', job: 'imports' },
    })).toThrow(InvalidNotificationJobPrincipalError);
    expect(mockCreateElevatedClient).not.toHaveBeenCalled();
  });

  it('fans out only matching, not-yet-processed task events', async () => {
    const eventQuery = stubQuery({
      data: [{ id: 'event-1' }, { id: 'event-2' }],
      error: null,
    });
    const completedQuery = stubQuery({
      data: [{ task_event_id: 'event-1' }],
      error: null,
    });
    mockFrom.mockReturnValueOnce(eventQuery).mockReturnValueOnce(completedQuery);
    mockFanOutTaskEvent.mockResolvedValue({ created: 2, suppressed: 1 });

    const result = await createNotificationJobRepository(context).fanout({
      dryRun: false,
      since: '2026-08-01T00:00:00.000Z',
      now: '2026-08-02T00:00:00.000Z',
      taskEventId: 'event-2',
    });

    expect(eventQuery.calls).toContainEqual({
      method: 'gte',
      args: ['created_at', '2026-08-01T00:00:00.000Z'],
    });
    expect(eventQuery.calls).toContainEqual({
      method: 'lte',
      args: ['created_at', '2026-08-02T00:00:00.000Z'],
    });
    expect(eventQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'event-2'] });
    expect(completedQuery.calls).toContainEqual({
      method: 'in',
      args: ['task_event_id', ['event-1', 'event-2']],
    });
    expect(mockFanOutTaskEvent).toHaveBeenCalledWith(db, {
      taskEventId: 'event-2',
      now: '2026-08-02T00:00:00.000Z',
    });
    expect(result).toEqual({
      ok: true,
      scanned: 2,
      created: 2,
      suppressed: 1,
      errors: [],
    });
  });

  it('fails the run rather than re-fanning-out when the completed-event scan errors', async () => {
    const eventQuery = stubQuery({ data: [{ id: 'event-1' }], error: null });
    const completedQuery = stubQuery({
      data: null,
      error: { message: 'completed scan failed' },
    });
    mockFrom.mockReturnValueOnce(eventQuery).mockReturnValueOnce(completedQuery);

    const result = await createNotificationJobRepository(context).fanout({ dryRun: false });

    expect(mockFanOutTaskEvent).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: 'completed scan failed',
      scanned: 1,
      created: 0,
      suppressed: 0,
      errors: [],
    });
  });

  it('delivers only scheduled email notifications in pending or retry state', async () => {
    const pendingQuery = stubQuery({ data: [{ id: 'notification-1' }], error: null });
    const retryQuery = stubQuery({ data: [{ id: 'notification-2' }], error: null });
    mockFrom.mockReturnValueOnce(pendingQuery).mockReturnValueOnce(retryQuery);
    mockDeliverEmailNotification
      .mockResolvedValueOnce('sent')
      .mockResolvedValueOnce('failed');

    const result = await createNotificationJobRepository(context).deliver({ dryRun: false });

    for (const query of [pendingQuery, retryQuery]) {
      expect(query.calls).toContainEqual({ method: 'eq', args: ['channel', 'email'] });
      expect(query.calls).toContainEqual({ method: 'limit', args: [200] });
    }
    expect(pendingQuery.calls).toContainEqual({ method: 'eq', args: ['status', 'pending'] });
    expect(retryQuery.calls).toContainEqual({ method: 'eq', args: ['status', 'failed'] });
    expect(mockDeliverEmailNotification).toHaveBeenNthCalledWith(
      1,
      db,
      'notification-1',
      false
    );
    expect(result).toEqual({
      ok: true,
      scanned: 2,
      sent: 1,
      suppressed: 0,
      failed: 1,
      errors: [{
        notificationId: 'notification-2',
        message: 'delivery failed — see logs',
      }],
    });
  });

  it('fails the run without delivering when the pending scan errors', async () => {
    const pendingQuery = stubQuery({ data: null, error: { message: 'pending scan failed' } });
    const retryQuery = stubQuery({ data: [{ id: 'notification-2' }], error: null });
    mockFrom.mockReturnValueOnce(pendingQuery).mockReturnValueOnce(retryQuery);

    const result = await createNotificationJobRepository(context).deliver({ dryRun: false });

    expect(mockDeliverEmailNotification).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: 'pending scan failed',
      scanned: 0,
      sent: 0,
      suppressed: 0,
      failed: 0,
      errors: [],
    });
  });

  it('fails the run without delivering when the retry scan errors', async () => {
    const pendingQuery = stubQuery({ data: [{ id: 'notification-1' }], error: null });
    const retryQuery = stubQuery({ data: null, error: { message: 'retry scan failed' } });
    mockFrom.mockReturnValueOnce(pendingQuery).mockReturnValueOnce(retryQuery);

    const result = await createNotificationJobRepository(context).deliver({ dryRun: false });

    expect(mockDeliverEmailNotification).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      error: 'retry scan failed',
      scanned: 0,
      sent: 0,
      suppressed: 0,
      failed: 0,
      errors: [],
    });
  });

  it('reports a successful empty scan rather than a failure', async () => {
    const pendingQuery = stubQuery({ data: [], error: null });
    const retryQuery = stubQuery({ data: [], error: null });
    mockFrom.mockReturnValueOnce(pendingQuery).mockReturnValueOnce(retryQuery);

    const result = await createNotificationJobRepository(context).deliver({ dryRun: false });

    expect(mockDeliverEmailNotification).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      scanned: 0,
      sent: 0,
      suppressed: 0,
      failed: 0,
      errors: [],
    });
  });

  it('suppresses rather than delivers scanned notifications on a dry run', async () => {
    const pendingQuery = stubQuery({ data: [{ id: 'notification-1' }], error: null });
    const retryQuery = stubQuery({ data: [{ id: 'notification-2' }], error: null });
    mockFrom.mockReturnValueOnce(pendingQuery).mockReturnValueOnce(retryQuery);

    const result = await createNotificationJobRepository(context).deliver({ dryRun: true });

    expect(mockDeliverEmailNotification).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      scanned: 2,
      sent: 0,
      suppressed: 2,
      failed: 0,
      errors: [],
    });
  });

  it('limits a digest run to the requested organization', async () => {
    const organizationsQuery = stubQuery({ data: [{ id: 'org-1' }], error: null });
    mockFrom.mockReturnValue(organizationsQuery);
    mockRunDigestForOrg.mockResolvedValue({ sent: 2, skipped: 1, errors: [] });

    const result = await createNotificationJobRepository(context).digest({
      dryRun: true,
      orgId: 'org-1',
      since: '2026-07-25T00:00:00.000Z',
      now: '2026-08-01T00:00:00.000Z',
    });

    expect(organizationsQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'org-1'] });
    expect(mockRunDigestForOrg).toHaveBeenCalledWith(
      db,
      'org-1',
      '2026-07-25T00:00:00.000Z',
      '2026-08-01T00:00:00.000Z',
      true
    );
    expect(result).toEqual({
      ok: true,
      orgs_processed: 1,
      sent: 2,
      skipped: 1,
      errors: [],
    });
  });

  it('does not expose the elevated client or generic table access', () => {
    const repository = createNotificationJobRepository(context);
    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });
});
