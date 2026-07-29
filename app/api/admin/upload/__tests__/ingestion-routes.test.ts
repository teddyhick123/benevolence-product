// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  mockRequireAppAdmin,
  mockCreateAndIngest,
  mockIngestExisting,
} = vi.hoisted(() => ({
  mockRequireAppAdmin: vi.fn(),
  mockCreateAndIngest: vi.fn(),
  mockIngestExisting: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireAppAdmin: mockRequireAppAdmin,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/admin-uploads', () => {
  class AdminUploadNotFoundError extends Error {
    constructor() {
      super('Upload not found');
    }
  }

  class AdminUploadHoldingMismatchError extends Error {
    constructor() {
      super('Holding does not belong to the selected portfolio');
    }
  }

  return {
    AdminUploadNotFoundError,
    AdminUploadHoldingMismatchError,
    createAppAdminUploadIngestionRepository: () => ({
      createAndIngest: mockCreateAndIngest,
      ingestExisting: mockIngestExisting,
    }),
  };
});

import { POST as upload } from '@/app/api/admin/upload/route';
import { POST as ingest } from '@/app/api/admin/upload/ingest/route';
import {
  AdminUploadHoldingMismatchError,
  AdminUploadNotFoundError,
} from '@/lib/api/repositories/admin-uploads';

const accessGranted = {
  ok: true,
  context: {
    isAppAdmin: true,
    user: { id: 'admin-1' },
  },
};

function uploadRequest() {
  const form = new FormData();
  form.set('file', new File(['report'], 'report.pdf', { type: 'application/pdf' }));
  form.set('portfolio_id', 'portfolio-1');
  form.set('holding_id', 'holding-1');
  form.set('ai_mode', 'false');
  form.set('selected_metrics', 'PEOPLE_SERVED, JOBS_CREATED');
  return new NextRequest('http://localhost/api/admin/upload', {
    method: 'POST',
    body: form,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAppAdmin.mockResolvedValue(accessGranted);
  mockCreateAndIngest.mockResolvedValue({
    uploadId: 'upload-1',
    portfolioId: 'portfolio-1',
    holdingId: 'holding-1',
    factsExtracted: 2,
    locationsExtracted: 1,
    locationsUpserted: 1,
    chunksProcessed: 3,
    metrics: ['PEOPLE_SERVED'],
  });
  mockIngestExisting.mockResolvedValue({
    uploadId: '11111111-1111-4111-8111-111111111111',
    factsExtracted: 1,
    locationsExtracted: 0,
    locationsUpserted: 0,
    metrics: ['PEOPLE_SERVED'],
    documentMetadata: { pages: 2 },
  });
});

describe('admin upload ingestion routes', () => {
  it('returns the shared access denial before reading multipart data', async () => {
    mockRequireAppAdmin.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await upload(uploadRequest());

    expect(response.status).toBe(401);
    expect(mockCreateAndIngest).not.toHaveBeenCalled();
  });

  it('passes normalized upload input to the scoped repository and preserves response shape', async () => {
    const response = await upload(uploadRequest());

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mockCreateAndIngest).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'report.pdf',
      mimeType: 'application/pdf',
      portfolioId: 'portfolio-1',
      holdingId: 'holding-1',
      aiMode: false,
      selectedMetrics: ['PEOPLE_SERVED', 'JOBS_CREATED'],
      buffer: expect.any(Buffer),
    }));
    expect(await response.json()).toEqual({
      uploadId: 'upload-1',
      portfolio_id: 'portfolio-1',
      holding_id: 'holding-1',
      factsExtracted: 2,
      locationsExtracted: 1,
      chunksProcessed: 3,
      metrics: ['PEOPLE_SERVED'],
    });
  });

  it('maps a mismatched holding and portfolio to a 400 response', async () => {
    mockCreateAndIngest.mockRejectedValueOnce(new AdminUploadHoldingMismatchError());

    const response = await upload(uploadRequest());

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Holding does not belong to the selected portfolio',
    });
  });

  it('validates reprocessing input before calling the repository', async () => {
    const response = await ingest(new NextRequest('http://localhost/api/admin/upload/ingest', {
      method: 'POST',
      body: JSON.stringify({ uploadId: 'not-a-uuid' }),
    }));

    expect(response.status).toBe(400);
    expect(mockIngestExisting).not.toHaveBeenCalled();
  });

  it('reprocesses an existing upload and maps missing uploads to 404', async () => {
    const uploadId = '11111111-1111-4111-8111-111111111111';
    const request = () => new NextRequest('http://localhost/api/admin/upload/ingest', {
      method: 'POST',
      body: JSON.stringify({ uploadId }),
    });

    const success = await ingest(request());

    expect(success.status).toBe(200);
    expect(mockIngestExisting).toHaveBeenCalledWith(uploadId);
    expect(await success.json()).toEqual({
      success: true,
      uploadId,
      factsExtracted: 1,
      locationsExtracted: 0,
      locationsUpserted: 0,
      metrics: ['PEOPLE_SERVED'],
      documentMetadata: { pages: 2 },
    });

    mockIngestExisting.mockRejectedValueOnce(new AdminUploadNotFoundError());
    const missing = await ingest(request());
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'Upload not found' });
  });
});
