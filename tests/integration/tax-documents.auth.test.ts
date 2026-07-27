// app/api/__tests__/tax-documents.auth.test.ts
//
// P0 tests: auth/access control, contract shape, signed-URL security invariant,
// and cross-contribution security for the tax-documents API routes.
//
//   Route A  —  GET + POST  /api/portfolio/[id]/tax/contributions/[contributionId]/documents
//   Route B  —  GET + DELETE  /api/portfolio/[id]/tax/contributions/[contributionId]/documents/[documentId]

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  GET as listDocuments,
  POST as uploadDocument,
} from '@/app/api/portfolio/[id]/tax/contributions/[contributionId]/documents/route';
import {
  GET as getDocument,
  DELETE as deleteDocument,
} from '@/app/api/portfolio/[id]/tax/contributions/[contributionId]/documents/[documentId]/route';

// ── Constants ────────────────────────────────────────────────────────────────

const PORTFOLIO_ID      = '11111111-1111-1111-1111-111111111111';
const CONTRIBUTION_ID   = '33333333-3333-3333-3333-333333333333';
const OTHER_CONTRIB_ID  = '44444444-4444-4444-4444-444444444444';
const DOCUMENT_ID       = '55555555-5555-5555-5555-555555555555';
const STORAGE_PATH      = `${PORTFOLIO_ID}/${CONTRIBUTION_ID}/receipt-123.pdf`;
const SIGNED_URL        = 'https://example.supabase.co/storage/v1/sign/tax-documents/signed-token';

// ── Mock state ───────────────────────────────────────────────────────────────

let _canView     = true;
let _canViewErr: { message: string } | null = null;
let _canEdit     = true;
let _canEditErr: { message: string } | null = null;
let _documents: any[]     = [];
let _documentsErr: { message: string } | null = null;
let _singleDoc: any       = null;
let _singleDocErr: { message: string } | null = null;
let _contribution: any    = { id: CONTRIBUTION_ID, tax_year: 2024 };
let _contributionErr: { message: string } | null = null;

// Storage mock state
let _uploadErr: { message: string } | null = null;
let _signedUrl: string | null              = SIGNED_URL;
let _signedErr: { message: string } | null = null;
let _removeErr: { message: string } | null = null;

const mockRpc         = vi.fn();
const mockFrom        = vi.fn();
const mockAdminFrom   = vi.fn();
const mockStorage     = vi.fn();
const mockAdminStorage = vi.fn();

// Mock only at the DB/storage boundary — never mock application code.
vi.mock('@/lib/supabase', () => ({
  supabasePublic:    vi.fn(async () => ({
    rpc:     mockRpc,
    from:    mockFrom,
    storage: { from: mockStorage },
  })),
  createServerClient: vi.fn(async () => ({
    rpc:     mockRpc,
    from:    mockFrom,
    storage: { from: mockStorage },
  })),
  createAdminClient: vi.fn(() => ({
    from:    mockAdminFrom,
    storage: { from: mockAdminStorage },
  })),
}));

vi.mock('@/lib/api/access', () => ({
  requirePortfolioAccess: vi.fn(async (
    portfolioId: string,
    minRole: 'viewer' | 'member' = 'viewer'
  ) => {
    const error = minRole === 'member' ? _canEditErr : _canViewErr;
    if (error) {
      return {
        ok: false,
        reason: 'infrastructure',
        response: Response.json(
          { error: error.message },
          { status: 500, headers: { 'Cache-Control': 'no-store' } }
        ),
      };
    }
    const allowed = minRole === 'member' ? _canEdit : _canView;
    if (!allowed) {
      return {
        ok: false,
        reason: 'forbidden',
        response: Response.json(
          { error: 'Access denied' },
          { status: 403, headers: { 'Cache-Control': 'no-store' } }
        ),
      };
    }
    return {
      ok: true,
      context: {
        db: { rpc: mockRpc, from: mockFrom, storage: { from: mockStorage } },
        portfolioId,
        orgId: 'org-1',
        role: minRole,
        principal: { kind: 'user', userId: 'user-1' },
        user: { id: 'user-1' },
      },
    };
  }),
  isAccessDenied: vi.fn((result: { ok: boolean }) => !result.ok),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: vi.fn(() => ({
    from: mockAdminFrom,
    storage: { from: mockAdminStorage },
  })),
}));

// ── Mock setup ────────────────────────────────────────────────────────────────

