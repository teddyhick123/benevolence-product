// app/api/__tests__/cpa-share.test.ts
//
// Full test suite for GET / POST / PATCH / DELETE
// /api/portfolio/[id]/tax/cpa-share
//
// P0 + P1 coverage: auth, contract, security invariants, error propagation.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GET, POST, PATCH, DELETE } from '@/app/api/portfolio/[id]/tax/cpa-share/route';

// ── Constants ─────────────────────────────────────────────────────────────────

const PORTFOLIO_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ORG_ID       = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const SHARE_LINK_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

// ── Mock state ────────────────────────────────────────────────────────────────

let _canEdit = true;
let _canEditError: { message: string } | null = null;
let _shareLinks: any[] = [];
let _shareLinksError: { message: string } | null = null;
let _insertResult: any = null;
let _insertError: { message: string } | null = null;
let _revokeError: { message: string } | null = null;
let _capturedInsertArgs: any = null;

const mockRpc = vi.fn();
const mockFrom = vi.fn();

// Mock only at the DB boundary — never mock application code.
vi.mock('@/lib/api/server-client', () => ({
  supabasePublic: vi.fn(async () => ({ rpc: mockRpc, from: mockFrom })),
}));

vi.mock('@/lib/api/access', () => ({
  requirePortfolioAccess: vi.fn(async (portfolioId: string) => {
    if (_canEditError) {
      return {
        ok: false,
        reason: 'infrastructure',
        response: Response.json(
          { error: _canEditError.message },
          { status: 500, headers: { 'Cache-Control': 'no-store' } }
        ),
      };
    }
    if (!_canEdit) {
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
        db: { rpc: mockRpc, from: mockFrom },
        portfolioId,
        orgId: ORG_ID,
        role: 'member',
        principal: { kind: 'user', userId: 'user-1' },
        user: { id: 'user-1' },
      },
    };
  }),
  isAccessDenied: vi.fn((result: { ok: boolean }) => !result.ok),
}));

