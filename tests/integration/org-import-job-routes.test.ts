// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const JOB_ID = '22222222-2222-2222-2222-222222222222';

const { mockRequireOrgAccess, mockFrom } = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
}));

import { GET as getJob } from '@/app/api/org/[orgId]/imports/[jobId]/route';
import { GET as getAudit } from '@/app/api/org/[orgId]/imports/[jobId]/audit/route';
import { PATCH as correctError } from '@/app/api/org/[orgId]/imports/[jobId]/errors/route';
import { POST as resumeJob } from '@/app/api/org/[orgId]/imports/[jobId]/resume/route';

function context() {
  return { params: Promise.resolve({ orgId: ORG_ID, jobId: JOB_ID }) } as any;
}

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`http://localhost${path}`, init);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgAccess.mockResolvedValue({
    ok: true,
    context: {
      orgId: ORG_ID,
      user: { id: 'user-1' },
      db: { from: mockFrom },
    },
  });
});

describe('organization import job routes', () => {
  it('stops before querying when organization admin access is denied', async () => {
    mockRequireOrgAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await getJob(
      request(`/api/org/${ORG_ID}/imports/${JOB_ID}`),
      context()
    );

    expect(response.status).toBe(403);
    expect(mockRequireOrgAccess).toHaveBeenCalledWith(ORG_ID, 'admin');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('scopes the job and every staging count to both job and organization', async () => {
    const queries: ReturnType<typeof stubQuery>[] = [];
    mockFrom.mockImplementation((table: string) => {
      const query = table === 'import_jobs'
        ? stubQuery({ data: null, error: null }, {
            single: { data: { id: JOB_ID, org_id: ORG_ID }, error: null },
          })
        : stubQuery({ data: [{ validation_status: 'valid' }], error: null });
      queries.push(query);
      return query;
    });

    const response = await getJob(
      request(`/api/org/${ORG_ID}/imports/${JOB_ID}`),
      context()
    );

    expect(response.status).toBe(200);
    expect(queries).toHaveLength(6);
    for (const query of queries) {
      expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', ORG_ID] });
    }
    for (const query of queries.slice(1)) {
      expect(query.calls).toContainEqual({ method: 'eq', args: ['import_job_id', JOB_ID] });
    }
  });

  it('verifies the parent job before reading audit entries and safely defaults pagination', async () => {
    const jobQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: JOB_ID }, error: null } }
    );
    const auditQuery = stubQuery({ data: [], error: null });
    mockFrom.mockReturnValueOnce(jobQuery).mockReturnValueOnce(auditQuery);

    const response = await getAudit(
      request(`/api/org/${ORG_ID}/imports/${JOB_ID}/audit?limit=nope&offset=-10`),
      context()
    );

    expect(response.status).toBe(200);
    expect(jobQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', ORG_ID] });
    expect(auditQuery.calls).toContainEqual({ method: 'eq', args: ['import_job_id', JOB_ID] });
    expect(auditQuery.calls).toContainEqual({ method: 'range', args: [0, 49] });
  });

  it('rejects an unrecognized staging table before any data access', async () => {
    const response = await correctError(
      request(`/api/org/${ORG_ID}/imports/${JOB_ID}/errors`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staging_table: 'donors',
          row_id: '33333333-3333-3333-3333-333333333333',
          field: 'email',
          proposed_value: 'person@example.com',
        }),
      }),
      context()
    );

    expect(response.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('resumes only the exact organization job after checking its state', async () => {
    const jobQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: JOB_ID, status: 'needs_review' }, error: null } }
    );
    const updateQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: JOB_ID, status: 'processing' }, error: null } }
    );
    mockFrom.mockReturnValueOnce(jobQuery).mockReturnValueOnce(updateQuery);

    const response = await resumeJob(
      request(`/api/org/${ORG_ID}/imports/${JOB_ID}/resume`, { method: 'POST' }),
      context()
    );

    expect(response.status).toBe(200);
    for (const query of [jobQuery, updateQuery]) {
      expect(query.calls).toContainEqual({ method: 'eq', args: ['id', JOB_ID] });
      expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', ORG_ID] });
    }
  });
});