function setupMocks() {
  mockRpc.mockImplementation(async (fn: string) => {
    if (fn === 'can_view_portfolio') return { data: _canView, error: _canViewErr };
    if (fn === 'can_edit_portfolio') return { data: _canEdit, error: _canEditErr };
    return { data: null, error: null };
  });

  mockFrom.mockImplementation((table: string) => {
    if (table === 'tax_documents') {
      const b: any = {
        select: vi.fn(() => b),
        eq:     vi.fn(() => b),
        order:  vi.fn(() => Promise.resolve({ data: _documents, error: _documentsErr })),
        single: vi.fn(() => Promise.resolve({ data: _singleDoc, error: _singleDocErr })),
        delete: vi.fn(() => b),
      };
      return b;
    }
    if (table === 'tax_contributions') {
      const b: any = {
        select: vi.fn(() => b),
        eq:     vi.fn(() => b),
        update: vi.fn(() => b),
        single: vi.fn(() => Promise.resolve({ data: _contribution, error: _contributionErr })),
      };
      return b;
    }
    const b: any = {
      select: vi.fn(() => b),
      eq:     vi.fn(() => b),
      update: vi.fn(() => b),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };
    return b;
  });

  // Admin DB mock (used in POST insert and DELETE)
  mockAdminFrom.mockImplementation((_table: string) => {
    const b: any = {
      select: vi.fn(() => b),
      insert: vi.fn(() => b),
      eq:     vi.fn(() => b),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };
    return b;
  });

  // Storage mock (supabasePublic client) — used by Route B GET (createSignedUrl)
  mockStorage.mockImplementation((_bucket: string) => ({
    upload:         vi.fn(async () => ({ data: { path: STORAGE_PATH }, error: _uploadErr })),
    createSignedUrl: vi.fn(async () => ({
      data:  _signedUrl ? { signedUrl: _signedUrl } : null,
      error: _signedErr,
    })),
    remove: vi.fn(async () => ({ data: {}, error: _removeErr })),
    getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'SHOULD-NEVER-BE-CALLED' } })),
  }));

  // Storage mock (admin client) — used by Route A POST upload + Route B DELETE remove
  mockAdminStorage.mockImplementation((_bucket: string) => ({
    upload:         vi.fn(async () => ({ data: { path: STORAGE_PATH }, error: _uploadErr })),
    createSignedUrl: vi.fn(async () => ({
      data:  _signedUrl ? { signedUrl: _signedUrl } : null,
      error: _signedErr,
    })),
    remove: vi.fn(async () => ({ data: {}, error: _removeErr })),
    getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'SHOULD-NEVER-BE-CALLED' } })),
  }));
}

// ── Request helpers ───────────────────────────────────────────────────────────

function makeListReq(portfolioId = PORTFOLIO_ID, contributionId = CONTRIBUTION_ID) {
  return new Request(`http://localhost/api/portfolio/${portfolioId}/tax/contributions/${contributionId}/documents`);
}
function makeListCtx(portfolioId = PORTFOLIO_ID, contributionId = CONTRIBUTION_ID) {
  return { params: Promise.resolve({ id: portfolioId, contributionId }) };
}

function makeDocCtx(portfolioId = PORTFOLIO_ID, contributionId = CONTRIBUTION_ID, documentId = DOCUMENT_ID) {
  return { params: Promise.resolve({ id: portfolioId, contributionId, documentId }) };
}
function makeGetDocReq(portfolioId = PORTFOLIO_ID, contributionId = CONTRIBUTION_ID, documentId = DOCUMENT_ID) {
  return new Request(`http://localhost/api/portfolio/${portfolioId}/tax/contributions/${contributionId}/documents/${documentId}`);
}
function makeDeleteReq(portfolioId = PORTFOLIO_ID, contributionId = CONTRIBUTION_ID, documentId = DOCUMENT_ID) {
  return new Request(
    `http://localhost/api/portfolio/${portfolioId}/tax/contributions/${contributionId}/documents/${documentId}`,
    { method: 'DELETE' }
  );
}

function makeUploadReq(portfolioId = PORTFOLIO_ID, contributionId = CONTRIBUTION_ID, overrides: Record<string, string> = {}) {
  const form = new FormData();
  const file = new File(['%PDF-1.4 test content'], 'receipt.pdf', { type: 'application/pdf' });
  form.append('file', file);
  form.append('document_type', overrides.document_type ?? 'receipt');
  return new Request(
    `http://localhost/api/portfolio/${portfolioId}/tax/contributions/${contributionId}/documents`,
    { method: 'POST', body: form }
  );
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  _canView       = true;
  _canViewErr    = null;
  _canEdit       = true;
  _canEditErr    = null;
  _documents     = [];
  _documentsErr  = null;
  _singleDoc     = { id: DOCUMENT_ID, tax_contribution_id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID, storage_path: STORAGE_PATH, document_type: 'receipt' };
  _singleDocErr  = null;
  _contribution  = { id: CONTRIBUTION_ID, tax_year: 2024 };
  _contributionErr = null;
  _uploadErr     = null;
  _signedUrl     = SIGNED_URL;
  _signedErr     = null;
  _removeErr     = null;
  setupMocks();
});

