// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  mockRequireAppAdmin,
  mockApproveStagedFact,
  mockRejectStagedFact,
  mockListStagedFacts,
  mockGetUploadStatus,
} = vi.hoisted(() => ({
  mockRequireAppAdmin: vi.fn(),
  mockApproveStagedFact: vi.fn(),
  mockRejectStagedFact: vi.fn(),
  mockListStagedFacts: vi.fn(),
  mockGetUploadStatus: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireAppAdmin: mockRequireAppAdmin,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/admin-uploads', () => {
  class StagedMetricFactNotFoundError extends Error {
    constructor() {
      super('Staged fact not found');
    }
  }

  class AdminUploadNotFoundError extends Error {
    constructor() {
      super('Upload not found');
    }
  }

  return {
    StagedMetricFactNotFoundError,
    AdminUploadNotFoundError,
    createAppAdminUploadReviewRepository: () => ({
      approveStagedFact: mockApproveStagedFact,
      rejectStagedFact: mockRejectStagedFact,
      listStagedFacts: mockListStagedFacts,
      getUploadStatus: mockGetUploadStatus,
    }),
  };
});

import { POST as approveFact } from '@/app/api/admin/staged-facts/[factId]/approve/route';
import { DELETE as rejectFact } from '@/app/api/admin/staged-facts/[factId]/route';
import { GET as listFacts } from '@/app/api/admin/upload/[uploadId]/staged-facts/route';
import { GET as getStatus } from '@/app/api/admin/upload/[uploadId]/status/route';
import {
  AdminUploadNotFoundError,
  StagedMetricFactNotFoundError,
} from '@/lib/api/repositories/admin-uploads';

const accessGranted = {
  ok: true,
  context: {
    isAppAdmin: true,
    user: { id: 'admin-1' },
  },
};

const request = new NextRequest('http://localhost/api/admin/upload/upload-1');

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAppAdmin.mockResolvedValue(accessGranted);
  mockApproveStagedFact.mockResolvedValue(undefined);
  mockRejectStagedFact.mockResolvedValue(undefined);
  mockListStagedFacts.mockResolvedValue([]);
  mockGetUploadStatus.mockResolvedValue({
    uploadId: 'upload-1',
    status: 'completed',
    factsExtracted: 2,
  });
});

describe('admin upload review routes', () => {
  it('returns the shared access denial before reading staged facts', async () => {
    mockRequireAppAdmin.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    });

    const response = await listFacts(request, {
      params: Promise.resolve({ uploadId: 'upload-1' }),
    });

    expect(response.status).toBe(401);
    expect(mockListStagedFacts).not.toHaveBeenCalled();
  });

  it('preserves staged-fact list shape and no-store caching', async () => {
    mockListStagedFacts.mockResolvedValueOnce([{ id: 'fact-1' }]);

    const response = await listFacts(request, {
      params: Promise.resolve({ uploadId: 'upload-1' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual({ facts: [{ id: 'fact-1' }] });
    expect(mockListStagedFacts).toHaveBeenCalledWith('upload-1');
  });

  it('approves and rejects only the fact ID supplied by the route', async () => {
    const params = { params: Promise.resolve({ factId: 'fact-1' }) };

    const approveResponse = await approveFact(request, params);
    const rejectResponse = await rejectFact(request, params);

    expect(approveResponse.status).toBe(200);
    expect(rejectResponse.status).toBe(200);
    expect(mockApproveStagedFact).toHaveBeenCalledWith('fact-1');
    expect(mockRejectStagedFact).toHaveBeenCalledWith('fact-1');
  });

  it('maps missing staged facts to the existing 404 response', async () => {
    mockApproveStagedFact.mockRejectedValueOnce(new StagedMetricFactNotFoundError());

    const response = await approveFact(request, {
      params: Promise.resolve({ factId: 'missing-fact' }),
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Staged fact not found' });
  });

  it('preserves upload status shape and maps missing uploads to 404', async () => {
    const success = await getStatus(request, {
      params: Promise.resolve({ uploadId: 'upload-1' }),
    });

    expect(success.status).toBe(200);
    expect(await success.json()).toEqual({
      uploadId: 'upload-1',
      status: 'completed',
      factsExtracted: 2,
    });

    mockGetUploadStatus.mockRejectedValueOnce(new AdminUploadNotFoundError());
    const missing = await getStatus(request, {
      params: Promise.resolve({ uploadId: 'missing-upload' }),
    });
    expect(missing.status).toBe(404);
    expect(await missing.json()).toEqual({ error: 'Upload not found' });
  });
});
