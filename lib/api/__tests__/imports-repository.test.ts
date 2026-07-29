// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const JOB_ID = '22222222-2222-2222-2222-222222222222';

const {
  mockCreateElevatedClient,
  mockFrom,
  mockRpc,
  mockRollbackImport,
  mockLoadStagingToProduction,
  mockGenerateReconciliationReport,
  mockCompleteGeneratedTasks,
} = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockRollbackImport: vi.fn(),
  mockLoadStagingToProduction: vi.fn(),
  mockGenerateReconciliationReport: vi.fn(),
  mockCompleteGeneratedTasks: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

vi.mock('@/lib/import/rollback', () => ({
  rollbackImport: mockRollbackImport,
}));

vi.mock('@/lib/import/loader', () => ({
  loadStagingToProduction: mockLoadStagingToProduction,
}));

vi.mock('@/lib/import/reconciler', () => ({
  generateReconciliationReport: mockGenerateReconciliationReport,
}));

vi.mock('@/lib/tasks/automation/task-writer', () => ({
  completeGeneratedTasks: mockCompleteGeneratedTasks,
}));

import {
  createImportRollbackRepository,
  createAppAdminImportMaintenanceRepository,
  createImportOrchestrationRepository,
  ImportRollbackJobNotFoundError,
  ImportRollbackStatusError,
} from '@/lib/api/repositories/imports';

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue({ from: mockFrom, rpc: mockRpc });
  mockRollbackImport.mockResolvedValue({
    scope: 'full',
    recordsReverted: 1,
    recordsSkipped: 0,
    errors: [],
    durationMs: 1,
  });
  mockRpc.mockResolvedValue({ data: 2, error: null });
  mockLoadStagingToProduction.mockResolvedValue([
    { phase: 'donors', inserted: 2, updated: 1, skipped: 0, failed: 0, errors: [] },
  ]);
  mockGenerateReconciliationReport.mockResolvedValue({
    importJobId: JOB_ID,
    generatedAt: '2026-07-29T00:00:00.000Z',
    overallSuccess: true,
    entities: [],
    summary: 'ok',
    actionItems: [],
  });
  mockCompleteGeneratedTasks.mockResolvedValue(1);
});

describe('app-admin import maintenance repository', () => {
  it('exposes only the stale-job operation and calls the service-only RPC', async () => {
    const repository = createAppAdminImportMaintenanceRepository({
      isAppAdmin: true,
      actorId: 'app-admin-1',
    });

    await expect(repository.reapStaleJobs(30)).resolves.toEqual({ data: 2, error: null });
    expect(mockRpc).toHaveBeenCalledWith('mark_stale_import_jobs', {
      p_stale_threshold_minutes: 30,
    });
    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('rpc');
  });

  it('contains global PII cleanup behind the same app-admin principal', async () => {
    const repository = createAppAdminImportMaintenanceRepository({
      isAppAdmin: true,
      actorId: 'app-admin-1',
    });

    await repository.cleanupStagingPii(30);

    expect(mockRpc).toHaveBeenCalledWith('cleanup_staging_pii', { retention_days: 30 });
  });
});

describe('import orchestration repository', () => {
  it('verifies the organization-bound job before elevated reconciliation', async () => {
    const jobQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: JOB_ID, org_id: ORG_ID, status: 'completed' }, error: null } }
    );
    mockFrom.mockReturnValue(jobQuery);
    const repository = createImportOrchestrationRepository({ orgId: ORG_ID, actorId: 'app-admin-1' });

    await repository.generateReconciliation(JOB_ID);

    expect(jobQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', ORG_ID] });
    expect(mockGenerateReconciliationReport).toHaveBeenCalledWith(
      expect.objectContaining({ from: mockFrom }),
      JOB_ID
    );
  });

  it('atomically claims an approved job before loading production data', async () => {
    const currentQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: JOB_ID, org_id: ORG_ID, status: 'approved' }, error: null } }
    );
    const claimQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: JOB_ID, org_id: ORG_ID, status: 'committing' }, error: null } }
    );
    const completeQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: JOB_ID, org_id: ORG_ID, status: 'completed' }, error: null } }
    );
    mockFrom
      .mockReturnValueOnce(currentQuery)
      .mockReturnValueOnce(claimQuery)
      .mockReturnValueOnce(completeQuery);
    const repository = createImportOrchestrationRepository({ orgId: ORG_ID, actorId: 'app-admin-1' });

    const result = await repository.commit(JOB_ID);

    expect(claimQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', ORG_ID] });
    expect(claimQuery.calls).toContainEqual({ method: 'eq', args: ['status', 'approved'] });
    expect(mockLoadStagingToProduction).toHaveBeenCalledWith(
      expect.objectContaining({ from: mockFrom }),
      JOB_ID,
      { upsertMode: 'upsert' }
    );
    expect(completeQuery.calls).toContainEqual({ method: 'eq', args: ['status', 'committing'] });
    expect(result.load_summary).toMatchObject({ total_inserted: 3, total_failed: 0 });
  });
});

describe('import rollback repository', () => {
  it('verifies and rereads the job within its bound organization', async () => {
    const beforeQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: JOB_ID, status: 'completed' }, error: null } }
    );
    const afterQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: JOB_ID, org_id: ORG_ID, status: 'rolled_back' }, error: null } }
    );
    mockFrom.mockReturnValueOnce(beforeQuery).mockReturnValueOnce(afterQuery);
    const repository = createImportRollbackRepository({ orgId: ORG_ID, actorId: 'user-1' });

    const result = await repository.rollback(JOB_ID, 'full');

    for (const query of [beforeQuery, afterQuery]) {
      expect(query.calls).toContainEqual({ method: 'eq', args: ['id', JOB_ID] });
      expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', ORG_ID] });
    }
    expect(mockRollbackImport).toHaveBeenCalledWith(
      expect.objectContaining({ from: mockFrom }),
      JOB_ID,
      'full'
    );
    expect(result.job.status).toBe('rolled_back');
    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });

  it('does not roll back a job outside the bound organization', async () => {
    const query = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    mockFrom.mockReturnValue(query);
    const repository = createImportRollbackRepository({ orgId: ORG_ID, actorId: 'user-1' });

    await expect(repository.rollback(JOB_ID, 'full'))
      .rejects.toBeInstanceOf(ImportRollbackJobNotFoundError);
    expect(mockRollbackImport).not.toHaveBeenCalled();
  });

  it('does not roll back a job in a non-terminal state', async () => {
    const query = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: JOB_ID, status: 'processing' }, error: null } }
    );
    mockFrom.mockReturnValue(query);
    const repository = createImportRollbackRepository({ orgId: ORG_ID, actorId: 'user-1' });

    await expect(repository.rollback(JOB_ID, 'full'))
      .rejects.toBeInstanceOf(ImportRollbackStatusError);
    expect(mockRollbackImport).not.toHaveBeenCalled();
  });
});
