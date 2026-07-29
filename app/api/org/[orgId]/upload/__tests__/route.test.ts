// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';

const {
  mockRequireOrgAccess,
  mockCreateAndIngest,
  mockCreateOrgRepository,
} = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(),
  mockCreateAndIngest: vi.fn(),
  mockCreateOrgRepository: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/admin-uploads', () => {
  class AdminUploadHoldingMismatchError extends Error {
    constructor() {
      super('Holding does not belong to the selected portfolio');
    }
  }

  return {
    AdminUploadHoldingMismatchError,
    createOrgUploadIngestionRepository: mockCreateOrgRepository,
  };
});

import { POST } from '@/app/api/org/[orgId]/upload/route';
import { AdminUploadHoldingMismatchError } from '@/lib/api/repositories/admin-uploads';

const accessGranted = {
  ok: true,
  context: {
    orgId: 'org-1',
    user: { id: 'member-1' },
  },
};

function request(aiMode = true) {
  const form = new FormData();
  form.set('file', new File(['report'], 'report.pdf', { type: 'application/pdf' }));
  form.set('holding_id', 'holding-1');
  form.set('ai_mode', String(aiMode));
  return new NextRequest('http://localhost/api/org/org-1/upload', {
    method: 'POST',
    body: form,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgAccess.mockResolvedValue(accessGranted);
  mockCreateOrgRepository.mockReturnValue({ createAndIngest: mockCreateAndIngest });
  mockCreateAndIngest.mockResolvedValue({
    uploadId: 'upload-1',
    factsExtracted: 2,
    chunksProcessed: 3,
  });
});

describe('organization report upload route', () => {
  it('requires member access before reading the upload', async () => {
    mockRequireOrgAccess.mockResolvedValueOnce({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await POST(request(), {
      params: Promise.resolve({ orgId: 'org-1' }),
    });

    expect(response.status).toBe(403);
    expect(mockCreateAndIngest).not.toHaveBeenCalled();
    expect(mockRequireOrgAccess).toHaveBeenCalledWith('org-1', 'member');
  });

  it('constructs the repository from the authorized org and preserves success shape', async () => {
    const response = await POST(request(), {
      params: Promise.resolve({ orgId: 'org-1' }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mockCreateOrgRepository).toHaveBeenCalledWith({
      orgId: 'org-1',
      actorId: 'member-1',
    });
    expect(mockCreateAndIngest).toHaveBeenCalledWith(expect.objectContaining({
      fileName: 'report.pdf',
      holdingId: 'holding-1',
      aiMode: true,
      buffer: expect.any(Buffer),
    }));
    expect(await response.json()).toEqual({
      uploadId: 'upload-1',
      factsExtracted: 2,
      chunksProcessed: 3,
      message: 'Extracted 2 metrics. Pending portfolio owner approval.',
    });
  });

  it('preserves the store-only response when AI extraction is disabled', async () => {
    mockCreateAndIngest.mockResolvedValueOnce({
      uploadId: 'upload-1',
      factsExtracted: 0,
      chunksProcessed: 0,
    });

    const response = await POST(request(false), {
      params: Promise.resolve({ orgId: 'org-1' }),
    });

    expect(await response.json()).toEqual({
      uploadId: 'upload-1',
      factsExtracted: 0,
      message: 'File uploaded. AI extraction was disabled.',
    });
  });

  it('conceals cross-org holdings behind the existing 400 response', async () => {
    mockCreateAndIngest.mockRejectedValueOnce(new AdminUploadHoldingMismatchError());

    const response = await POST(request(), {
      params: Promise.resolve({ orgId: 'org-1' }),
    });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: 'Holding does not belong to this organization',
    });
  });
});
