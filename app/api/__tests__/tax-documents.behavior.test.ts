// app/api/__tests__/tax-documents.behavior.test.ts
//
// P1 tests: upload validation, document_type enum, file-size / MIME guards,
// storage error propagation, and delete DB-error paths.
//
//   Route A  —  POST  /api/portfolio/[id]/tax/contributions/[contributionId]/documents
//   Route B  —  GET + DELETE  /api/portfolio/[id]/tax/contributions/[contributionId]/documents/[documentId]

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  POST as uploadDocument,
} from '@/app/api/portfolio/[id]/tax/contributions/[contributionId]/documents/route';
import {
  GET as getDocument,
  DELETE as deleteDocument,
} from '@/app/api/portfolio/[id]/tax/contributions/[contributionId]/documents/[documentId]/route';

// ── Constants ─────────────────────────────────────────────────────────────────

const PORTFOLIO_ID    = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONTRIBUTION_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const DOCUMENT_ID     = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
const STORAGE_PATH    = `${PORTFOLIO_ID}/${CONTRIBUTION_ID}/receipt-999.pdf`;
const SIGNED_URL      = 'https://example.supabase.co/storage/v1/sign/tax-documents/abc123';

// ── Mock state ────────────────────────────────────────────────────────────────

let _canEdit     = true;
let _canView     = true;
let _contribution: any = { id: CONTRIBUTION_ID, tax_year: 2024 };
let _contributionErr: { message: string } | null = null;
let _singleDoc: any       = null;
let _singleDocErr: { message: string } | null = null;
let _insertResult: any    = { id: DOCUMENT_ID, portfolio_id: PORTFOLIO_ID, tax_contribution_id: CONTRIBUTION_ID, storage_path: STORAGE_PATH, document_type: 'receipt' };
let _insertErr: { message: string } | null  = null;
let _deleteErr: { message: string } | null  = null;

// Storage mock state
let _uploadErr: { message: string } | null  = null;
let _signedUrl: string | null               = SIGNED_URL;
let _signedErr: { message: string } | null  = null;
let _removeErr: { message: string } | null  = null;

const mockRpc          = vi.fn();
const mockFrom         = vi.fn();
const mockAdminFrom    = vi.fn();
const mockStorage      = vi.fn();
const mockAdminStorage = vi.fn();