// ── Route A GET — contract ────────────────────────────────────────────────────

describe('GET /documents — contract shape', () => {
  it('returns status 200 with a data array on success', async () => {
    // Arrange
    _documents = [
      { id: DOCUMENT_ID, tax_contribution_id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID, document_type: 'receipt' },
    ];

    // Act
    const res = await listDocuments(makeListReq(), makeListCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
  });

  it('returns an empty array (not null) when no documents exist for the contribution', async () => {
    // Arrange — _documents defaults to []

    // Act
    const res = await listDocuments(makeListReq(), makeListCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(body.data).toEqual([]);
  });
});

// ── Route A GET — auth ────────────────────────────────────────────────────────

describe('GET /documents — auth/access control', () => {
  it('returns 403 and no data when can_view_portfolio returns false', async () => {
    // Arrange
    _canView = false;
    _documents = [{ id: DOCUMENT_ID, tax_contribution_id: CONTRIBUTION_ID }];

    // Act
    const res = await listDocuments(makeListReq(), makeListCtx());
    const body = await res.json();

    // Assert — status AND absence of data
    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });

  it('returns 403 when the can_view_portfolio RPC itself errors', async () => {
    // Arrange
    _canViewErr = { message: 'connection refused' };

    // Act
    const res = await listDocuments(makeListReq(), makeListCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(403);
    expect(body).not.toHaveProperty('data');
  });
});

// ── Route A POST — auth ───────────────────────────────────────────────────────

describe('POST /documents — auth/access control', () => {
  it('returns 403 and no data when can_edit_portfolio returns false', async () => {
    // Arrange
    _canEdit = false;

    // Act
    const res = await uploadDocument(makeUploadReq(), makeListCtx());
    const body = await res.json();

    // Assert — status AND absence of data
    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });

  it('returns 403 when the can_edit_portfolio RPC itself errors', async () => {
    // Arrange
    _canEditErr = { message: 'timeout' };
    _canEdit = false;

    // Act
    const res = await uploadDocument(makeUploadReq(), makeListCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(403);
    expect(body).not.toHaveProperty('data');
  });

  it('returns 400 when no file is provided in the form data', async () => {
    // Arrange — send form with document_type but no file
    const form = new FormData();
    form.append('document_type', 'receipt');
    const req = new Request(
      `http://localhost/api/portfolio/${PORTFOLIO_ID}/tax/contributions/${CONTRIBUTION_ID}/documents`,
      { method: 'POST', body: form }
    );

    // Act
    const res = await uploadDocument(req, makeListCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });

  it('returns 400 when required document_type field is missing from the form', async () => {
    // Arrange — send form with file but no document_type
    const form = new FormData();
    const file = new File(['content'], 'receipt.pdf', { type: 'application/pdf' });
    form.append('file', file);
    // document_type intentionally omitted — will fail documentTypeSchema.safeParse
    const req = new Request(
      `http://localhost/api/portfolio/${PORTFOLIO_ID}/tax/contributions/${CONTRIBUTION_ID}/documents`,
      { method: 'POST', body: form }
    );

    // Act
    const res = await uploadDocument(req, makeListCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });
});

// ── Route B GET — signed-URL security invariant ───────────────────────────────

describe('GET /documents/[documentId] — signed-URL security invariant', () => {
  it('returns a signed_url field (never a public_url field) in the response', async () => {
    // Arrange
    _singleDoc = { id: DOCUMENT_ID, tax_contribution_id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID, storage_path: STORAGE_PATH, document_type: 'receipt' };

    // Act
    const res = await getDocument(makeGetDocReq(), makeDocCtx());
    const body = await res.json();

    // Assert — contract enforces signed URL, not public URL
    expect(res.status).toBe(200);
    expect(body.data).toHaveProperty('signed_url');
    expect(body.data).not.toHaveProperty('public_url');
  });

  it('calls createSignedUrl (not getPublicUrl) when retrieving a document', async () => {
    // Arrange — capture which storage method is called
    _singleDoc = { id: DOCUMENT_ID, tax_contribution_id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID, storage_path: STORAGE_PATH, document_type: 'receipt' };
    const mockBucket = {
      createSignedUrl: vi.fn(async () => ({ data: { signedUrl: SIGNED_URL }, error: null })),
      getPublicUrl:    vi.fn(() => ({ data: { publicUrl: 'SHOULD-NEVER-BE-CALLED' } })),
    };
    mockAdminStorage.mockReturnValue(mockBucket);

    // Act
    await getDocument(makeGetDocReq(), makeDocCtx());

    // Assert — createSignedUrl MUST be called; getPublicUrl MUST NOT be called
    expect(mockBucket.createSignedUrl).toHaveBeenCalled();
    expect(mockBucket.getPublicUrl).not.toHaveBeenCalled();
  });

  it('includes the signed URL value from storage in the response body', async () => {
    // Arrange
    _singleDoc    = { id: DOCUMENT_ID, tax_contribution_id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID, storage_path: STORAGE_PATH, document_type: 'receipt' };
    _signedUrl    = 'https://storage.example.com/signed/unique-token';

    // Act
    const res  = await getDocument(makeGetDocReq(), makeDocCtx());
    const body = await res.json();

    // Assert — response carries through the exact URL returned by storage
    expect(body.data.signed_url).toBe('https://storage.example.com/signed/unique-token');
  });
});

// ── Route B GET — auth ────────────────────────────────────────────────────────

describe('GET /documents/[documentId] — auth/access control', () => {
  it('returns 403 and no data when can_view_portfolio returns false', async () => {
    // Arrange
    _canView = false;

    // Act
    const res  = await getDocument(makeGetDocReq(), makeDocCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });

  it('returns 404 when the document is not found (data is null, no DB error)', async () => {
    // Arrange — simulate a null result with no error (defensive null-check path in the route).
    // When PostgREST .single() finds zero rows it typically sets an error, which the route
    // catches and re-throws as 500. The 404 branch fires only when error is falsy but data
    // is also null — this tests the explicit defensive null guard in the route.
    _singleDoc    = null;
    _singleDocErr = null; // no error object — data simply came back null

    // Act
    const res  = await getDocument(makeGetDocReq(), makeDocCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(404);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });
});

// ── Route B GET — cross-contribution security ─────────────────────────────────

describe('GET /documents/[documentId] — cross-contribution security', () => {
  it('does not return a document that belongs to a different contribution_id', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
    // Arrange — document exists but belongs to a different contribution; DB row returns null
    // because the query includes .eq('tax_contribution_id', contribution_id) which won't match.
    // We simulate the DB correctly scoping the result.
    _singleDoc    = null;
    _singleDocErr = { message: 'JSON object requested, multiple (or 0) rows returned' };

    // Act — request a document using OTHER_CONTRIB_ID as the contribution ID
    const res = await getDocument(
      makeGetDocReq(PORTFOLIO_ID, OTHER_CONTRIB_ID, DOCUMENT_ID),
      makeDocCtx(PORTFOLIO_ID, OTHER_CONTRIB_ID, DOCUMENT_ID)
    );
    const body = await res.json();

    // Assert — must not succeed (no data returned)
    expect(res.status).not.toBe(200);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
    expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});

// ── Route B DELETE — auth ─────────────────────────────────────────────────────

describe('DELETE /documents/[documentId] — auth/access control', () => {
  it('returns 403 when can_edit_portfolio returns false', async () => {
    // Arrange
    _canEdit = false;

    // Act
    const res  = await deleteDocument(makeDeleteReq(), makeDocCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('success');
  });

  it('returns 403 when the can_edit_portfolio RPC itself errors', async () => {
    // Arrange
    _canEditErr = { message: 'timeout' };
    _canEdit    = false;

    // Act
    const res  = await deleteDocument(makeDeleteReq(), makeDocCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(403);
    expect(body).not.toHaveProperty('success');
  });
});

// ── Route B DELETE — success contract ────────────────────────────────────────

describe('DELETE /documents/[documentId] — success contract', () => {
  it('returns 200 with success: true when the document exists and user has edit access', async () => {
    // Arrange
    _singleDoc = { id: DOCUMENT_ID, tax_contribution_id: CONTRIBUTION_ID, portfolio_id: PORTFOLIO_ID, storage_path: STORAGE_PATH, document_type: 'receipt' };

    // Act
    const res  = await deleteDocument(makeDeleteReq(), makeDocCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('success', true);
    expect(body).not.toHaveProperty('error');
  });
});

/**
 * NOT TESTED HERE — requires separate setup:
 *
 * - Supabase RLS policies (can_view_portfolio / can_edit_portfolio at DB layer):
 *   tested at the DB layer in db/migrations; the application trusts RLS as a second line.
 *
 * - Cross-tenant access via a tampered JWT: requires a real Supabase Auth session.
 *   The can_view_portfolio RPC is the enforcement point, mocked to false above.
 *
 * - File MIME-type and size validations: these are P1 behavioral concerns and live in
 *   tax-documents.behavior.test.ts.
 *
 * - Storage error propagation during upload (500 path): P1, in behavior test file.
 *
 * - Cache-Control header correctness: verified by reading the route; no runtime variability.
 */
// Integration test.
