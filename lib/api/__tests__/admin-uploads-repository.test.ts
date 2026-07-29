// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAppAdminUploadReviewRepository } from '@/lib/api/repositories/admin-uploads';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockFrom } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue({ from: mockFrom });
});

function repository() {
  return createAppAdminUploadReviewRepository({
    isAppAdmin: true,
    actorId: 'admin-1',
  });
}

describe('createAppAdminUploadReviewRepository', () => {
  it('requires an app-admin principal before constructing elevated access', () => {
    expect(() => createAppAdminUploadReviewRepository({
      isAppAdmin: false as true,
      actorId: 'user-1',
    })).toThrow('App admin access required');
    expect(mockCreateElevatedClient).not.toHaveBeenCalled();
  });

  it('copies a staged fact using canonical fields and marks that same fact approved', async () => {
    const stagedQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'fact-1',
            holding_id: 'holding-1',
            metric_code: 'people_served',
            period_start: '2026-01-01',
            period_end: '2026-12-31',
            value: 42,
            source: 'Annual report',
            verification_level: 'reported',
            data_quality_score: 0.9,
            unit: 'people',
            submitted_by_org_id: 'org-1',
          },
          error: null,
        },
      }
    );
    const insertQuery = stubQuery({ data: null, error: null });
    const updateQuery = stubQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(stagedQuery)
      .mockReturnValueOnce(insertQuery)
      .mockReturnValueOnce(updateQuery);

    await repository().approveStagedFact('fact-1');

    expect(stagedQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'fact-1'] });
    expect(insertQuery.calls).toContainEqual({
      method: 'insert',
      args: [{
        holding_id: 'holding-1',
        metric_code: 'people_served',
        period_start: '2026-01-01',
        period_end: '2026-12-31',
        value: 42,
        source: 'Annual report',
        verification_level: 'reported',
        data_quality_score: 0.9,
        unit: 'people',
        submitted_by_org_id: 'org-1',
      }],
    });
    expect(updateQuery.calls).toContainEqual({
      method: 'update',
      args: [{ approved: true, review_status: 'approved' }],
    });
    expect(updateQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'fact-1'] });
  });

  it('scopes staged-fact lists to the requested upload', async () => {
    const query = stubQuery({ data: [], error: null });
    mockFrom.mockReturnValue(query);

    await repository().listStagedFacts('upload-1');

    expect(query.calls).toContainEqual({ method: 'eq', args: ['upload_id', 'upload-1'] });
    expect(query.calls).toContainEqual({ method: 'eq', args: ['approved', false] });
  });

  it('scopes upload status and its fact count to the same upload ID', async () => {
    const uploadQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'upload-1',
            status: 'completed',
            file_name: 'report.pdf',
            created_at: '2026-07-01',
            updated_at: '2026-07-02',
            portfolio_id: 'portfolio-1',
            holding_id: 'holding-1',
            ai_mode: true,
          },
          error: null,
        },
      }
    );
    const countQuery = stubQuery({ data: null, error: null, count: 3 } as never);
    mockFrom.mockReturnValueOnce(uploadQuery).mockReturnValueOnce(countQuery);

    const status = await repository().getUploadStatus('upload-1');

    expect(uploadQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'upload-1'] });
    expect(countQuery.calls).toContainEqual({ method: 'eq', args: ['upload_id', 'upload-1'] });
    expect(status).toEqual(expect.objectContaining({ uploadId: 'upload-1', factsExtracted: 3 }));
  });

  it('does not expose the elevated client or generic table access', () => {
    const scopedRepository = repository();

    expect(scopedRepository).not.toHaveProperty('db');
    expect(scopedRepository).not.toHaveProperty('from');
  });
});