// Mock only at the DB/storage boundary — never mock application code.
vi.mock('@/lib/supabase', () => ({
  supabasePublic:     vi.fn(async () => ({
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

// ── Mock setup ────────────────────────────────────────────────────────────────

function setupMocks() {
  mockRpc.mockImplementation(async (fn: string) => {
    if (fn === 'can_view_portfolio') return { data: _canView,  error: null };
    if (fn === 'can_edit_portfolio') return { data: _canEdit,  error: null };
    return { data: null, error: null };
  });

  mockFrom.mockImplementation((table: string) => {
    if (table === 'tax_contributions') {
      const b: any = {
        select: vi.fn(() => b),
        eq:     vi.fn(() => b),
        update: vi.fn(() => b),
        single: vi.fn(() => Promise.resolve({ data: _contribution, error: _contributionErr })),
      };
      return b;
    }
    if (table === 'tax_documents') {
      const b: any = {
        select: vi.fn(() => b),
        eq:     vi.fn(() => b),
        insert: vi.fn(() => b),
        delete: vi.fn(() => b),
        order:  vi.fn(() => Promise.resolve({ data: [], error: null })),
        single: vi.fn(() => Promise.resolve({ data: _singleDoc, error: _singleDocErr })),
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

  // Admin DB mock — handles tax_documents insert in POST and delete in DELETE
  mockAdminFrom.mockImplementation((table: string) => {
    if (table === 'tax_documents') {
      const b: any = {
        insert: vi.fn(() => b),
        delete: vi.fn(() => b),
        eq:     vi.fn(() => b),
        select: vi.fn(() => b),
        single: vi.fn(() => Promise.resolve({ data: _insertResult, error: _insertErr })),
      };
      return b;
    }
    const b: any = {
      insert: vi.fn(() => b),
      select: vi.fn(() => b),
      eq:     vi.fn(() => b),
      single: vi.fn(() => Promise.resolve({ data: null, error: null })),
    };
    return b;
  });

  // Storage mock: supabasePublic (used by Route B GET)
  mockStorage.mockImplementation((_bucket: string) => ({
    createSignedUrl: vi.fn(async () => ({
      data:  _signedUrl ? { signedUrl: _signedUrl } : null,
      error: _signedErr,
    })),
    getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'SHOULD-NEVER-BE-CALLED' } })),
  }));

  // Storage mock: admin client (used by Route A POST upload + Route B DELETE remove)
  mockAdminStorage.mockImplementation((_bucket: string) => ({
    upload: vi.fn(async () => ({ data: { path: STORAGE_PATH }, error: _uploadErr })),
    createSignedUrl: vi.fn(async () => ({
      data:  _signedUrl ? { signedUrl: _signedUrl } : null,
      error: _signedErr,
    })),
    remove: vi.fn(async () => ({ data: {}, error: _removeErr })),
    getPublicUrl: vi.fn(() => ({ data: { publicUrl: 'SHOULD-NEVER-BE-CALLED' } })),
  }));
}

// ── Request helpers ───────────────────────────────────────────────────────────

function makeListCtx(portfolioId = PORTFOLIO_ID, contributionId = CONTRIBUTION_ID) {
  return { params: Promise.resolve({ id: portfolioId, contributionId }) };
}
function makeDocCtx(portfolioId = PORTFOLIO_ID, contributionId = CONTRIBUTION_ID, documentId = DOCUMENT_ID) {
  return { params: Promise.resolve({ id: portfolioId, contributionId, documentId }) };
}
function makeGetDocReq() {
  return new Request(`http://localhost/api/portfolio/${PORTFOLIO_ID}/tax/contributions/${CONTRIBUTION_ID}/documents/${DOCUMENT_ID}`);
}
function makeDeleteReq() {
  return new Request(
    `http://localhost/api/portfolio/${PORTFOLIO_ID}/tax/contributions/${CONTRIBUTION_ID}/documents/${DOCUMENT_ID}`,
    { method: 'DELETE' }
  );
}

function makeUploadReq(overrides: { document_type?: string; fileType?: string; fileSize?: number } = {}) {
  const form = new FormData();
  const content = overrides.fileSize
    ? 'x'.repeat(overrides.fileSize)
    : 'PDF content here';
  const file = new File([content], 'doc.pdf', { type: overrides.fileType ?? 'application/pdf' });
  form.append('file', file);
  if (overrides.document_type !== undefined) {
    form.append('document_type', overrides.document_type);
  } else {
    form.append('document_type', 'receipt');
  }
  return new Request(
    `http://localhost/api/portfolio/${PORTFOLIO_ID}/tax/contributions/${CONTRIBUTION_ID}/documents`,
    { method: 'POST', body: form }
  );
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  _canEdit       = true;
  _canView       = true;
  _contribution  = { id: CONTRIBUTION_ID, tax_year: 2024 };
  _contributionErr = null;
  _singleDoc     = {
    id: DOCUMENT_ID,
    tax_contribution_id: CONTRIBUTION_ID,
    portfolio_id: PORTFOLIO_ID,
    storage_path: STORAGE_PATH,
    document_type: 'receipt',
  };
  _singleDocErr  = null;
  _insertResult  = {
    id: DOCUMENT_ID,
    portfolio_id: PORTFOLIO_ID,
    tax_contribution_id: CONTRIBUTION_ID,
    storage_path: STORAGE_PATH,
    document_type: 'receipt',
  };
  _insertErr     = null;
  _deleteErr     = null;
  _uploadErr     = null;
  _signedUrl     = SIGNED_URL;
  _signedErr     = null;
  _removeErr     = null;
  setupMocks();
});

// ── POST: document_type enum validation ───────────────────────────────────────

describe('POST /documents — document_type enum validation', () => {
  it('returns 400 when document_type is not a recognized enum value', async () => {
    // Arrange — "invoice" is not in the canonical 7-value enum
    const req = makeUploadReq({ document_type: 'invoice' });

    // Act
    const res  = await uploadDocument(req, makeListCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });

  it('returns 400 when document_type is the old "bank_statement" value (not in canonical enum)', async () => {
    // Arrange
    const req = makeUploadReq({ document_type: 'bank_statement' });

    // Act
    const res  = await uploadDocument(req, makeListCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });

  it('accepts all 7 valid document_type values without returning 400', async () => {
    // Arrange — test each canonical value; all should proceed past type validation
    const validTypes = ['receipt', 'acknowledgment', 'appraisal', 'form_8283', 'schedule_a', 'summary_report', 'other'];

    for (const docType of validTypes) {
      // Act
      const res = await uploadDocument(makeUploadReq({ document_type: docType }), makeListCtx());

      // Assert — must not be a 400 type-validation rejection
      // (may fail at DB layer but not at enum validation)
      expect(res.status).not.toBe(400);
    }
  });
});

// ── POST: MIME type validation ────────────────────────────────────────────────

describe('POST /documents — MIME type validation', () => {
  it('returns 400 when the uploaded file has a disallowed MIME type', async () => {
    // Arrange — .docx is not in the allowed list
    const req = makeUploadReq({ fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });

    // Act
    const res  = await uploadDocument(req, makeListCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
    expect(body.error).toMatch(/not allowed|file type/i);
  });

  it('returns 400 when the uploaded file is a plain text file', async () => {
    // Arrange
    const req = makeUploadReq({ fileType: 'text/plain' });

    // Act
    const res  = await uploadDocument(req, makeListCtx());

    // Assert
    expect(res.status).toBe(400);
  });

  it('accepts application/pdf without a MIME-type rejection', async () => {
    // Arrange
    const req = makeUploadReq({ fileType: 'application/pdf' });

    // Act
    const res = await uploadDocument(req, makeListCtx());

    // Assert — must not 400 due to MIME type
    expect(res.status).not.toBe(400);
  });
});

// ── POST: file-size validation ────────────────────────────────────────────────

describe('POST /documents — file size validation', () => {
  it('returns 400 when the uploaded file exceeds the 10 MB size limit', async () => {
    // Arrange — 10 MB + 1 byte exceeds the limit
    const elevenMB = 10 * 1024 * 1024 + 1;
    const req = makeUploadReq({ fileSize: elevenMB });

    // Act
    const res  = await uploadDocument(req, makeListCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
    expect(body.error).toMatch(/10MB|size/i);
  });
});

// ── POST: storage error propagation ──────────────────────────────────────────

describe('POST /documents — storage error propagation', () => {
  it('returns 500 when the storage upload call fails', async () => {
    // Arrange
    _uploadErr = { message: 'S3 bucket quota exceeded' };

    // Act
    const res  = await uploadDocument(makeUploadReq(), makeListCtx());
    const body = await res.json();

    // Assert — storage error surfaces as 500, not swallowed
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });

  it('returns 500 when createSignedUrl fails after a successful upload', async () => {
    // Arrange — upload succeeds but signed-URL generation fails
    _uploadErr = null;
    _signedUrl = null;
    _signedErr = { message: 'token generation failed' };

    // Act
    const res  = await uploadDocument(makeUploadReq(), makeListCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });
});

// ── Route B GET: DB error propagation ────────────────────────────────────────

describe('GET /documents/[documentId] — DB error propagation', () => {
  it('returns 500 when the DB query for the document record errors', async () => {
    // Arrange — simulate a DB-level error fetching the document
    _singleDoc    = null;
    _singleDocErr = { message: 'connection to server on socket "/run/postgresql/.s.PGSQL.5432" failed' };

    // Act
    const res  = await getDocument(makeGetDocReq(), makeDocCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });
});

// ── Route B DELETE: storage remove error propagation ─────────────────────────

describe('DELETE /documents/[documentId] — storage error handling', () => {
  it('continues to delete the database record even when storage remove returns an error', async () => {
    // Arrange — route comments state it continues anyway on storage error
    _singleDoc = {
      id: DOCUMENT_ID,
      tax_contribution_id: CONTRIBUTION_ID,
      portfolio_id: PORTFOLIO_ID,
      storage_path: STORAGE_PATH,
      document_type: 'receipt',
    };
    _removeErr = { message: 'storage object not found' };

    // Act
    const res = await deleteDocument(makeDeleteReq(), makeDocCtx());

    // Assert — route intentionally continues; verify it does not 500 due to storage error alone
    // The route proceeds to delete the DB record; as long as that succeeds, it returns 200.
    expect(res.status).toBe(200);
  });
});

// ── Route B DELETE: 404 when document not found ───────────────────────────────

describe('DELETE /documents/[documentId] — document not found', () => {
  it('returns 404 when the document to be deleted does not exist in the database', async () => {
    // Arrange
    _singleDoc    = null;
    _singleDocErr = { message: 'JSON object requested, multiple (or 0) rows returned' };

    // Act
    const res  = await deleteDocument(makeDeleteReq(), makeDocCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(404);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('success');
  });
});

/**
 * NOT TESTED HERE — requires separate setup:
 *
 * - Supabase RLS policies (DB-layer enforcement): tested in db/migrations integration tests.
 *
 * - Auth/access control (403 paths): covered in tax-documents.auth.test.ts.
 *
 * - File exactly at 10 MB boundary: the route uses strict `> MAX_FILE_SIZE`; a file
 *   of exactly 10 MB is accepted. This edge case belongs in a schema/unit test.
 *
 * - Storage cleanup rollback when the DB insert fails after a successful upload:
 *   the route calls sb.storage.remove([storagePath]) on db-insert error; confirming
 *   that specific cleanup flow requires a real Supabase integration test.
 *
 * - Clearing receipt_storage_path / acknowledgment_storage_path on contribution after
 *   deletion: the route conditionally updates tax_contributions; integration test concern.
 *
 * - getStoragePathField mapping for all document types: a pure function; tested directly
 *   as a unit test if extracted, or via integration.
 */
