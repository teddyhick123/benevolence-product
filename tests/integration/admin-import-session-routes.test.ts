// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const JOB_ID = '22222222-2222-2222-2222-222222222222';
const ORG_ID = '11111111-1111-1111-1111-111111111111';

const {
  mockRequireAppAdmin,
  mockFrom,
  mockSubscribe,
  mockRunTransformValidate,
  mockStreamMigrationChat,
  mockSuggestRowFixes,
  mockSuggestMappings,
  mockAiLimit,
  mockStorageFrom,
  mockStorageUpload,
  mockEnqueueImportJob,
  mockCreateImportRollbackRepository,
  mockCreateImportMaintenanceRepository,
  mockRollback,
  mockReapStaleJobs,
} = vi.hoisted(() => ({
  mockRequireAppAdmin: vi.fn(),
  mockFrom: vi.fn(),
  mockSubscribe: vi.fn(),
  mockRunTransformValidate: vi.fn(),
  mockStreamMigrationChat: vi.fn(),
  mockSuggestRowFixes: vi.fn(),
  mockSuggestMappings: vi.fn(),
  mockAiLimit: vi.fn(),
  mockStorageFrom: vi.fn(),
  mockStorageUpload: vi.fn(),
  mockEnqueueImportJob: vi.fn(),
  mockCreateImportRollbackRepository: vi.fn(),
  mockCreateImportMaintenanceRepository: vi.fn(),
  mockRollback: vi.fn(),
  mockReapStaleJobs: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireAppAdmin: mockRequireAppAdmin,
}));

vi.mock('@/lib/import/progress-emitter', () => ({
  ImportProgressEmitter: { subscribe: mockSubscribe },
}));

vi.mock('@/lib/import/etl-runner', () => ({
  runTransformValidate: mockRunTransformValidate,
}));

vi.mock('@/lib/import/ai/chat', () => ({
  streamMigrationChat: mockStreamMigrationChat,
}));

vi.mock('@/lib/import/ai/validate-row', () => ({
  suggestRowFixes: mockSuggestRowFixes,
}));

vi.mock('@/lib/import/ai/mapping-assist', () => ({
  suggestMappings: mockSuggestMappings,
}));

vi.mock('@/lib/rate-limit', () => ({
  aiLimiter: { limit: mockAiLimit },
}));

vi.mock('@/lib/import/job-queue', () => ({
  enqueueImportJob: mockEnqueueImportJob,
}));

