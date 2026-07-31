// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  mockRequireJobAccess,
  mockRequireOrgAccess,
  mockCreateTaskJobRepository,
  mockGenerate,
  mockListRuns,
  mockListOrgTaskRuns,
} = vi.hoisted(() => ({
  mockRequireJobAccess: vi.fn(),
  mockRequireOrgAccess: vi.fn(),
  mockCreateTaskJobRepository: vi.fn(),
  mockGenerate: vi.fn(),
  mockListRuns: vi.fn(),
  mockListOrgTaskRuns: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireJobAccess: mockRequireJobAccess,
  requireOrgAccess: mockRequireOrgAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/task-jobs', () => ({
  createTaskJobRepository: mockCreateTaskJobRepository,
  listOrgTaskRuns: mockListOrgTaskRuns,
}));

import { GET as generateGet, POST as generate } from '@/app/api/jobs/tasks/generate/route';
import { GET as listRuns } from '@/app/api/jobs/tasks/runs/route';

const jobContext = { principal: { kind: 'job', job: 'tasks' } };
const sessionDb = { from: vi.fn() };
const orgContext = {
  principal: { kind: 'user', userId: 'user-1' },
  user: { id: 'user-1' },
  db: sessionDb,
  orgId: 'org-1',
  role: 'admin',
};
const denied = {
  ok: false,
  response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
};

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireJobAccess.mockReturnValue({ ok: true, context: jobContext });
  mockRequireOrgAccess.mockResolvedValue({ ok: true, context: orgContext });
  mockCreateTaskJobRepository.mockReturnValue({
    generate: mockGenerate,
    listRuns: mockListRuns,
  });
  mockGenerate.mockResolvedValue({ ok: true, status: 200, run_id: 'run-1', results: [] });
  mockListRuns.mockResolvedValue({ data: [], error: null });
  mockListOrgTaskRuns.mockResolvedValue({ data: [], error: null });
});

describe('task job routes', () => {
  it('returns the shared denial before constructing the task worker', async () => {
    mockRequireJobAccess.mockReturnValueOnce(denied);
    const request = new NextRequest('http://localhost/api/jobs/tasks/generate', {
      method: 'POST',
      body: '{}',
    });

    const response = await generate(request);

    expect(response.status).toBe(401);
    expect(mockCreateTaskJobRepository).not.toHaveBeenCalled();
  });

  it('passes generation filters to a tasks-principal repository', async () => {
    const request = new NextRequest('http://localhost/api/jobs/tasks/generate', {
      method: 'POST',
      body: JSON.stringify({
        producer: 'pledge_follow_up',
        org_id: 'org-1',
        source_type: 'pledge',
        source_id: 'pledge-1',
        dry_run: true,
        now: '2026-08-01T12:00:00.000Z',
      }),
    });

    const response = await generate(request);

    expect(mockRequireJobAccess).toHaveBeenCalledWith(request, 'tasks');
    expect(mockCreateTaskJobRepository).toHaveBeenCalledWith(jobContext);
    expect(mockGenerate).toHaveBeenCalledWith({
      producer: 'pledge_follow_up',
      orgId: 'org-1',
      sourceType: 'pledge',
      sourceId: 'pledge-1',
      dryRun: true,
      now: '2026-08-01T12:00:00.000Z',
    });
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('accepts cron GET through the same job guard', async () => {
    const request = new NextRequest('http://localhost/api/jobs/tasks/generate', {
      headers: { authorization: 'Bearer cron-secret' },
    });

    const response = await generateGet(request);

    expect(mockRequireJobAccess).toHaveBeenCalledWith(request, 'tasks');
    expect(mockGenerate).toHaveBeenCalledWith(expect.objectContaining({ dryRun: false }));
    expect(response.status).toBe(200);
  });

  it('allows the task job to list global run history', async () => {
    const request = new NextRequest(
      'http://localhost/api/jobs/tasks/runs?producer=import_review&limit=25'
    );

    const response = await listRuns(request);

    expect(mockListRuns).toHaveBeenCalledWith({
      orgId: undefined,
      producer: 'import_review',
      limit: 25,
    });
    expect(mockRequireOrgAccess).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('uses an admin session and a forced organization filter without job access', async () => {
    mockRequireJobAccess.mockReturnValueOnce(denied);
    const request = new NextRequest(
      'http://localhost/api/jobs/tasks/runs?org_id=org-1&producer=pledge_follow_up'
    );

    const response = await listRuns(request);

    expect(mockRequireOrgAccess).toHaveBeenCalledWith('org-1', 'admin');
    expect(mockListOrgTaskRuns).toHaveBeenCalledWith(sessionDb, 'org-1', {
      producer: 'pledge_follow_up',
      limit: 50,
    });
    expect(mockCreateTaskJobRepository).not.toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('preserves the job denial when no organization fallback was requested', async () => {
    mockRequireJobAccess.mockReturnValueOnce(denied);

    const response = await listRuns(new NextRequest(
      'http://localhost/api/jobs/tasks/runs'
    ));

    expect(response.status).toBe(401);
    expect(mockRequireOrgAccess).not.toHaveBeenCalled();
  });
});
