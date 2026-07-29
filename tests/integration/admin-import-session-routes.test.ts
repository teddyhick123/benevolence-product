// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const JOB_ID = '22222222-2222-2222-2222-222222222222';
const ORG_ID = '11111111-1111-1111-1111-111111111111';

const { mockRequireAppAdmin, mockFrom, mockSubscribe } = vi.hoisted(() => ({
  mockRequireAppAdmin: vi.fn(),
  mockFrom: vi.fn(),
  mockSubscribe: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireAppAdmin: mockRequireAppAdmin,
}));

vi.mock('@/lib/import/progress-emitter', () => ({
  ImportProgressEmitter: { subscribe: mockSubscribe },
}));

import {
  GET as listMappingProfiles,
  POST as saveMappingProfile,
} from '@/app/api/admin/import/mapping-profiles/route';
import { GET as getJob } from '@/app/api/admin/imports/[id]/route';
import { GET as getAudit } from '@/app/api/admin/imports/[id]/audit/route';
import { PATCH as correctError } from '@/app/api/admin/imports/[id]/errors/route';
import { GET as getProgress } from '@/app/api/admin/imports/[id]/progress/route';
import { POST as resumeJob } from '@/app/api/admin/imports/[id]/resume/route';

function context() {
  return { params: Promise.resolve({ id: JOB_ID }) };
}

function request(path: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(`http://localhost${path}`, init);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAppAdmin.mockResolvedValue({
    ok: true,
    context: {
      isAppAdmin: true,
      user: { id: 'app-admin-1' },
      db: { from: mockFrom },
    },
  });
  mockSubscribe.mockReturnValue(new ReadableStream({ start(controller) { controller.close(); } }));
});

describe('app-admin import session routes', () => {
  it('stops before data access when the app-admin guard denies the request', async () => {
    mockRequireAppAdmin.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await getJob(request(`/api/admin/imports/${JOB_ID}`), context());

    expect(response.status).toBe(403);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('lists mapping profiles through the authenticated session and optional org filter', async () => {
    const query = stubQuery({ data: [], error: null });
    mockFrom.mockReturnValue(query);

    const response = await listMappingProfiles(
      request(`/api/admin/import/mapping-profiles?org_id=${ORG_ID}`)
    );

    expect(response.status).toBe(200);
    expect(mockRequireAppAdmin).toHaveBeenCalledOnce();
    expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', ORG_ID] });
  });

  it('records the authenticated app admin as mapping-profile creator', async () => {
    const query = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'profile-1', org_id: ORG_ID }, error: null } }
    );
    mockFrom.mockReturnValue(query);

    const response = await saveMappingProfile(
      request('/api/admin/import/mapping-profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Blackbaud profile',
          source_type: 'blackbaud_re_nxt',
          entity_mappings: {},
          org_id: ORG_ID,
        }),
      })
    );

    expect(response.status).toBe(201);
    expect(query.calls).toContainEqual({
      method: 'insert',
      args: [expect.objectContaining({ org_id: ORG_ID, created_by: 'app-admin-1' })],
    });
  });

  it('reads job detail and staging counts through one app-admin session', async () => {
    const queries: ReturnType<typeof stubQuery>[] = [];
    mockFrom.mockImplementation((table: string) => {
      const query = table === 'import_jobs'
        ? stubQuery(
            { data: null, error: null },
            { single: { data: { id: JOB_ID, status: 'needs_review' }, error: null } }
          )
        : stubQuery({ data: [{ validation_status: 'valid' }], error: null });
      queries.push(query);
      return query;
    });

    const response = await getJob(request(`/api/admin/imports/${JOB_ID}`), context());

    expect(response.status).toBe(200);
    expect(queries).toHaveLength(6);
    for (const query of queries.slice(1)) {
      expect(query.calls).toContainEqual({ method: 'eq', args: ['import_job_id', JOB_ID] });
    }
  });

  it('safely defaults malformed audit pagination', async () => {
    const query = stubQuery({ data: [], error: null });
    mockFrom.mockReturnValue(query);

    const response = await getAudit(
      request(`/api/admin/imports/${JOB_ID}/audit?limit=nope&offset=-5`),
      context()
    );

    expect(response.status).toBe(200);
    expect(query.calls).toContainEqual({ method: 'eq', args: ['import_job_id', JOB_ID] });
    expect(query.calls).toContainEqual({ method: 'range', args: [0, 49] });
  });

  it('rejects an unknown correction table before using the session database', async () => {
    const response = await correctError(
      request(`/api/admin/imports/${JOB_ID}/errors`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staging_table: 'profiles',
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

  it('resumes only the requested review-blocked job', async () => {
    const statusQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { status: 'needs_review' }, error: null } }
    );
    const updateQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: JOB_ID, status: 'processing' }, error: null } }
    );
    mockFrom.mockReturnValueOnce(statusQuery).mockReturnValueOnce(updateQuery);

    const response = await resumeJob(
      request(`/api/admin/imports/${JOB_ID}/resume`, { method: 'POST' }),
      context()
    );

    expect(response.status).toBe(200);
    expect(statusQuery.calls).toContainEqual({ method: 'eq', args: ['id', JOB_ID] });
    expect(updateQuery.calls).toContainEqual({ method: 'eq', args: ['id', JOB_ID] });
  });

  it('authorizes before subscribing to a job progress stream', async () => {
    const response = await getProgress(
      request(`/api/admin/imports/${JOB_ID}/progress`),
      context()
    );

    expect(response.status).toBe(200);
    expect(mockRequireAppAdmin).toHaveBeenCalledOnce();
    expect(mockSubscribe).toHaveBeenCalledWith(JOB_ID);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
  });
});
