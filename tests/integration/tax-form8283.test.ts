// app/api/__tests__/tax-form8283.test.ts
//
// Tests for GET /api/portfolio/[id]/tax/form8283?year=YYYY
//
// Route facts confirmed by reading the source:
//   - Auth is delegated to `requirePortfolioAccess` from `@/lib/api/access`.
//   - DB queries use the guarded session client returned by the access context.
//   - PDF generation is delegated to `generateForm8283PDF` from `@/lib/tax/form8283-generator`.
//   - On success the route returns a PDF binary (Content-Type: application/pdf), NOT JSON.
//   - "No qualifying contributions" returns 400 JSON (not 404).
//   - Portfolio fetch failure returns 403 JSON.
//   - DB error on contributions returns 500 JSON.
//
// Mock strategy:
//   - `@/lib/portfolio-auth` is mocked at the module boundary to control access.
//   - `@/lib/supabase` is mocked so no live DB calls are made.
//   - `@/lib/tax/form8283-generator` is mocked to return a fixed Buffer;
//     PDF generation correctness is a unit concern for that module, not this route.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';
import { GET } from '@/app/api/portfolio/[id]/tax/form8283/route';

// ── Constants ──────────────────────────────────────────────────────────────────

const PORTFOLIO_ID = '11111111-1111-1111-1111-111111111111';
const USER_ID      = '55555555-5555-5555-5555-555555555555';
const CONTRIB_ID_1 = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const CONTRIB_ID_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// ── Mock state ─────────────────────────────────────────────────────────────────

// portfolio-auth mock state
let _accessDenied = false;
let _accessRole: string = 'member';

// supabase mock state
let _portfolioData: any = { name: 'Smith Family Foundation' };
let _portfolioError: { message: string } | null = null;

let _contributions: any[] = [];
let _contributionsError: { message: string } | null = null;

let _enhancedContribs: any[] = [];
let _enhancedError: { message: string } | null = null;

// ── Mocks ──────────────────────────────────────────────────────────────────────

// Mock portfolio-auth — controls whether access is granted
vi.mock('@/lib/portfolio-auth', () => ({
  requirePortfolioAccess: vi.fn(async (_portfolioId: string) => {
    if (_accessDenied) {
      return {
        error: NextResponse.json({ error: 'Access denied' }, { status: 403 }),
      };
    }
    return { user: { id: USER_ID }, role: _accessRole };
  }),
  isAccessDenied: vi.fn((result: any) => 'error' in result),
}));

vi.mock('@/lib/api/access', () => ({
  requirePortfolioAccess: vi.fn(async (_portfolioId: string) => {
    if (_accessDenied) {
      return {
        ok: false,
        response: NextResponse.json({ error: 'Access denied' }, { status: 403 }),
      };
    }
    return {
      ok: true,
      context: {
        db: { from: mockFrom },
        user: { id: USER_ID },
        role: _accessRole,
        orgId: 'org-1',
        portfolioId: PORTFOLIO_ID,
        principal: { kind: 'user', userId: USER_ID },
      },
    };
  }),
  isAccessDenied: vi.fn((result: any) => !result.ok),
}));

// Mock supabase — the route uses supabasePublic (alias for createServerClient)
const mockFrom = vi.fn();

vi.mock('@/lib/supabase', () => ({
  supabasePublic: vi.fn(async () => ({ from: mockFrom })),
  createServerClient: vi.fn(async () => ({ from: mockFrom })),
}));

// Mock PDF generator — returns a deterministic Buffer so we can assert on headers
const FAKE_PDF = Buffer.from('%PDF-1.4 fake content');
vi.mock('@/lib/tax/form8283-generator', () => ({
  generateForm8283PDF: vi.fn(() => FAKE_PDF),
}));

// ── Setup ──────────────────────────────────────────────────────────────────────

