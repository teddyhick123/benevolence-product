// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const JOB_ID = '22222222-2222-2222-2222-222222222222';
const PROFILE_ID = '33333333-3333-3333-3333-333333333333';

const {
  mockCreateElevatedClient,
  mockFrom,
  mockRpc,
  mockExtractCsv,
  mockRunTransformValidate,
} = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockExtractCsv: vi.fn(),
  mockRunTransformValidate: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

vi.mock('@/lib/import/csv-extractor', () => ({
  extractCSVToStaging: mockExtractCsv,
}));

vi.mock('@/lib/import/etl-runner', () => ({
  runTransformValidate: mockRunTransformValidate,
}));

import {
  createImportWatchdogRepository,
  createImportWorkerRepository,
} from '@/lib/api/repositories/import-worker';

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue({ from: mockFrom, rpc: mockRpc });
  mockExtractCsv.mockImplementation(async (
    _db: unknown,
    _jobId: string,
    _path: string,
    entityType: string
  ) => ({ rowsInserted: 1, entityType, errors: [] }));
  mockRunTransformValidate.mockResolvedValue({ processed: 1 });
  mockRpc.mockResolvedValue({ data: 0, error: null });
});

describe('import worker repository', () => {
  it('binds storage, mapping, state transitions, and validation to the queued job org', async () => {
    const jobQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: JOB_ID,
            org_id: ORG_ID,
            portfolio_id: 'portfolio-1',
            mapping_profile_id: PROFILE_ID,
          },
          error: null,
        },
      }
    );
    const profileQuery = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: { id: PROFILE_ID, org_id: ORG_ID }, error: null } }
    );
    const startQuery = stubQuery({ data: null, error: null });
    const reviewQuery = stubQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(jobQuery)
      .mockReturnValueOnce(profileQuery)
      .mockReturnValueOnce(startQuery)
      .mockReturnValueOnce(reviewQuery);
    const repository = createImportWorkerRepository({
      principal: { kind: 'job', job: 'import' },
      importJobId: JOB_ID,
    });

    const result = await repository.process({
      storagePaths: {
        donors: `${ORG_ID}/imports/${JOB_ID}/donors.csv`,
        holdings: `${ORG_ID}/imports/${JOB_ID}/holdings.csv`,
      },
      mappingProfileId: PROFILE_ID,
    });

    expect(result).toEqual({ extractionErrors: [] });
    expect(profileQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', ORG_ID] });
    expect(mockExtractCsv).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ from: mockFrom }),
      JOB_ID,
      `${ORG_ID}/imports/${JOB_ID}/donors.csv`,
      'donors'
    );
    expect(mockExtractCsv).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ from: mockFrom }),
      JOB_ID,
      `${ORG_ID}/imports/${JOB_ID}/holdings.csv`,
      'holdings'
    );
    expect(mockRunTransformValidate).toHaveBeenCalledWith(
      expect.objectContaining({ from: mockFrom }),
      JOB_ID,
      expect.objectContaining({ id: PROFILE_ID }),
      { portfolioId: 'portfolio-1' }
    );
    for (const query of [startQuery, reviewQuery]) {
      expect(query.calls).toContainEqual({ method: 'eq', args: ['org_id', ORG_ID] });
    }
  });

  it('rejects a cross-organization storage path and records a scoped failure', async () => {
    const jobQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: { id: JOB_ID, org_id: ORG_ID, portfolio_id: null, mapping_profile_id: null },
          error: null,
        },
      }
    );
    const failureQuery = stubQuery({ data: null, error: null });
    mockFrom.mockReturnValueOnce(jobQuery).mockReturnValueOnce(failureQuery);
    const repository = createImportWorkerRepository({
      principal: { kind: 'job', job: 'import' },
      importJobId: JOB_ID,
    });

    await expect(repository.process({
      storagePaths: {
        donors: `99999999-9999-9999-9999-999999999999/imports/${JOB_ID}/donors.csv`,
      },
    })).rejects.toThrow('Invalid storage path');

    expect(mockExtractCsv).not.toHaveBeenCalled();
    expect(failureQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', ORG_ID] });
    expect(failureQuery.calls).toContainEqual({
      method: 'update',
      args: [expect.objectContaining({ status: 'failed' })],
    });
  });

  it('rejects the wrong job principal before constructing elevated access', () => {
    expect(() => createImportWorkerRepository({
      principal: { kind: 'job', job: 'notifications' },
      importJobId: JOB_ID,
    })).toThrow('Invalid import worker principal');
    expect(mockCreateElevatedClient).not.toHaveBeenCalled();
  });
});

describe('import watchdog repository', () => {
  it('exposes only stale-job reaping to the watchdog principal', async () => {
    const repository = createImportWatchdogRepository({ kind: 'job', job: 'import-watchdog' });

    await repository.reapStaleJobs(30);

    expect(mockRpc).toHaveBeenCalledWith('mark_stale_import_jobs', {
      p_stale_threshold_minutes: 30,
    });
    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('rpc');
  });
});
