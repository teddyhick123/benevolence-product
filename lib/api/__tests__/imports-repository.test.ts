// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const JOB_ID = '22222222-2222-2222-2222-222222222222';

const { mockCreateElevatedClient, mockFrom, mockRollbackImport } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockRollbackImport: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

vi.mock('@/lib/import/rollback', () => ({
  rollbackImport: mockRollbackImport,
}));

import {
  createImportRollbackRepository,
  ImportRollbackJobNotFoundError,
  ImportRollbackStatusError,
} from '@/lib/api/repositories/imports';

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue({ from: mockFrom });
  mockRollbackImport.mockResolvedValue({
    scope: 'full',
    recordsReverted: 1,
    recordsSkipped: 0,
    errors: [],
    durationMs: 1,
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
