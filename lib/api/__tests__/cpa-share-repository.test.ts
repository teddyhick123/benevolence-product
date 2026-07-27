// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCpaToken, type CpaShareLinkRow } from '@/lib/api/repositories/cpa-share';
import { hashShareToken } from '@/lib/tax/cpa-collaboration';
import { stubQuery, type QueryStub } from '@/tests/helpers/supabase-mock';

const {
  mockCreateElevatedClient,
  mockFrom,
  mockRpc,
  mockStorageFrom,
} = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockRpc: vi.fn(),
  mockStorageFrom: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

const RAW_TOKEN = 'a'.repeat(64);

function share(overrides: Partial<CpaShareLinkRow> = {}): CpaShareLinkRow {
  return {
    id: 'share-1',
    portfolio_id: 'portfolio-1',
    org_id: 'org-1',
    share_token: hashShareToken(RAW_TOKEN),
    cpa_name: 'Casey CPA',
    tax_years: [2024, 2025],
    permissions: {
      view_contributions: true,
      view_carryforwards: true,
      view_donor_profile: false,
      view_tax_summary: true,
      view_documents: true,
      download_form8283: true,
      download_turbotax: true,
    },
    access_count: 0,
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

function client() {
  return {
    from: mockFrom,
    rpc: mockRpc,
    storage: { from: mockStorageFrom },
  };
}

function expectQueryCall(query: QueryStub, method: string, ...args: unknown[]) {
  expect(query.calls).toContainEqual({ method, args });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockCreateElevatedClient.mockReturnValue(client());
  mockRpc.mockResolvedValue({
    data: { access_granted: true, access_count: 1 },
    error: null,
  });
});

describe('resolveCpaToken', () => {
  it('hashes the raw token, returns a scoped principal, and hides the elevated client', async () => {
    const lookup = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: share(), error: null } }
    );
    mockFrom.mockReturnValue(lookup);

    const result = await resolveCpaToken(RAW_TOKEN);

    expectQueryCall(lookup, 'eq', 'share_token', hashShareToken(RAW_TOKEN));
    expect(result).toMatchObject({
      ok: true,
      context: {
        principal: { kind: 'cpa_share', shareLinkId: 'share-1' },
        orgId: 'org-1',
        portfolioId: 'portfolio-1',
        taxYears: [2024, 2025],
      },
    });
    if (!result.ok) throw new Error('expected resolved token');
    expect(result.context).not.toHaveProperty('share_token');
    expect(result.repository).not.toHaveProperty('db');
    expect(result.repository).not.toHaveProperty('from');
    expect(mockCreateElevatedClient).toHaveBeenCalledTimes(1);
  });

  it('conceals unknown and hash-mismatched links as not found', async () => {
    const unknown = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    mockFrom.mockReturnValueOnce(unknown);

    await expect(resolveCpaToken(RAW_TOKEN)).resolves.toEqual({
      ok: false,
      status: 404,
      error: 'Share link not found',
    });

    const mismatch = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: share({ share_token: 'f'.repeat(64) }), error: null } }
    );
    mockFrom.mockReturnValueOnce(mismatch);

    await expect(resolveCpaToken(RAW_TOKEN)).resolves.toEqual({
      ok: false,
      status: 404,
      error: 'Share link not found',
    });
  });

  it.each([
    [
      { revoked_at: '2026-01-02T00:00:00.000Z' },
      'This share link has been revoked by the portfolio owner.',
    ],
    [
      { expires_at: '2020-01-01T00:00:00.000Z' },
      'This share link has expired.',
    ],
    [
      { max_accesses: 3, access_count: 3 },
      'This share link has reached its maximum number of accesses.',
    ],
  ])('rejects inactive links before constructing a repository', async (overrides, error) => {
    const lookup = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: share(overrides), error: null } }
    );
    mockFrom.mockReturnValue(lookup);

    await expect(resolveCpaToken(RAW_TOKEN)).resolves.toEqual({
      ok: false,
      status: 410,
      error,
    });
  });
});

