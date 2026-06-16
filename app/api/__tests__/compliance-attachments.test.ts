// app/api/__tests__/compliance-attachments.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const ORG_ID    = '11111111-1111-1111-1111-111111111111';
const FILING_ID = '22222222-2222-2222-2222-222222222222';
const USER_ID   = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

let _authUser: { id: string } | null = { id: USER_ID };
let _isAdmin = true;
let _filingData: { id: string; attachments: any[] } | null = {
  id: FILING_ID,
  attachments: [{ path: `${ORG_ID}/${FILING_ID}/file.pdf`, name: 'file.pdf', size: 1024, uploaded_at: '2026-06-13T00:00:00Z' }],
};
let _filingError: { message: string } | null = null;
let _updateError: { message: string } | null = null;
let _storageUploadError: { message: string } | null = null;

const mockUpload = vi.fn();
const mockCreateSignedUrl = vi.fn();
const mockRemove = vi.fn();
const mockAdminFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: vi.fn(async () => ({ data: { user: _authUser } })) },
    rpc: vi.fn(async (fn: string) => {
      if (fn === 'is_org_admin') return { data: _isAdmin, error: null };
      return { data: null, error: null };
    }),
  })),
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
    storage: {
      from: vi.fn(() => ({
        upload: mockUpload,
        createSignedUrl: mockCreateSignedUrl,
        remove: mockRemove,
      })),
    },
  })),
}));

function setupMocks() {
  // Each filing_calendar query uses a chain: .select().eq(id).eq(org_id).single()
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'filing_calendar') {
      let eqChain = {
        single: vi.fn(async () => ({
          data: _filingError ? null : _filingData,
          error: _filingError,
        })),
        eq: vi.fn(() => eqChain),
      };
      return {
        select: vi.fn(() => ({ eq: vi.fn(() => eqChain) })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(async () => ({ error: _updateError })),
          })),
        })),
      };
    }
    return {};
  });

  mockUpload.mockResolvedValue({ data: { path: 'some/path.pdf' }, error: _storageUploadError });
  mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://signed.url/file.pdf' }, error: null });
  mockRemove.mockResolvedValue({ error: null });
}

import { GET, POST, DELETE } from '@/app/api/org/[orgId]/compliance/filing-calendar/[filingId]/attachments/route';

function makeGet(orgId = ORG_ID, filingId = FILING_ID) {
  return new NextRequest(`http://localhost/api/org/${orgId}/compliance/filing-calendar/${filingId}/attachments`);
}
function makeDelete(body: unknown, orgId = ORG_ID, filingId = FILING_ID) {
  return new NextRequest(`http://localhost/api/org/${orgId}/compliance/filing-calendar/${filingId}/attachments`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}
function makeParams(orgId = ORG_ID, filingId = FILING_ID) {
  return { params: Promise.resolve({ orgId, filingId }) } as any;
}

beforeEach(() => {
  _authUser = { id: USER_ID };
  _isAdmin = true;
  _filingData = { id: FILING_ID, attachments: [{ path: `${ORG_ID}/${FILING_ID}/file.pdf`, name: 'file.pdf', size: 1024, uploaded_at: '2026-06-13T00:00:00Z' }] };
  _filingError = null;
  _updateError = null;
  _storageUploadError = null;
  setupMocks();
});

describe('GET /attachments', () => {
  it('returns 401 when unauthenticated', async () => {
    _authUser = null;
    const res = await GET(makeGet(), makeParams());
    expect(res.status).toBe(401);
  });

  it('returns 403 when not admin', async () => {
    _isAdmin = false;
    const res = await GET(makeGet(), makeParams());
    expect(res.status).toBe(403);
  });

  it('returns 404 when filing not found', async () => {
    _filingError = { message: 'Not found' };
    const res = await GET(makeGet(), makeParams());
    expect(res.status).toBe(404);
  });

  it('returns attachments with signed URLs', async () => {
    const res = await GET(makeGet(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].signed_url).toBe('https://signed.url/file.pdf');
    expect(body.data[0].name).toBe('file.pdf');
  });

  it('returns empty array when filing has no attachments', async () => {
    _filingData = { id: FILING_ID, attachments: [] };
    const res = await GET(makeGet(), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(0);
  });
});

describe('POST /attachments', () => {
  it('returns 401 when unauthenticated', async () => {
    _authUser = null;
    const formData = new FormData();
    formData.append('file', new File(['content'], 'test.pdf', { type: 'application/pdf' }));
    const req = new NextRequest(`http://localhost/api/org/${ORG_ID}/compliance/filing-calendar/${FILING_ID}/attachments`, {
      method: 'POST',
      body: formData,
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(401);
  });

  it('returns 403 when not admin', async () => {
    _isAdmin = false;
    const formData = new FormData();
    formData.append('file', new File(['content'], 'test.pdf', { type: 'application/pdf' }));
    const req = new NextRequest(`http://localhost/api/org/${ORG_ID}/compliance/filing-calendar/${FILING_ID}/attachments`, {
      method: 'POST',
      body: formData,
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(403);
  });

  it('returns 400 when no file provided', async () => {
    const formData = new FormData();
    const req = new NextRequest(`http://localhost/api/org/${ORG_ID}/compliance/filing-calendar/${FILING_ID}/attachments`, {
      method: 'POST',
      body: formData,
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(400);
  });

  it('returns 415 for disallowed MIME type', async () => {
    const formData = new FormData();
    formData.append('file', new File(['<html>evil</html>'], 'evil.html', { type: 'text/html' }));
    const req = new NextRequest(`http://localhost/api/org/${ORG_ID}/compliance/filing-calendar/${FILING_ID}/attachments`, {
      method: 'POST',
      body: formData,
    });
    const res = await POST(req, makeParams());
    expect(res.status).toBe(415);
  });
});

describe('DELETE /attachments', () => {
  it('returns 401 when unauthenticated', async () => {
    _authUser = null;
    const res = await DELETE(makeDelete({ path: `${ORG_ID}/${FILING_ID}/file.pdf` }), makeParams());
    expect(res.status).toBe(401);
  });

  it('returns 400 when path is missing', async () => {
    const res = await DELETE(makeDelete({}), makeParams());
    expect(res.status).toBe(400);
  });

  it('returns 404 when attachment path not in filing', async () => {
    const res = await DELETE(makeDelete({ path: 'nonexistent/path.pdf' }), makeParams());
    expect(res.status).toBe(404);
  });

  it('returns 200 and removes attachment from filing', async () => {
    const res = await DELETE(makeDelete({ path: `${ORG_ID}/${FILING_ID}/file.pdf` }), makeParams());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(mockRemove).toHaveBeenCalledWith([`${ORG_ID}/${FILING_ID}/file.pdf`]);
  });
});
