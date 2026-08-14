// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockCheckRateLimit,
  mockRequireCpaToken,
  mockGetCPAPortalPayload,
  mockCreateCPADownload,
  mockRateLimitExceeded,
} = vi.hoisted(() => ({
  mockCheckRateLimit: vi.fn(),
  mockRequireCpaToken: vi.fn(),
  mockGetCPAPortalPayload: vi.fn(),
  mockCreateCPADownload: vi.fn(),
  mockRateLimitExceeded: vi.fn(),
}));

vi.mock('@/lib/api/rate-limit', () => ({
  checkRateLimit: mockCheckRateLimit,
  cpaPortalLimiter: { name: 'cpa-portal' },
  getIP: vi.fn(() => '203.0.113.10'),
}));

vi.mock('@/lib/api/rate-limit-response', () => ({
  rateLimitExceeded: mockRateLimitExceeded,
}));

vi.mock('@/lib/api/access', () => ({
  requireCpaToken: mockRequireCpaToken,
}));

import { GET as getPortal } from '@/app/api/tax/cpa/[token]/route';
import { GET as getDownload } from '@/app/api/tax/cpa/[token]/download/route';

const context = (token: string) => ({ params: Promise.resolve({ token }) });

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckRateLimit.mockResolvedValue({
    success: true,
    limit: 30,
    remaining: 29,
    reset: Date.now() + 60_000,
  });
  mockRateLimitExceeded.mockReturnValue(
    new Response(JSON.stringify({ error: 'Too many requests' }), { status: 429 })
  );
  mockRequireCpaToken.mockResolvedValue({
    ok: true,
    context: {
      repository: {
        getPortalPayload: mockGetCPAPortalPayload,
        createDownload: mockCreateCPADownload,
      },
    },
  });
});

describe('public CPA portal route', () => {
  it('rate-limits by IP before doing token work', async () => {
    mockCheckRateLimit.mockResolvedValue({
      success: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const response = await getPortal(
      new Request('https://example.test/api/tax/cpa/raw-token'),
      context('raw-token')
    );

    expect(response.status).toBe(429);
    expect(mockRequireCpaToken).not.toHaveBeenCalled();
    expect(mockGetCPAPortalPayload).not.toHaveBeenCalled();
  });

  it.each([
    ['unknown', 404, 'Share link not found'],
    ['malformed', 404, 'Share link not found'],
    ['expired', 410, 'This share link has expired.'],
    ['revoked', 410, 'This share link has been revoked by the portfolio owner.'],
    ['max-accessed', 410, 'Maximum access count reached'],
  ])('preserves the %s token response', async (token, status, error) => {
    mockRequireCpaToken.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ error }), {
        status,
        headers: { 'Cache-Control': 'no-store', 'Content-Type': 'application/json' },
      }),
    });

    const response = await getPortal(
      new Request(`https://example.test/api/tax/cpa/${token}`),
      context(token)
    );

    expect(response.status).toBe(status);
    expect(mockGetCPAPortalPayload).not.toHaveBeenCalled();
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ error });
  });

  it('passes only finite requested years and returns the established payload envelope', async () => {
    const payload = { selected_year: 2025, portfolio: { id: 'portfolio-1', name: 'Giving' } };
    mockGetCPAPortalPayload.mockResolvedValue({ ok: true, payload });

    const response = await getPortal(
      new Request('https://example.test/api/tax/cpa/raw-token?year=not-a-year', {
        headers: { 'user-agent': 'test-agent' },
      }),
      context('raw-token')
    );

    expect(mockRequireCpaToken).toHaveBeenCalledWith('raw-token');
    expect(mockGetCPAPortalPayload).toHaveBeenCalledWith({
      year: undefined,
      ip: '203.0.113.10',
      userAgent: 'test-agent',
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ data: payload });
  });
});

describe('public CPA download route', () => {
  it('rate-limits before validating a download token', async () => {
    mockCheckRateLimit.mockResolvedValue({
      success: false,
      limit: 30,
      remaining: 0,
      reset: Date.now() + 60_000,
    });

    const response = await getDownload(
      new Request('https://example.test/api/tax/cpa/raw-token/download?format=csv'),
      context('raw-token')
    );

    expect(response.status).toBe(429);
    expect(mockRequireCpaToken).not.toHaveBeenCalled();
    expect(mockCreateCPADownload).not.toHaveBeenCalled();
  });

  it.each([
    ['disallowed permission', 403, 'Document access is not allowed'],
    ['missing document id', 400, 'documentId is required'],
    ['wrong tax year', 404, 'Document not found'],
    ['cross-portfolio document', 404, 'Document not found'],
  ])('preserves the %s failure response', async (_case, status, error) => {
    mockCreateCPADownload.mockResolvedValue({ ok: false, status, error });

    const response = await getDownload(
      new Request('https://example.test/api/tax/cpa/raw-token/download?format=document&documentId=document-1'),
      context('raw-token')
    );

    expect(response.status).toBe(status);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ error });
  });

  it('keeps export downloads non-cacheable with their content headers', async () => {
    mockCreateCPADownload.mockResolvedValue({
      ok: true,
      filename: 'cpa-contributions-2025.csv',
      contentType: 'text/csv',
      body: 'recipient,amount\nExample,100',
    });

    const response = await getDownload(
      new Request('https://example.test/api/tax/cpa/raw-token/download?format=csv&year=2025'),
      context('raw-token')
    );

    expect(mockRequireCpaToken).toHaveBeenCalledWith('raw-token');
    expect(mockCreateCPADownload).toHaveBeenCalledWith({
      format: 'csv',
      year: 2025,
      documentId: null,
      ip: '203.0.113.10',
      userAgent: undefined,
    });
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="cpa-contributions-2025.csv"'
    );
    await expect(response.text()).resolves.toBe('recipient,amount\nExample,100');
  });

  it('redirects private document downloads to the signed URL', async () => {
    mockCreateCPADownload.mockResolvedValue({
      ok: true,
      signedUrl: 'https://storage.example.test/signed/document',
      filename: 'receipt.pdf',
    });

    const response = await getDownload(
      new Request('https://example.test/api/tax/cpa/raw-token/download?format=document&documentId=document-1'),
      context('raw-token')
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe('https://storage.example.test/signed/document');
  });
});