describe('scoped CPA repository', () => {
  it('constrains document IDs to the validated org, portfolio, and allowed years', async () => {
    const link = share();
    const lookup = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: link, error: null } }
    );
    const refreshOne = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: link, error: null } }
    );
    const documentLookup = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: null, error: null } }
    );
    const linkQueries = [lookup, refreshOne];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'cpa_share_links') {
        const query = linkQueries.shift();
        if (!query) throw new Error('unexpected share-link query');
        return query;
      }
      if (table === 'tax_documents') return documentLookup;
      throw new Error(`unexpected table ${table}`);
    });

    const resolved = await resolveCpaToken(RAW_TOKEN);
    if (!resolved.ok) throw new Error('expected resolved token');
    const result = await resolved.repository.createDownload({
      format: 'document',
      documentId: 'foreign-document',
    });

    expect(result).toEqual({ ok: false, status: 404, error: 'Document not found' });
    expectQueryCall(documentLookup, 'eq', 'id', 'foreign-document');
    expectQueryCall(documentLookup, 'eq', 'portfolio_id', 'portfolio-1');
    expectQueryCall(documentLookup, 'eq', 'org_id', 'org-1');
    expectQueryCall(documentLookup, 'in', 'tax_year', [2024, 2025]);
    expect(mockStorageFrom).not.toHaveBeenCalled();
  });

  it('signs only document paths inside the validated portfolio and contribution prefix', async () => {
    const link = share();
    const lookup = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: link, error: null } }
    );
    const refreshOne = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: link, error: null } }
    );
    const documentLookup = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'document-1',
            tax_contribution_id: 'contribution-1',
            file_name: 'receipt.pdf',
            storage_path: 'portfolio-2/contribution-1/receipt.pdf',
            tax_year: 2025,
          },
          error: null,
        },
      }
    );
    const refreshTwo = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: link, error: null } }
    );
    const linkQueries = [lookup, refreshOne, refreshTwo];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'cpa_share_links') {
        const query = linkQueries.shift();
        if (!query) throw new Error('unexpected share-link query');
        return query;
      }
      if (table === 'tax_documents') return documentLookup;
      throw new Error(`unexpected table ${table}`);
    });

    const resolved = await resolveCpaToken(RAW_TOKEN);
    if (!resolved.ok) throw new Error('expected resolved token');
    const result = await resolved.repository.createDownload({
      format: 'document',
      documentId: 'document-1',
    });

    expect(result).toEqual({ ok: false, status: 404, error: 'Document not found' });
    expect(mockStorageFrom).not.toHaveBeenCalled();
  });

  it('creates a one-hour private URL for a fully scoped document', async () => {
    const link = share();
    const lookup = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: link, error: null } }
    );
    const refreshOne = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: link, error: null } }
    );
    const documentLookup = stubQuery(
      { data: null, error: null },
      {
        maybeSingle: {
          data: {
            id: 'document-1',
            tax_contribution_id: 'contribution-1',
            file_name: 'receipt.pdf',
            storage_path: 'portfolio-1/contribution-1/receipt.pdf',
            tax_year: 2025,
          },
          error: null,
        },
      }
    );
    const refreshTwo = stubQuery(
      { data: null, error: null },
      { maybeSingle: { data: link, error: null } }
    );
    const linkQueries = [lookup, refreshOne, refreshTwo];
    mockFrom.mockImplementation((table: string) => {
      if (table === 'cpa_share_links') {
        const query = linkQueries.shift();
        if (!query) throw new Error('unexpected share-link query');
        return query;
      }
      if (table === 'tax_documents') return documentLookup;
      throw new Error(`unexpected table ${table}`);
    });
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: 'https://storage.example.test/signed/receipt' },
      error: null,
    }));
    mockStorageFrom.mockReturnValue({ createSignedUrl });

    const resolved = await resolveCpaToken(RAW_TOKEN);
    if (!resolved.ok) throw new Error('expected resolved token');
    const result = await resolved.repository.createDownload({
      format: 'document',
      documentId: 'document-1',
    });

    expect(result).toEqual({
      ok: true,
      signedUrl: 'https://storage.example.test/signed/receipt',
      filename: 'receipt.pdf',
    });
    expect(mockStorageFrom).toHaveBeenCalledWith('tax-documents');
    expect(createSignedUrl).toHaveBeenCalledWith(
      'portfolio-1/contribution-1/receipt.pdf',
      3600
    );
  });
});