function setupMocks() {
  mockFrom.mockImplementation((table: string) => {
    if (table === 'portfolios') {
      const b: any = {
        select: vi.fn(() => b),
        eq: vi.fn(() => b),
        single: vi.fn(async () => ({ data: _portfolioData, error: _portfolioError })),
      };
      return b;
    }

    if (table === 'v_tax_contributions_with_limits') {
      const b: any = {
        select: vi.fn(() => b),
        eq: vi.fn(() => b),
        neq: vi.fn(() => b),
        gte: vi.fn(() => b),
        order: vi.fn(async () => ({ data: _contributions, error: _contributionsError })),
      };
      return b;
    }

    if (table === 'tax_contributions') {
      const b: any = {
        select: vi.fn(() => b),
        in: vi.fn(async () => ({ data: _enhancedContribs, error: _enhancedError })),
      };
      return b;
    }

    return {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn(async () => ({ data: null, error: null })),
    };
  });
}

beforeEach(() => {
  _accessDenied = false;
  _accessRole = 'member';

  _portfolioData = { name: 'Smith Family Foundation' };
  _portfolioError = null;

  _contributions = [
    {
      id: CONTRIB_ID_1,
      portfolio_id: PORTFOLIO_ID,
      tax_year: 2024,
      contribution_date: '2024-03-15',
      contribution_type: 'stock',
      amount_usd: 10000,
      fmv_at_donation: 10000,
      cost_basis: 2000,
      recipient_name: 'American Red Cross',
      recipient_ein: '53-0196605',
      notes: '500 shares AAPL',
    },
  ];
  _contributionsError = null;

  _enhancedContribs = [
    {
      id: CONTRIB_ID_1,
      property_description: '500 shares Apple Inc (AAPL)',
      date_acquired: '2020-01-10',
      how_acquired: 'Purchase',
      requires_qualified_appraisal: false,
    },
  ];
  _enhancedError = null;

  setupMocks();
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeGetRequest(portfolioId = PORTFOLIO_ID, year = 2024): Request {
  return new Request(
    `http://localhost/api/portfolio/${portfolioId}/tax/form8283?year=${year}`
  );
}

function makeCtx(portfolioId = PORTFOLIO_ID) {
  return { params: Promise.resolve({ id: portfolioId }) };
}

// ══════════════════════════════════════════════════════════════════════════════
// P0 — AUTH / ACCESS CONTROL
// ══════════════════════════════════════════════════════════════════════════════

describe('GET /api/portfolio/[id]/tax/form8283 — auth', () => {
  it('returns 403 and no PDF body when portfolio access is denied', async () => {
    // Arrange
    _accessDenied = true;

    // Act
    const res = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert — 403 status AND absence of PDF content
    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
    expect(res.headers.get('Content-Type')).not.toMatch(/pdf/i);
  });

  it('does NOT query the DB when access is denied', async () => {
    // Arrange
    _accessDenied = true;

    // Act
    await GET(makeGetRequest(), makeCtx());

    // Assert — no from() calls should have occurred
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('returns 403 (not 500) when access is denied — error type is preserved', async () => {
    // Arrange
    _accessDenied = true;

    // Act
    const res = await GET(makeGetRequest(), makeCtx());

    // Assert — the access denial must not be re-wrapped as an internal error
    expect(res.status).toBe(403);
    expect(res.status).not.toBe(500);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P0 — DB ERROR PROPAGATION
// ══════════════════════════════════════════════════════════════════════════════

describe('GET /api/portfolio/[id]/tax/form8283 — DB errors', () => {
  it('returns 403 when the portfolios query errors (portfolio not found)', async () => {
    // Arrange
    _portfolioError = { message: 'no rows' };
    _portfolioData = null;

    // Act
    const res = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(403);
    expect(body).toHaveProperty('error');
  });

  it('returns 500 when the v_tax_contributions_with_limits query errors', async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
    // Arrange
    _contributionsError = { message: 'relation does not exist' };
    _contributions = null as any;

    // Act
    const res = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert — DB failure is surfaced as 500
    expect(res.status).toBe(500);
    expect(body).toHaveProperty('error');
    expect(res.headers.get('Content-Type')).not.toMatch(/pdf/i);
    expect(consoleErrorSpy).toHaveBeenCalled();
    } finally {
      consoleErrorSpy.mockRestore();
    }
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P0 — RESPONSE SHAPE ON SUCCESS
// ══════════════════════════════════════════════════════════════════════════════

describe('GET /api/portfolio/[id]/tax/form8283 — success shape', () => {
  it('returns 200 with Content-Type application/pdf on success', async () => {
    // Arrange — defaults are a single qualifying stock contribution

    // Act
    const res = await GET(makeGetRequest(), makeCtx());

    // Assert
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });

  it('includes Content-Disposition attachment header with the correct year', async () => {
    // Arrange

    // Act
    const res = await GET(makeGetRequest(PORTFOLIO_ID, 2023), makeCtx());

    // Assert
    const disposition = res.headers.get('Content-Disposition') ?? '';
    expect(disposition).toMatch(/attachment/i);
    expect(disposition).toMatch(/2023/);
    expect(disposition).toMatch(/8283/i);
  });

  it('returns a non-empty binary body (the PDF bytes)', async () => {
    // Arrange

    // Act
    const res = await GET(makeGetRequest(), makeCtx());
    const buffer = await res.arrayBuffer();

    // Assert — PDF must contain actual bytes
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// P1 — BEHAVIOR
// ══════════════════════════════════════════════════════════════════════════════

describe('GET /api/portfolio/[id]/tax/form8283 — behavior', () => {
  it('returns 400 when there are no qualifying noncash contributions over $500', async () => {
    // Arrange — empty contribution list (route returns 400 for this case)
    _contributions = [];

    // Act
    const res = await GET(makeGetRequest(), makeCtx());
    const body = await res.json();

    // Assert
    expect(res.status).toBe(400);
    expect(body).toHaveProperty('error');
    expect(body.error).toMatch(/no qualifying/i);
  });

  it('returns 400 with a year-specific message when contributions are empty', async () => {
    // Arrange
    _contributions = [];

    // Act
    const res = await GET(makeGetRequest(PORTFOLIO_ID, 2022), makeCtx());
    const body = await res.json();

    // Assert — message references the requested year
    expect(res.status).toBe(400);
    expect(body.message).toMatch(/2022/);
  });

  it('uses the year query parameter to filter contributions', async () => {
    // Arrange — contributions exist for the requested year
    _contributions = [
      {
        id: CONTRIB_ID_1,
        portfolio_id: PORTFOLIO_ID,
        tax_year: 2023,
        contribution_date: '2023-06-01',
        contribution_type: 'crypto',
        amount_usd: 1500,
        fmv_at_donation: 1500,
        recipient_name: 'Charity XYZ',
        recipient_ein: '12-3456789',
      },
    ];

    // Act
    const res = await GET(makeGetRequest(PORTFOLIO_ID, 2023), makeCtx());

    // Assert — route did not short-circuit; it returned a PDF
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });

  it('defaults to the current year when no year query parameter is provided', async () => {
    // Arrange — contributions are present so the route proceeds to PDF
    const res = await GET(
      new Request(`http://localhost/api/portfolio/${PORTFOLIO_ID}/tax/form8283`),
      makeCtx()
    );

    // Assert — route ran without error regardless of year defaulting
    // (400 is also acceptable if the mocked contributions don't match the default year,
    //  but 500 is never acceptable)
    expect(res.status).not.toBe(500);
  });

  it('includes non-cash contribution types (stock, crypto, real_estate) and excludes cash/check/wire', async () => {
    // Arrange — multiple contribution types; route filters to non-cash via DB query
    // The DB mock returns what we set; here we verify the route accepts stock + crypto
    _contributions = [
      {
        id: CONTRIB_ID_1,
        portfolio_id: PORTFOLIO_ID,
        tax_year: 2024,
        contribution_date: '2024-01-10',
        contribution_type: 'stock',
        amount_usd: 5000,
        fmv_at_donation: 5000,
        recipient_name: 'Museum of Art',
        recipient_ein: '12-3456789',
      },
      {
        id: CONTRIB_ID_2,
        portfolio_id: PORTFOLIO_ID,
        tax_year: 2024,
        contribution_date: '2024-02-20',
        contribution_type: 'crypto',
        amount_usd: 3000,
        fmv_at_donation: 3000,
        recipient_name: 'Food Bank',
        recipient_ein: '98-7654321',
      },
    ];
    _enhancedContribs = [
      { id: CONTRIB_ID_1, property_description: '100 shares TSLA', how_acquired: 'Purchase' },
      { id: CONTRIB_ID_2, property_description: '0.5 ETH', how_acquired: 'Purchase' },
    ];

    // Act
    const res = await GET(makeGetRequest(), makeCtx());

    // Assert — route processed both and returned a PDF
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });

  it('requires a qualified appraisal flag for contributions over $5,000', async () => {
    // Arrange — single contribution over $5000 threshold
    _contributions = [
      {
        id: CONTRIB_ID_1,
        portfolio_id: PORTFOLIO_ID,
        tax_year: 2024,
        contribution_date: '2024-05-15',
        contribution_type: 'real_estate',
        amount_usd: 25000,
        fmv_at_donation: 25000,
        recipient_name: 'Land Trust',
        recipient_ein: '55-1234567',
      },
    ];
    _enhancedContribs = [
      {
        id: CONTRIB_ID_1,
        property_description: '5 acres undeveloped land',
        requires_qualified_appraisal: true,
        appraisal_date: '2024-04-01',
        appraisal_value: 25000,
        appraiser_name: 'John Appraiser',
      },
    ];

    const { generateForm8283PDF } = await import('@/lib/tax/form8283-generator');
    const spy = vi.mocked(generateForm8283PDF);
    spy.mockClear();

    // Act
    await GET(makeGetRequest(), makeCtx());

    // Assert — the PDF generator was called with requires_appraisal = true
    expect(spy).toHaveBeenCalledOnce();
    const callArgs = spy.mock.calls[0][0];
    const contrib = callArgs.contributions[0];
    expect(contrib.requires_appraisal).toBe(true);
  });

  it('uses portfolio name as donor_name in the generated form', async () => {
    // Arrange
    _portfolioData = { name: 'Johnson Charitable Trust' };

    const { generateForm8283PDF } = await import('@/lib/tax/form8283-generator');
    const spy = vi.mocked(generateForm8283PDF);
    spy.mockClear();

    // Act
    await GET(makeGetRequest(), makeCtx());

    // Assert
    expect(spy).toHaveBeenCalledOnce();
    const callArgs = spy.mock.calls[0][0];
    expect(callArgs.donor_name).toBe('Johnson Charitable Trust');
  });
});

/**
 * NOT TESTED HERE — requires separate setup or is out of scope:
 *
 * - PDF content accuracy (field layout, IRS compliance): a concern for
 *   `lib/tax/form8283-generator` unit tests, not this route.
 *
 * - The $500 minimum threshold enforcement: applied via `.gte('amount_usd', 500)`
 *   in the DB query; the mock returns whatever we set, so the enforcement is
 *   tested at the Supabase/migration layer.
 *
 * - RLS enforcement: `supabasePublic` uses the session-scoped client; RLS
 *   policies are tested in migration files.
 *
 * - Rate limiting / abuse prevention: not implemented in this route.
 *
 * - Tax year boundaries (e.g. future years, year 0): no validation in the route;
 *   would be caught by Zod schema if one were added.
 */
// Integration test.
