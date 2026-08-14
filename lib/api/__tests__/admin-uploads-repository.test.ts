// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAppAdminUploadIngestionRepository,
  createAppAdminUploadReviewRepository,
  createOrgUploadIngestionRepository,
} from '@/lib/api/repositories/admin-uploads';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const {
  mockCreateElevatedClient,
  mockFrom,
  mockStorageFrom,
  mockStorageUpload,
  mockStorageDownload,
  mockStorageRemove,
  mockParseDocument,
  mockParseDocumentChunked,
  mockExtractFactsFromText,
} = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockStorageFrom: vi.fn(),
  mockStorageUpload: vi.fn(),
  mockStorageDownload: vi.fn(),
  mockStorageRemove: vi.fn(),
  mockParseDocument: vi.fn(),
  mockParseDocumentChunked: vi.fn(),
  mockExtractFactsFromText: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

vi.mock('@/lib/import/document-parser', () => ({
  parseDocument: mockParseDocument,
  parseDocumentChunked: mockParseDocumentChunked,
}));

vi.mock('@/lib/ai/document-extractor', () => ({
  extractFactsFromText: mockExtractFactsFromText,
  getUniqueMetricCodes: (facts: Array<{ metric_code: string }>) => [
    ...new Set(facts.map((fact) => fact.metric_code)),
  ],
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue({
    from: mockFrom,
    storage: { from: mockStorageFrom },
  });
  mockStorageFrom.mockReturnValue({
    upload: mockStorageUpload,
    download: mockStorageDownload,
    remove: mockStorageRemove,
  });
  mockStorageUpload.mockResolvedValue({ data: {}, error: null });
  mockStorageRemove.mockResolvedValue({ data: {}, error: null });
  mockParseDocumentChunked.mockResolvedValue([
    { text: 'Impact report', chunkIndex: 0, totalChunks: 1 },
  ]);
  mockExtractFactsFromText.mockResolvedValue({
    facts: [{ metric_code: 'PEOPLE_SERVED', value: 42 }],
    locations: [],
  });
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

describe('createAppAdminUploadIngestionRepository', () => {
  it('requires an app-admin principal before constructing elevated access', () => {
    expect(() => createAppAdminUploadIngestionRepository({
      isAppAdmin: false as true,
      actorId: 'user-1',
    })).toThrow('App admin access required');
    expect(mockCreateElevatedClient).not.toHaveBeenCalled();
  });

  it('rejects unrestricted AI-off extraction before touching storage or data', async () => {
    const ingestion = createAppAdminUploadIngestionRepository({
      isAppAdmin: true,
      actorId: 'admin-1',
    });

    await expect(ingestion.createAndIngest({
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('report'),
      portfolioId: 'portfolio-1',
      holdingId: 'holding-1',
      aiMode: false,
      selectedMetrics: [],
    })).rejects.toThrow('Select at least one KPI when AI mode is disabled');

    expect(mockFrom).not.toHaveBeenCalled();
    expect(mockStorageUpload).not.toHaveBeenCalled();
  });

  it('verifies the holding scope, stores the file, and inserts the canonical upload record', async () => {
    const holdingQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: { id: 'holding-1', org_id: 'org-1', portfolio_id: 'portfolio-1' },
          error: null,
        },
      }
    );
    const uploadInsert = stubQuery({ data: null, error: null });
    const metricUpsert = stubQuery({ data: null, error: null });
    const stagingInsert = stubQuery({ data: null, error: null });
    const statusUpdate = stubQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(holdingQuery)
      .mockReturnValueOnce(uploadInsert)
      .mockReturnValueOnce(metricUpsert)
      .mockReturnValueOnce(stagingInsert)
      .mockReturnValueOnce(statusUpdate);

    const result = await createAppAdminUploadIngestionRepository({
      isAppAdmin: true,
      actorId: 'admin-1',
    }).createAndIngest({
      fileName: '../report.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('report'),
      portfolioId: 'portfolio-1',
      holdingId: 'holding-1',
      aiMode: false,
      selectedMetrics: ['PEOPLE_SERVED'],
    });

    expect(holdingQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'holding-1'] });
    expect(holdingQuery.calls).toContainEqual({ method: 'eq', args: ['portfolio_id', 'portfolio-1'] });
    expect(mockStorageFrom).toHaveBeenCalledWith('uploads');
    expect(mockStorageUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^org\/org-1\/uploads\/[0-9a-f-]+-__report\.pdf$/),
      expect.any(Buffer),
      { contentType: 'application/pdf', upsert: false }
    );
    expect(uploadInsert.calls).toContainEqual({
      method: 'insert',
      args: [expect.objectContaining({
        org_id: 'org-1',
        portfolio_id: 'portfolio-1',
        holding_id: 'holding-1',
        uploaded_by: 'admin-1',
        filename: '__report.pdf',
        original_name: '../report.pdf',
        bucket: 'uploads',
        mime_type: 'application/pdf',
        size_bytes: 6,
        selected_metrics: ['PEOPLE_SERVED'],
      })],
    });
    expect(stagingInsert.calls).toContainEqual({
      method: 'insert',
      args: [[expect.objectContaining({
        upload_id: result.uploadId,
        holding_id: 'holding-1',
        submitted_by_org_id: 'org-1',
        metric_code: 'PEOPLE_SERVED',
      })]],
    });
    expect(result).toEqual(expect.objectContaining({
      portfolioId: 'portfolio-1',
      holdingId: 'holding-1',
      factsExtracted: 1,
    }));
  });

  it('downloads an existing upload from its canonical bucket and object path', async () => {
    const storagePath = 'org/org-1/uploads/upload-1-report.pdf';
    const uploadQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'upload-1',
            org_id: 'org-1',
            portfolio_id: 'portfolio-1',
            holding_id: 'holding-1',
            bucket: 'uploads',
            storage_path: storagePath,
            file_name: 'report.pdf',
            filename: 'report.pdf',
            ai_mode: true,
            selected_metrics: null,
          },
          error: null,
        },
      }
    );
    const holdingQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: { id: 'holding-1', org_id: 'org-1', portfolio_id: 'portfolio-1' },
          error: null,
        },
      }
    );
    const processingUpdate = stubQuery({ data: null, error: null });
    const doneUpdate = stubQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(uploadQuery)
      .mockReturnValueOnce(holdingQuery)
      .mockReturnValueOnce(processingUpdate)
      .mockReturnValueOnce(doneUpdate);
    mockStorageDownload.mockResolvedValue({
      data: new Blob(['report']),
      error: null,
    });
    mockParseDocument.mockResolvedValue({ text: 'No metrics', metadata: { pages: 1 } });
    mockExtractFactsFromText.mockResolvedValueOnce({ facts: [], locations: [] });

    const result = await createAppAdminUploadIngestionRepository({
      isAppAdmin: true,
      actorId: 'admin-1',
    }).ingestExisting('upload-1');

    expect(mockStorageFrom).toHaveBeenCalledWith('uploads');
    expect(mockStorageDownload).toHaveBeenCalledWith(storagePath);
    expect(result).toEqual(expect.objectContaining({
      uploadId: 'upload-1',
      factsExtracted: 0,
      documentMetadata: { pages: 1 },
    }));
  });

  it('rejects stored paths that are not bound to the upload organization', async () => {
    const uploadQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'upload-1',
            org_id: 'org-1',
            portfolio_id: 'portfolio-1',
            holding_id: 'holding-1',
            bucket: 'uploads',
            storage_path: 'org/org-2/uploads/private.pdf',
            file_name: 'private.pdf',
            filename: 'private.pdf',
            ai_mode: true,
            selected_metrics: null,
          },
          error: null,
        },
      }
    );
    const holdingQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: { id: 'holding-1', org_id: 'org-1', portfolio_id: 'portfolio-1' },
          error: null,
        },
      }
    );
    mockFrom.mockReturnValueOnce(uploadQuery).mockReturnValueOnce(holdingQuery);

    await expect(createAppAdminUploadIngestionRepository({
      isAppAdmin: true,
      actorId: 'admin-1',
    }).ingestExisting('upload-1')).rejects.toThrow('Invalid storage path for upload');

    expect(mockStorageDownload).not.toHaveBeenCalled();
  });
});