vi.mock('@/lib/api/repositories/imports', () => ({
  createImportRollbackRepository: mockCreateImportRollbackRepository,
  createAppAdminImportMaintenanceRepository: mockCreateImportMaintenanceRepository,
  ImportRollbackJobNotFoundError: class ImportRollbackJobNotFoundError extends Error {},
  ImportRollbackStatusError: class ImportRollbackStatusError extends Error {},
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
import { POST as bulkFix } from '@/app/api/admin/imports/[id]/bulk-fix/route';
import { POST as runValidate } from '@/app/api/admin/imports/[id]/run-validate/route';
import { POST as importChat } from '@/app/api/admin/imports/[id]/ai/chat/route';
import { POST as suggestFixes } from '@/app/api/admin/import/ai/suggest/route';
import { POST as mappingAssist } from '@/app/api/admin/imports/mapping-assist/route';
import { GET as listJobs, POST as createJob } from '@/app/api/admin/imports/route';
import { POST as rollbackJob } from '@/app/api/admin/imports/[id]/rollback/route';
import { POST as runWatchdog } from '@/app/api/admin/imports/watchdog/route';
import { GET as getReport } from '@/app/api/admin/imports/[id]/report/route';

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
      db: { from: mockFrom, storage: { from: mockStorageFrom } },
    },
  });
  mockSubscribe.mockReturnValue(new ReadableStream({ start(controller) { controller.close(); } }));
  mockRunTransformValidate.mockResolvedValue({ validated: 1 });
  mockStreamMigrationChat.mockResolvedValue({ actions: [] });
  mockSuggestRowFixes.mockResolvedValue([]);
  mockSuggestMappings.mockResolvedValue({ field_map: {} });
  mockAiLimit.mockResolvedValue({ success: true, reset: 0, remaining: 99, limit: 100 });
  mockStorageFrom.mockReturnValue({ upload: mockStorageUpload });
  mockStorageUpload.mockResolvedValue({ data: {}, error: null });
  mockEnqueueImportJob.mockResolvedValue('queue-job-1');
  mockCreateImportRollbackRepository.mockReturnValue({ rollback: mockRollback });
  mockRollback.mockResolvedValue({
    result: { scope: 'full', recordsReverted: 1, recordsSkipped: 0, errors: [], durationMs: 1 },
    job: { id: JOB_ID, org_id: ORG_ID, status: 'rolled_back' },
  });
  mockCreateImportMaintenanceRepository.mockReturnValue({ reapStaleJobs: mockReapStaleJobs });
  mockReapStaleJobs.mockResolvedValue({ data: 2, error: null });
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

  it('rejects an invalid bulk-fix operation before reading staging data', async () => {
    const response = await bulkFix(
      request(`/api/admin/imports/${JOB_ID}/bulk-fix`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'donors', field: 'ein', fix: 'delete_rows' }),
      }),
      context()
    );

    expect(response.status).toBe(400);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('binds validation profile lookup to the import job organization', async () => {
    const jobQuery = stubQuery(
      { data: null, error: null },
      {
        single: {
          data: { id: JOB_ID, org_id: ORG_ID, mapping_profile_id: 'profile-1', portfolio_id: null },
          error: null,
        },
      }
    );
    const profileQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'profile-1', org_id: ORG_ID }, error: null } }
    );
    mockFrom.mockReturnValueOnce(jobQuery).mockReturnValueOnce(profileQuery);

    const response = await runValidate(
      request(`/api/admin/imports/${JOB_ID}/run-validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityTypes: ['donors'] }),
      }),
      context()
    );

    expect(response.status).toBe(200);
    expect(profileQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', ORG_ID] });
    expect(mockRunTransformValidate).toHaveBeenCalledWith(
      expect.objectContaining({ from: mockFrom }),
      JOB_ID,
      expect.objectContaining({ id: 'profile-1' }),
      { entityTypes: ['donors'], portfolioId: undefined }
    );
  });

  it('validates AI chat input before reading import context', async () => {
    const response = await importChat(
      request(`/api/admin/imports/${JOB_ID}/ai/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '' }),
      }),
      context()
    );

    expect(response.status).toBe(400);
    expect(mockAiLimit).toHaveBeenCalledWith('app-admin-1');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('reads AI suggestion rows through the app-admin session with job binding', async () => {
    const rowId = '33333333-3333-3333-3333-333333333333';
    const query = stubQuery({
      data: [{
        id: rowId,
        raw_data: {},
        transformed_data: {},
        validation_errors: [{ field: 'email', message: 'Invalid', severity: 'error', rule: 'email' }],
      }],
      error: null,
    });
    mockFrom.mockReturnValue(query);

    const response = await suggestFixes(
      request('/api/admin/import/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          import_job_id: JOB_ID,
          staging_table: 'staging_import_donors',
          staging_row_ids: [rowId],
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(query.calls).toContainEqual({ method: 'eq', args: ['import_job_id', JOB_ID] });
    expect(mockSuggestRowFixes).toHaveBeenCalledOnce();
  });

  it('uses the shared app-admin guard for mapping assistance', async () => {
    const response = await mappingAssist(
      request('/api/admin/imports/mapping-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: 'blackbaud',
          entity_type: 'donors',
          source_fields: ['First Name'],
          sample_records: [{ 'First Name': 'Ada' }],
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(mockRequireAppAdmin).toHaveBeenCalledOnce();
    expect(mockSuggestMappings).toHaveBeenCalledWith(expect.objectContaining({
      sourceSystem: 'blackbaud',
      entityType: 'donors',
    }));
  });

  it('lists global import jobs through the authenticated app-admin session', async () => {
    const query = stubQuery({ data: [], error: null });
    mockFrom.mockReturnValue(query);

    const response = await listJobs(request('/api/admin/imports?status=failed'));

    expect(response.status).toBe(200);
    expect(query.calls).toContainEqual({ method: 'eq', args: ['status', 'failed'] });
  });

  it('rejects a portfolio that does not belong to the selected organization', async () => {
    const organizationQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: ORG_ID }, error: null } }
    );
    const portfolioQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    mockFrom.mockReturnValueOnce(organizationQuery).mockReturnValueOnce(portfolioQuery);
    const form = new FormData();
    form.set('name', 'Cross-org attempt');
    form.set('org_id', ORG_ID);
    form.set('portfolio_id', '44444444-4444-4444-4444-444444444444');

    const response = await createJob(
      request('/api/admin/imports', { method: 'POST', body: form })
    );

    expect(response.status).toBe(400);
    expect(portfolioQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', ORG_ID] });
    expect(mockEnqueueImportJob).not.toHaveBeenCalled();
  });

  it('resolves the rollback organization through RLS before constructing its repository', async () => {
    const jobQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: JOB_ID, org_id: ORG_ID }, error: null } }
    );
    mockFrom.mockReturnValue(jobQuery);

    const response = await rollbackJob(
      request(`/api/admin/imports/${JOB_ID}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'full' }),
      }),
      context()
    );

    expect(response.status).toBe(200);
    expect(mockCreateImportRollbackRepository).toHaveBeenCalledWith({
      orgId: ORG_ID,
      actorId: 'app-admin-1',
    });
    expect(mockRollback).toHaveBeenCalledWith(JOB_ID, 'full');
  });

  it('runs stale-job maintenance only through the app-admin repository', async () => {
    const response = await runWatchdog();

    expect(response.status).toBe(200);
    expect(mockCreateImportMaintenanceRepository).toHaveBeenCalledWith({
      isAppAdmin: true,
      actorId: 'app-admin-1',
    });
    expect(mockReapStaleJobs).toHaveBeenCalledWith(30);
    expect(await response.json()).toEqual({ reaped: 2 });
  });

  it('checks report job visibility through the app-admin session', async () => {
    const jobQuery = stubQuery(
      { data: null, error: null },
      { single: { data: null, error: null } }
    );
    mockFrom.mockReturnValue(jobQuery);

    const response = await getReport(
      request(`/api/admin/imports/${JOB_ID}/report`),
      context()
    );

    expect(response.status).toBe(404);
    expect(mockRequireAppAdmin).toHaveBeenCalledOnce();
    expect(jobQuery.calls).toContainEqual({ method: 'eq', args: ['id', JOB_ID] });
  });
});