function setupMocks() {
  mockRpc.mockImplementation(async (fn: string) => {
    if (fn === 'can_edit_portfolio') return { data: _canEdit, error: _canEditError };
    if (fn === 'revoke_share_link')  return { data: null,    error: _revokeError };
    return { data: null, error: null };
  });

  mockFrom.mockImplementation((table: string) => {
    if (table === 'cpa_share_links') {
      // GET path:  .select().eq().order()  → resolves to { data, error }
      // POST path: .insert(args).select().single() → resolves to { data, error }
      const b: any = {
        select: vi.fn(() => b),
        eq:     vi.fn(() => b),
        order:  vi.fn(() => Promise.resolve({ data: _shareLinks, error: _shareLinksError })),
        insert: vi.fn((args: any) => { _capturedInsertArgs = args; return b; }),
        single: vi.fn(() => Promise.resolve({ data: _insertResult, error: _insertError })),
      };
      return b;
    }
    if (table === 'portfolios') {
      const b: any = {
        select: vi.fn(() => b),
        eq:     vi.fn(() => b),
        single: vi.fn(() => Promise.resolve({ data: { org_id: ORG_ID }, error: null })),
      };
      return b;
    }
    return {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      single: vi.fn(async () => ({ data: null, error: null })),
    };
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCtx(portfolioId = PORTFOLIO_ID) {
  return { params: Promise.resolve({ id: portfolioId }) };
}

function makeGetRequest(portfolioId = PORTFOLIO_ID): Request {
  return new Request(`http://localhost/api/portfolio/${portfolioId}/tax/cpa-share`);
}

function makePostRequest(portfolioId = PORTFOLIO_ID, body: Record<string, unknown>): Request {
  return new Request(`http://localhost/api/portfolio/${portfolioId}/tax/cpa-share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function makeRevokeRequest(method: 'PATCH' | 'DELETE', portfolioId = PORTFOLIO_ID, shareLinkId?: string): Request {
  const base = `http://localhost/api/portfolio/${portfolioId}/tax/cpa-share`;
  const url  = shareLinkId ? `${base}?share_link_id=${shareLinkId}` : base;
  return new Request(url, { method });
}

const VALID_POST_BODY = {
  cpa_name:   'Jane CPA',
  cpa_email:  'jane@cpafirm.com',
  cpa_firm:   'CPA Firm LLC',
  tax_years:  [2023, 2024],
  expiration: '30days' as const,
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com');
  _canEdit      = true;
  _canEditError = null;
  _shareLinks   = [];
  _shareLinksError = null;
  _insertResult = {
    id:           SHARE_LINK_ID,
    portfolio_id: PORTFOLIO_ID,
    org_id:       ORG_ID,
    cpa_name:     'Jane CPA',
    cpa_email:    'jane@cpafirm.com',
    cpa_firm:     'CPA Firm LLC',
    tax_years:    [2023, 2024],
    permissions:  {},
    expires_at:   null,
    max_accesses: null,
    access_count: 0,
    revoked_at:   null,
    created_by:   null,
    notes:        null,
    created_at:   new Date().toISOString(),
    updated_at:   new Date().toISOString(),
  };
  _insertError   = null;
  _revokeError   = null;
  _capturedInsertArgs = null;
  setupMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

// ── GET: Auth & Access Control ────────────────────────────────────────────────

describe('GET /api/portfolio/[id]/tax/cpa-share — auth', () => {
  it('returns 403 and no data when can_edit_portfolio returns false', async () => {
    // Arrange
    _canEdit    = false;
    _shareLinks = [{ id: SHARE_LINK_ID }];

    // Act
    const res  = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert — status AND absence of sensitive data
    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });

  it('returns 403 when the can_edit_portfolio RPC itself errors', async () => {
    // Arrange
    _canEditError = { message: 'connection refused' };

    // Act
    const res  = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(403);
    expect(body).not.toHaveProperty('data');
  });
});

// ── GET: Contract ─────────────────────────────────────────────────────────────

describe('GET /api/portfolio/[id]/tax/cpa-share — contract', () => {
  it('returns { data: [] } when no share links exist for the portfolio', async () => {
    // Arrange — _shareLinks defaults to []

    // Act
    const res  = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(body).toHaveProperty('data');
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data).toHaveLength(0);
  });

  it('returns 500 when the cpa_share_links DB query errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
    // Arrange
    _shareLinksError = { message: 'relation "cpa_share_links" does not exist' };
    _shareLinks      = null as any;

    // Act
    const res  = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert — error is surfaced, not swallowed
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
    expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});

// ── POST: Auth & Access Control ───────────────────────────────────────────────

describe('POST /api/portfolio/[id]/tax/cpa-share — auth', () => {
  it('returns 403 and no data when can_edit_portfolio returns false', async () => {
    // Arrange
    _canEdit = false;

    // Act
    const res  = await POST(makePostRequest(PORTFOLIO_ID, VALID_POST_BODY), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });
});

// ── POST: Validation ──────────────────────────────────────────────────────────

describe('POST /api/portfolio/[id]/tax/cpa-share — validation', () => {
  it('returns 400 when tax_years is an empty array', async () => {
    // Arrange
    const body = { ...VALID_POST_BODY, tax_years: [] };

    // Act
    const res  = await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());
    const json = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(json).toHaveProperty('error');
    expect(json).not.toHaveProperty('data');
  });

  it('returns 400 when tax_years is missing entirely', async () => {
    // Arrange — omit tax_years from body
    const { tax_years: _omitted, ...bodyWithoutYears } = VALID_POST_BODY;

    // Act
    const res  = await POST(makePostRequest(PORTFOLIO_ID, bodyWithoutYears), makeCtx());
    const json = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(json).not.toHaveProperty('data');
  });
});

// ── POST: Portfolio not found ─────────────────────────────────────────────────

describe('POST /api/portfolio/[id]/tax/cpa-share — portfolio lookup', () => {
  it('returns 404 when the portfolio row does not exist', async () => {
    // Arrange — override the portfolios mock to return null
    mockFrom.mockImplementation((table: string) => {
      if (table === 'portfolios') {
        const b: any = {
          select: vi.fn(() => b),
          eq:     vi.fn(() => b),
          single: vi.fn(() => Promise.resolve({ data: null, error: { message: 'not found' } })),
        };
        return b;
      }
      // Other tables unchanged
      if (table === 'cpa_share_links') {
        const b: any = {
          select: vi.fn(() => b),
          eq:     vi.fn(() => b),
          order:  vi.fn(() => Promise.resolve({ data: [], error: null })),
          insert: vi.fn((args: any) => { _capturedInsertArgs = args; return b; }),
          single: vi.fn(() => Promise.resolve({ data: _insertResult, error: _insertError })),
        };
        return b;
      }
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn(async () => ({ data: null, error: null })) };
    });

    // Act
    const res  = await POST(makePostRequest(PORTFOLIO_ID, VALID_POST_BODY), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(404);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
  });
});

// ── POST: Happy Path & Security Invariants ────────────────────────────────────

describe('POST /api/portfolio/[id]/tax/cpa-share — happy path & security invariants', () => {
  it('returns 201 on success with share_url present in response body', async () => {
    // Act
    const res  = await POST(makePostRequest(PORTFOLIO_ID, VALID_POST_BODY), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(201);
    expect(body).toHaveProperty('data');
    expect(body.data).toHaveProperty('share_url');
    expect(typeof body.data.share_url).toBe('string');
    expect(body.data.share_url.length).toBeGreaterThan(0);
  });

  it('stores the SHA-256 hash in the DB, not the raw bearer token', async () => {
    // Act
    const res  = await POST(makePostRequest(PORTFOLIO_ID, VALID_POST_BODY), makeCtx());
    const body = await res.json();

    // Assert — the token in share_url must differ from what was persisted
    expect(_capturedInsertArgs).not.toBeNull();
    const storedHash = _capturedInsertArgs.share_token;
    const shareURL   = body.data.share_url;

    // Extract the raw token from the URL (last path segment)
    const rawToken = shareURL.split('/').pop()!;

    // Critical: hash stored in DB must NOT equal the raw bearer token
    expect(storedHash).not.toEqual(rawToken);
    // The stored value should be 64 hex chars (SHA-256)
    expect(storedHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('does NOT expose share_token (the hash) in the response body', async () => {
    // Act
    const res  = await POST(makePostRequest(PORTFOLIO_ID, VALID_POST_BODY), makeCtx());
    const body = await res.json();

    // Assert — the response must not leak the stored hash field
    expect(body.data).not.toHaveProperty('share_token');
    // Ensure the data object itself doesn't nest it anywhere
    const serialised = JSON.stringify(body);
    const storedHash = _capturedInsertArgs?.share_token;
    if (storedHash) {
      expect(serialised).not.toContain(storedHash);
    }
  });

  it('includes email_preview when send_email is true and cpa_email is provided', async () => {
    // Arrange
    const body = { ...VALID_POST_BODY, send_email: true };

    // Act
    const res  = await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());
    const json = await res.json();

    // Assert
    expect(res.status).toBe(201);
    expect(json.data).toHaveProperty('email_preview');
    expect(json.data.email_preview).not.toBeNull();
    expect(json.data.email_preview).toHaveProperty('subject');
    expect(json.data.email_preview).toHaveProperty('body');
  });

  it('returns email_preview as null when send_email is false', async () => {
    // Arrange
    const body = { ...VALID_POST_BODY, send_email: false };

    // Act
    const res  = await POST(makePostRequest(PORTFOLIO_ID, body), makeCtx());
    const json = await res.json();

    // Assert
    expect(res.status).toBe(201);
    expect(json.data.email_preview).toBeNull();
  });
});

// ── POST: DB Error Propagation ────────────────────────────────────────────────

describe('POST /api/portfolio/[id]/tax/cpa-share — DB error propagation', () => {
  it('returns 500 when the cpa_share_links insert fails', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
    // Arrange
    _insertError  = { message: 'unique constraint violation' };
    _insertResult = null;

    // Act
    const res  = await POST(makePostRequest(PORTFOLIO_ID, VALID_POST_BODY), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('data');
    expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});

// ── PATCH: Validation ─────────────────────────────────────────────────────────

describe('PATCH /api/portfolio/[id]/tax/cpa-share — validation', () => {
  it('returns 400 when share_link_id query param is missing', async () => {
    // Arrange — no query param on the URL

    // Act
    const res  = await PATCH(makeRevokeRequest('PATCH', PORTFOLIO_ID, undefined), makeCtx());
    const body = await res.json();

    // Assert — caught before any DB/auth call
    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
  });
});

// ── PATCH: Auth & Access Control ──────────────────────────────────────────────

describe('PATCH /api/portfolio/[id]/tax/cpa-share — auth', () => {
  it('returns 403 when can_edit_portfolio returns false', async () => {
    // Arrange
    _canEdit = false;

    // Act
    const res  = await PATCH(makeRevokeRequest('PATCH', PORTFOLIO_ID, SHARE_LINK_ID), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
    expect(body).not.toHaveProperty('success');
  });
});

// ── PATCH: Error Propagation ──────────────────────────────────────────────────

describe('PATCH /api/portfolio/[id]/tax/cpa-share — error propagation', () => {
  it('returns 500 when the revoke_share_link RPC errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
    // Arrange
    _revokeError = { message: 'share link not found' };

    // Act
    const res  = await PATCH(makeRevokeRequest('PATCH', PORTFOLIO_ID, SHARE_LINK_ID), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
    expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});

// ── PATCH: Happy Path ─────────────────────────────────────────────────────────

describe('PATCH /api/portfolio/[id]/tax/cpa-share — happy path', () => {
  it('returns { success: true } when revocation succeeds', async () => {
    // Act
    const res  = await PATCH(makeRevokeRequest('PATCH', PORTFOLIO_ID, SHARE_LINK_ID), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });
  });
});

describe('DELETE /api/portfolio/[id]/tax/cpa-share — compatibility alias', () => {
  it('still revokes for existing callers', async () => {
    const res = await DELETE(makeRevokeRequest('DELETE', PORTFOLIO_ID, SHARE_LINK_ID), makeCtx());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({ success: true });
  });
});

/**
 * NOT TESTED HERE — requires separate setup:
 *
 * - Supabase RLS enforcement at DB level: can_edit_portfolio is a Postgres function;
 *   the mock simulates the return value only. True policy evaluation is an integration-test concern.
 *
 * - Rate limiting on share-link creation: not implemented at the route level yet (Phase B).
 *
 * - Token uniqueness under collision: crypto.randomBytes(32) collision probability is
 *   negligible; uniqueness is enforced by the DB unique constraint, not testable via mocks.
 *
 * - Expiry date precision: createExpirationDate is a pure function tested independently
 *   in lib/tax/cpa-collaboration; the route delegates to it unchanged.
 *
 * - cpa_access_logs audit trail: written by the CPA portal consumer, not by this route.
 *
 * - Email delivery (send_email: true): Phase B — not implemented; the route returns
 *   email_preview only (format data, no actual send).
 */
// Integration test.
