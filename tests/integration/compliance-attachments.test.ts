// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import {
  ComplianceAttachmentNotFoundError,
  ComplianceFilingNotFoundError,
} from '@/lib/api/repositories/compliance';

const ORG_ID = '11111111-1111-1111-1111-111111111111';
const FILING_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

const {
  mockRequireOrgAccess,
  mockCreateOrgComplianceRepository,
  mockListFilingAttachments,
  mockUploadFilingAttachment,
  mockDeleteFilingAttachment,
} = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(),
  mockCreateOrgComplianceRepository: vi.fn(),
  mockListFilingAttachments: vi.fn(),
  mockUploadFilingAttachment: vi.fn(),
  mockDeleteFilingAttachment: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
}));

vi.mock('@/lib/api/repositories/compliance', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/api/repositories/compliance')>();
  return {
    ...actual,
    createOrgComplianceRepository: mockCreateOrgComplianceRepository,
  };
});

import {
  DELETE,
  GET,
  POST,
} from '@/app/api/org/[orgId]/compliance/filing-calendar/[filingId]/attachments/route';

const attachment = {
  path: `${ORG_ID}/${FILING_ID}/file.pdf`,
  name: 'file.pdf',
  size: 1024,
  uploaded_at: '2026-06-13T00:00:00Z',
  signed_url: 'https://signed.example.test/file.pdf',
};

function makeGet() {
  return new NextRequest(
    `http://localhost/api/org/${ORG_ID}/compliance/filing-calendar/${FILING_ID}/attachments`
  );
}

function makePost(file?: File) {
  const formData = new FormData();
  if (file) formData.append('file', file);
  return new NextRequest(
    `http://localhost/api/org/${ORG_ID}/compliance/filing-calendar/${FILING_ID}/attachments`,
    { method: 'POST', body: formData }
  );
}

function makeDelete(body: unknown) {
  return new NextRequest(
    `http://localhost/api/org/${ORG_ID}/compliance/filing-calendar/${FILING_ID}/attachments`,
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }
  );
}

function makeParams() {
  return { params: Promise.resolve({ orgId: ORG_ID, filingId: FILING_ID }) } as any;
}

function denied(message: string, status: number) {
  return {
    ok: false,
    response: NextResponse.json(
      { error: message },
      { status, headers: { 'Cache-Control': 'no-store' } }
    ),
  };
}

function expectNoStore(response: Response) {
  expect(response.headers.get('Cache-Control')).toBe('no-store');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgAccess.mockResolvedValue({
    ok: true,
    context: { orgId: ORG_ID, user: { id: USER_ID }, db: {} },
  });
  mockCreateOrgComplianceRepository.mockReturnValue({
    listFilingAttachments: mockListFilingAttachments,
    uploadFilingAttachment: mockUploadFilingAttachment,
    deleteFilingAttachment: mockDeleteFilingAttachment,
  });
  mockListFilingAttachments.mockResolvedValue([attachment]);
  mockUploadFilingAttachment.mockResolvedValue(attachment);
  mockDeleteFilingAttachment.mockResolvedValue({ storageCleanupPending: false });
});

describe('GET /attachments', () => {
  it('returns 401 when unauthenticated', async () => {
    mockRequireOrgAccess.mockResolvedValue(denied('Unauthorized', 401));

    const response = await GET(makeGet(), makeParams());

    expect(response.status).toBe(401);
    expectNoStore(response);
    expect(mockCreateOrgComplianceRepository).not.toHaveBeenCalled();
  });

  it('returns 403 when the user is not an admin', async () => {
    mockRequireOrgAccess.mockResolvedValue(denied('Forbidden', 403));

    const response = await GET(makeGet(), makeParams());

    expect(response.status).toBe(403);
    expect(mockRequireOrgAccess).toHaveBeenCalledWith(ORG_ID, 'admin');
  });

  it('returns 404 when the scoped filing does not exist', async () => {
    mockListFilingAttachments.mockRejectedValue(new ComplianceFilingNotFoundError());

    const response = await GET(makeGet(), makeParams());

    expect(response.status).toBe(404);
  });

  it('returns attachments with signed URLs', async () => {
    const response = await GET(makeGet(), makeParams());

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(await response.json()).toEqual({ data: [attachment] });
  });

  it('returns an empty array when the filing has no attachments', async () => {
    mockListFilingAttachments.mockResolvedValue([]);

    const response = await GET(makeGet(), makeParams());

    expect(await response.json()).toEqual({ data: [] });
  });
});

describe('POST /attachments', () => {
  it('returns 401 before parsing multipart data when unauthenticated', async () => {
    mockRequireOrgAccess.mockResolvedValue(denied('Unauthorized', 401));

    const response = await POST(
      makePost(new File(['content'], 'test.pdf', { type: 'application/pdf' })),
      makeParams()
    );

    expect(response.status).toBe(401);
    expectNoStore(response);
  });

  it('returns 403 when the user is not an admin', async () => {
    mockRequireOrgAccess.mockResolvedValue(denied('Forbidden', 403));

    const response = await POST(
      makePost(new File(['content'], 'test.pdf', { type: 'application/pdf' })),
      makeParams()
    );

    expect(response.status).toBe(403);
  });

  it('returns 400 when no file is provided', async () => {
    const response = await POST(makePost(), makeParams());

    expect(response.status).toBe(400);
  });

  it('returns 415 for a disallowed MIME type', async () => {
    const response = await POST(
      makePost(new File(['<html>evil</html>'], 'evil.html', { type: 'text/html' })),
      makeParams()
    );

    expect(response.status).toBe(415);
    expectNoStore(response);
  });

  it('uploads through the scoped repository and returns 201', async () => {
    const response = await POST(
      makePost(new File(['content'], 'board packet.pdf', { type: 'application/pdf' })),
      makeParams()
    );

    expect(response.status).toBe(201);
    expect(mockUploadFilingAttachment).toHaveBeenCalledWith(expect.objectContaining({
      filingId: FILING_ID,
      fileName: 'board packet.pdf',
      contentType: 'application/pdf',
    }));
  });
});

describe('DELETE /attachments', () => {
  it('returns 401 when unauthenticated', async () => {
    mockRequireOrgAccess.mockResolvedValue(denied('Unauthorized', 401));

    const response = await DELETE(makeDelete({ path: attachment.path }), makeParams());

    expect(response.status).toBe(401);
    expectNoStore(response);
  });

  it('returns 400 when the path is missing', async () => {
    const response = await DELETE(makeDelete({}), makeParams());

    expect(response.status).toBe(400);
  });

  it('returns 404 when the attachment is not in the scoped filing', async () => {
    mockDeleteFilingAttachment.mockRejectedValue(new ComplianceAttachmentNotFoundError());

    const response = await DELETE(makeDelete({ path: attachment.path }), makeParams());

    expect(response.status).toBe(404);
  });

  it('returns success after removing attachment metadata and storage', async () => {
    const response = await DELETE(makeDelete({ path: attachment.path }), makeParams());

    expect(response.status).toBe(200);
    expectNoStore(response);
    expect(await response.json()).toEqual({ ok: true });
    expect(mockDeleteFilingAttachment).toHaveBeenCalledWith(FILING_ID, attachment.path);
  });
});
