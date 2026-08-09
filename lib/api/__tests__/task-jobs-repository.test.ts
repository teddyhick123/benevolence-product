// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InvalidTaskJobPrincipalError,
  createTaskJobRepository,
  listOrgTaskRuns,
} from '@/lib/api/repositories/task-jobs';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const {
  mockCreateElevatedClient,
  mockFrom,
  mockRpc,
  mockRunProducers,
  mockRandomUUID,
} = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockRunProducers: vi.fn(),
  mockRandomUUID: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

vi.mock('@/lib/tasks/automation/run', () => ({
  runProducers: mockRunProducers,
}));

const db = { from: mockFrom, rpc: mockRpc };
const context = { principal: { kind: 'job' as const, job: 'tasks' } };

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue(db);
  mockRpc.mockResolvedValue({ data: true, error: null });
  mockRandomUUID.mockReturnValue('run-1');
  vi.spyOn(crypto, 'randomUUID').mockImplementation(mockRandomUUID);
});

describe('createTaskJobRepository', () => {
  it('rejects another job principal before constructing elevated access', () => {
    expect(() => createTaskJobRepository({
      principal: { kind: 'job', job: 'notifications' },
    })).toThrow(InvalidTaskJobPrincipalError);
    expect(mockCreateElevatedClient).not.toHaveBeenCalled();
  });

  it('scopes the concurrency check and reports an in-flight run', async () => {
    const inflightQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: 'existing-run' }, error: null } }
    );
    mockFrom.mockReturnValue(inflightQuery);

    const result = await createTaskJobRepository(context).generate({
      producer: 'pledge_follow_up',
      orgId: 'org-1',
      dryRun: false,
    });

    expect(mockRpc).toHaveBeenCalledWith('try_task_automation_lock', {
      lock_key: 'task_automation:pledge_follow_up:org-1',
    });
    expect(inflightQuery.calls).toContainEqual({
      method: 'eq',
      args: ['producer', 'pledge_follow_up'],
    });
    expect(inflightQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(result).toEqual({
      ok: false,
      status: 409,
      error: 'Concurrent run in progress',
      run_id: 'existing-run',
    });
    expect(mockRunProducers).not.toHaveBeenCalled();
  });

  it('records and completes a generated task run', async () => {
    const inflightQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    const insertQuery = stubQuery({ data: null, error: null });
    const updateQuery = stubQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(inflightQuery)
      .mockReturnValueOnce(insertQuery)
      .mockReturnValueOnce(updateQuery);
    mockRunProducers.mockResolvedValue([{
      producer: 'pledge_follow_up',
      orgId: 'org-1',
      scanned: 4,
      created: 2,
      updated: 1,
      completed: 1,
      skipped: 0,
      errors: [],
    }]);

    const result = await createTaskJobRepository(context).generate({
      producer: 'pledge_follow_up',
      orgId: 'org-1',
      sourceType: 'pledge',
      sourceId: 'pledge-1',
      dryRun: false,
      now: '2026-08-01T12:00:00.000Z',
    });

    expect(mockRunProducers).toHaveBeenCalledWith({
      producerId: 'pledge_follow_up',
      orgId: 'org-1',
      sourceType: 'pledge',
      sourceId: 'pledge-1',
      dryRun: false,
      now: new Date('2026-08-01T12:00:00.000Z'),
    });
    expect(insertQuery.calls).toContainEqual({
      method: 'insert',
      args: [{
        id: 'run-1',
        producer: 'pledge_follow_up',
        org_id: 'org-1',
        dry_run: false,
        status: 'running',
      }],
    });
    expect(updateQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'run-1'] });
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      status: 200,
      run_id: 'run-1',
    }));
  });

  it('does not start work when the advisory lock check errors', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'rpc unavailable' } });

    const result = await createTaskJobRepository(context).generate({ dryRun: false });

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockRunProducers).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      status: 500,
      error: 'Task automation lock unavailable: rpc unavailable',
    });
  });

  it('does not treat an unreadable concurrency scan as an idle queue', async () => {
    const inflightQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: { message: 'scan failed' } } }
    );
    mockFrom.mockReturnValue(inflightQuery);

    const result = await createTaskJobRepository(context).generate({ dryRun: false });

    expect(mockRunProducers).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      status: 500,
      error: 'Concurrency check failed: scan failed',
    });
  });

  it('does not start work when the run row cannot be recorded', async () => {
    const inflightQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    const insertQuery = stubQuery({ data: null, error: { message: 'insert failed' } });
    mockFrom.mockReturnValueOnce(inflightQuery).mockReturnValueOnce(insertQuery);

    const result = await createTaskJobRepository(context).generate({ dryRun: false });

    expect(mockRunProducers).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      status: 500,
      error: 'Task run could not be recorded: insert failed',
    });
  });

  it('reports an alertable failure when completed-run history cannot be persisted', async () => {
    const inflightQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    const insertQuery = stubQuery({ data: null, error: null });
    const updateQuery = stubQuery({ data: null, error: { message: 'update failed' } });
    mockFrom
      .mockReturnValueOnce(inflightQuery)
      .mockReturnValueOnce(insertQuery)
      .mockReturnValueOnce(updateQuery);
    mockRunProducers.mockResolvedValue([]);

    const result = await createTaskJobRepository(context).generate({ dryRun: false });

    expect(mockRunProducers).toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      status: 500,
      run_id: 'run-1',
      error: 'Task run completed but its history could not be persisted: update failed',
    });
  });

  it('keeps the producer failure as the cause when the failed-run write also fails', async () => {
    const inflightQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    const insertQuery = stubQuery({ data: null, error: null });
    const updateQuery = stubQuery({ data: null, error: { message: 'update failed' } });
    mockFrom
      .mockReturnValueOnce(inflightQuery)
      .mockReturnValueOnce(insertQuery)
      .mockReturnValueOnce(updateQuery);
    mockRunProducers.mockRejectedValue(new Error('producer exploded'));

    const result = await createTaskJobRepository(context).generate({ dryRun: false });

    expect(result).toEqual({
      ok: false,
      status: 500,
      run_id: 'run-1',
      error: 'producer exploded (run status could not be recorded: update failed)',
    });
  });

  it('skips run-history writes entirely on a dry run', async () => {
    const inflightQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    mockFrom.mockReturnValue(inflightQuery);
    mockRunProducers.mockResolvedValue([]);

    const result = await createTaskJobRepository(context).generate({ dryRun: true });

    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      ok: true,
      status: 200,
      run_id: null,
      results: [],
    });
  });

  it('applies optional filters to global run history', async () => {
    const query = stubQuery({ data: [], error: null });
    mockFrom.mockReturnValue(query);

    await createTaskJobRepository(context).listRuns({
      orgId: 'org-1',
      producer: 'import_review',
      limit: 25,
    });

    expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['producer', 'import_review'] });
    expect(query.calls).toContainEqual({ method: 'limit', args: [25] });
  });

  it('forces organization scope for session-backed run history', async () => {
    const query = stubQuery({ data: [], error: null });
    const sessionDb = { from: vi.fn(() => query) };

    await listOrgTaskRuns(sessionDb, 'org-1', { producer: undefined, limit: 50 });

    expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(query.calls).toContainEqual({ method: 'limit', args: [50] });
  });

  it('does not expose the elevated client or generic table access', () => {
    const repository = createTaskJobRepository(context);
    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });
});
