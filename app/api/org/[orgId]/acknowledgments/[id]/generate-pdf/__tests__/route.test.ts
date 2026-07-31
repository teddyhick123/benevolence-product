// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const {
  mockRequireOrgAccess,
  mockCreateAcknowledgmentPdfRepository,
  mockUpload,
  mockRemove,
  mockCreateSignedUrl,
} = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(),
  mockCreateAcknowledgmentPdfRepository: vi.fn(),
  mockUpload: vi.fn(),
  mockRemove: vi.fn(),
  mockCreateSignedUrl: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({
  requireOrgAccess: mockRequireOrgAccess,
  isAccessDenied: (result: { ok: boolean }) => !result.ok,
}));

vi.mock('@/lib/api/repositories/acknowledgment-pdfs', () => ({
  createAcknowledgmentPdfRepository: mockCreateAcknowledgmentPdfRepository,
}));

vi.mock('jspdf', () => ({
  default: class MockJsPdf {
    internal = { pageSize: { height: 279.4 } };
    setFillColor() {}
    rect() {}
    setTextColor() {}
    setFontSize() {}
    setFont() {}
    text() {}
    splitTextToSize(value: string) { return [value]; }
    setDrawColor() {}
    setLineWidth() {}
    line() {}
    addPage() {}
    getNumberOfPages() { return 1; }
    setPage() {}
    output() { return new ArrayBuffer(4); }
  },
}));

import { POST } from '@/app/api/org/[orgId]/acknowledgments/[id]/generate-pdf/route';

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateAcknowledgmentPdfRepository.mockReturnValue({
    upload: mockUpload,
    remove: mockRemove,
    createSignedUrl: mockCreateSignedUrl,
  });
  mockUpload.mockResolvedValue('acknowledgments/org-1/letter-1.pdf');
  mockRemove.mockResolvedValue({ data: {}, error: null });
  mockCreateSignedUrl.mockResolvedValue('https://signed.example/document');
});

describe('acknowledgment PDF route', () => {
  it('returns the shared denial before constructing private storage access', async () => {
    mockRequireOrgAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await POST(
      new NextRequest('http://localhost/api/org/org-1/acknowledgments/letter-1/generate-pdf', {
        method: 'POST',
      }),
      { params: Promise.resolve({ orgId: 'org-1', id: 'letter-1' }) }
    );

    expect(response.status).toBe(403);
    expect(mockCreateAcknowledgmentPdfRepository).not.toHaveBeenCalled();
  });

  it('scopes the letter read/update and stores only the private path', async () => {
    const letterQuery = stubQuery(
      { data: null, error: null },
      { single: { data: { id: 'letter-1', body: 'Thank you.' }, error: null } }
    );
    const updateQuery = stubQuery({ data: null, error: null });
    const db = { from: vi.fn()
      .mockReturnValueOnce(letterQuery)
      .mockReturnValueOnce(updateQuery) };
    const context = {
      orgId: 'org-1',
      role: 'member',
      principal: { kind: 'user', userId: 'user-1' },
      user: { id: 'user-1' },
      db,
    };
    mockRequireOrgAccess.mockResolvedValue({ ok: true, context });

    const response = await POST(
      new NextRequest('http://localhost/api/org/org-1/acknowledgments/letter-1/generate-pdf', {
        method: 'POST',
      }),
      { params: Promise.resolve({ orgId: 'org-1', id: 'letter-1' }) }
    );

    expect(mockRequireOrgAccess).toHaveBeenCalledWith('org-1', 'member');
    expect(letterQuery.calls).toContainEqual({ method: 'eq', args: ['id', 'letter-1'] });
    expect(letterQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(mockCreateAcknowledgmentPdfRepository).toHaveBeenCalledWith(context);
    expect(updateQuery.calls).toContainEqual({
      method: 'update',
      args: [{
        storage_path: 'acknowledgments/org-1/letter-1.pdf',
        storage_bucket: 'documents',
      }],
    });
    expect(updateQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', 'org-1'] });
    expect(await response.json()).toEqual({ pdf_url: 'https://signed.example/document' });
  });
});
