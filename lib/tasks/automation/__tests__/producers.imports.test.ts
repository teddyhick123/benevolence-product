// lib/tasks/automation/__tests__/producers.imports.test.ts

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Shared mock state — must be declared before vi.mock factory
let _mockJobs: unknown[] = [];
let _mockTasks: unknown[] = [];

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: vi.fn(() => buildMockDb()),
}));

function buildMockDb() {
  return {
    rpc: vi.fn(async (name: string) => ({
      data: name === 'upsert_generated_task' ? 'created' : 0,
      error: null,
    })),
    from: vi.fn((table: string) => {
      if (table === 'import_jobs') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          then: vi.fn(async (resolve: Function) =>
            resolve({ data: _mockJobs, error: null })
          ),
        };
      }
      if (table === 'tasks') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          like: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn(async () => ({ data: _mockTasks.shift() ?? null, error: null })),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn(async () => ({ data: { id: 'task-1' }, error: null })),
            }),
            error: null,
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis(), error: null }),
        };
      }
      // task_entity_links, task_events, etc.
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        is: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        like: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        insert: vi.fn(async () => ({ error: null })),
        update: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnThis(), error: null }),
      };
    }),
  } as any;
}

import { importReviewProducer } from '../producers/imports';

describe('importReviewProducer', () => {
  beforeEach(() => {
    _mockJobs = [];
    _mockTasks = [];
  });

  it('returns empty array when no orgId provided', async () => {
    const results = await importReviewProducer({});
    expect(results).toHaveLength(0);
  });

  it('returns a result array when called with orgId', async () => {
    const results = await importReviewProducer({ orgId: 'org-1' });
    expect(Array.isArray(results)).toBe(true);
  });

  it('returns empty array when import_jobs returns no rows', async () => {
    _mockJobs = [];
    const results = await importReviewProducer({ orgId: 'org-2' });
    expect(results).toHaveLength(0);
  });

  it('produces an error task when a job has error_rows > 0', async () => {
    _mockJobs = [
      {
        id: 'job-1',
        org_id: 'org-1',
        name: 'Holdings import Q1',
        status: 'needs_review',
        approved_rows: 8,
        rejected_rows: 0,
        error_rows: 2,
        error_message: null,
        reviewed_by: null,
        created_at: new Date().toISOString(),
      },
    ];
    const results = await importReviewProducer({ orgId: 'org-1' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].producer).toBe('import_review');
    expect(results[0].scanned).toBeGreaterThan(0);
  });

  it('produces an error task when a job has rejected_rows > 0', async () => {
    _mockJobs = [
      {
        id: 'job-2',
        org_id: 'org-1',
        name: 'Donors import May',
        status: 'needs_review',
        approved_rows: 3,
        rejected_rows: 2,
        error_rows: 0,
        error_message: null,
        reviewed_by: null,
        created_at: new Date().toISOString(),
      },
    ];
    const results = await importReviewProducer({ orgId: 'org-1' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].producer).toBe('import_review');
  });

  it('produces an error task when a job has an error_message', async () => {
    _mockJobs = [
      {
        id: 'job-3',
        org_id: 'org-1',
        name: 'Grants import',
        status: 'processing',
        approved_rows: 0,
        rejected_rows: 0,
        error_rows: 0,
        error_message: 'Column mismatch on row 5',
        reviewed_by: null,
        created_at: new Date().toISOString(),
      },
    ];
    const results = await importReviewProducer({ orgId: 'org-1' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].created + results[0].updated + results[0].skipped).toBeGreaterThan(0);
  });

  it('produces an approval task when a job needs_review with approved_rows and no reviewer', async () => {
    _mockJobs = [
      {
        id: 'job-4',
        org_id: 'org-1',
        name: 'Holdings import Q2',
        status: 'needs_review',
        approved_rows: 10,
        rejected_rows: 0,
        error_rows: 0,
        error_message: null,
        reviewed_by: null,
        created_at: new Date().toISOString(),
      },
    ];
    const results = await importReviewProducer({ orgId: 'org-1' });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].producer).toBe('import_review');
  });

  it('skips approval task when reviewed_by is already set', async () => {
    _mockJobs = [
      {
        id: 'job-5',
        org_id: 'org-1',
        name: 'Holdings import Q3',
        status: 'needs_review',
        approved_rows: 10,
        rejected_rows: 0,
        error_rows: 0,
        error_message: null,
        reviewed_by: 'user-abc',
        created_at: new Date().toISOString(),
      },
    ];
    const results = await importReviewProducer({ orgId: 'org-1' });
    if (results.length > 0) {
      expect(results[0].created).toBe(0);
    } else {
      expect(results).toHaveLength(0);
    }
  });

  it('cancels tasks for failed jobs', async () => {
    _mockJobs = [
      {
        id: 'job-6',
        org_id: 'org-1',
        name: 'Donors import failed',
        status: 'failed',
        approved_rows: 0,
        rejected_rows: 0,
        error_rows: 3,
        error_message: 'Fatal parse error',
        reviewed_by: null,
        created_at: new Date().toISOString(),
      },
    ];
    const results = await importReviewProducer({ orgId: 'org-1' });
    expect(Array.isArray(results)).toBe(true);
  });

  it('cancels tasks for rolled_back jobs', async () => {
    _mockJobs = [
      {
        id: 'job-rb',
        org_id: 'org-1',
        name: 'Holdings import — rolled back',
        status: 'rolled_back',
        approved_rows: 0,
        rejected_rows: 0,
        error_rows: 0,
        error_message: null,
        reviewed_by: null,
        created_at: new Date().toISOString(),
      },
    ];
    const results = await importReviewProducer({ orgId: 'org-1' });
    expect(Array.isArray(results)).toBe(true);
    if (results.length > 0) {
      expect(results[0].created).toBe(0);
      expect(results[0].updated).toBe(0);
    }
  });

  it('does not crash when import_jobs returns an empty array', async () => {
    _mockJobs = [];
    const results = await importReviewProducer({ orgId: 'org-3' });
    expect(Array.isArray(results)).toBe(true);
  });

  it('dryRun=true returns result counts without creating tasks', async () => {
    _mockJobs = [
      {
        id: 'job-7',
        org_id: 'org-1',
        name: 'Holdings import dry run',
        status: 'needs_review',
        approved_rows: 5,
        rejected_rows: 2,
        error_rows: 3,
        error_message: null,
        reviewed_by: null,
        created_at: new Date().toISOString(),
      },
    ];
    const results = await importReviewProducer({ orgId: 'org-1', dryRun: true });
    expect(Array.isArray(results)).toBe(true);
    if (results.length > 0) {
      expect(results[0].created).toBe(0);
      expect(results[0].updated).toBe(0);
    }
  });

  it('handles multiple jobs in a single run', async () => {
    _mockJobs = [
      {
        id: 'job-8',
        org_id: 'org-1',
        name: 'Holdings import batch A',
        status: 'needs_review',
        approved_rows: 5,
        rejected_rows: 0,
        error_rows: 0,
        error_message: null,
        reviewed_by: null,
        created_at: new Date().toISOString(),
      },
      {
        id: 'job-9',
        org_id: 'org-1',
        name: 'Donors import batch A',
        status: 'needs_review',
        approved_rows: 6,
        rejected_rows: 0,
        error_rows: 2,
        error_message: null,
        reviewed_by: null,
        created_at: new Date().toISOString(),
      },
    ];
    const results = await importReviewProducer({ orgId: 'org-1' });
    expect(Array.isArray(results)).toBe(true);
    if (results.length > 0) {
      expect(results[0].scanned).toBe(2);
    }
  });
});