describe('createOrgUploadIngestionRepository', () => {
  it('stores non-AI uploads within the authorized organization and marks them completed', async () => {
    const holdingQuery = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: { id: 'holding-1', org_id: 'org-1', portfolio_id: 'portfolio-1' },
          error: null,
        },
      }
    );
    const uploadInsert = stubQuery({ data: null, error: null });
    const statusUpdate = stubQuery({ data: null, error: null });
    mockFrom
      .mockReturnValueOnce(holdingQuery)
      .mockReturnValueOnce(uploadInsert)
      .mockReturnValueOnce(statusUpdate);

    const result = await createOrgUploadIngestionRepository({
      orgId: 'org-1',
      actorId: 'member-1',
    }).createAndIngest({
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('report'),
      holdingId: 'holding-1',
      aiMode: false,
    });

    expect(holdingQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'holding-1'] });
    expect(holdingQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(mockStorageUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^org\/org-1\/uploads\/[0-9a-f-]+-report\.pdf$/),
      expect.any(Buffer),
      { contentType: 'application/pdf', upsert: false }
    );
    expect(uploadInsert.calls).toContainEqual({
      method: 'insert',
      args: [expect.objectContaining({
        org_id: 'org-1',
        portfolio_id: 'portfolio-1',
        holding_id: 'holding-1',
        uploaded_by: 'member-1',
        bucket: 'uploads',
        status: 'processing',
      })],
    });
    expect(statusUpdate.calls).toContainEqual({
      method: 'update',
      args: [expect.objectContaining({ status: 'completed' })],
    });
    expect(mockExtractFactsFromText).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      factsExtracted: 0,
      message: 'File uploaded. AI extraction was disabled.',
    }));
  });
});
