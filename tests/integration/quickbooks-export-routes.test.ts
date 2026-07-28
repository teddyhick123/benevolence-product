// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const ORG_ID = '11111111-1111-1111-1111-111111111111';

const {
  mockRequireOrgAccess,
  mockCreateQuickBooksRepository,
  mockFrom,
  mockGetAuthenticatedClient,
  mockClaimExportAttempt,
  mockCompleteExportAttempt,
  mockFailExportAttempt,
  mockReconcileContributionExport,
  mockReconcileGrantExport,
  mockRecordExportLog,
  mockCreateJournalEntryAsync,
  mockFindJournalEntryByDocNumberAsync,
} = vi.hoisted(() => ({
  mockRequireOrgAccess: vi.fn(),
  mockCreateQuickBooksRepository: vi.fn(),
  mockFrom: vi.fn(),
  mockGetAuthenticatedClient: vi.fn(),
  mockClaimExportAttempt: vi.fn(),
  mockCompleteExportAttempt: vi.fn(),
  mockFailExportAttempt: vi.fn(),
  mockReconcileContributionExport: vi.fn(),
  mockReconcileGrantExport: vi.fn(),
  mockRecordExportLog: vi.fn(),
  mockCreateJournalEntryAsync: vi.fn(),
  mockFindJournalEntryByDocNumberAsync: vi.fn(),
}));

vi.mock('@/lib/api/access', () => ({ requireOrgAccess: mockRequireOrgAccess }));
vi.mock('@/lib/api/repositories/quickbooks', () => ({
  createQuickBooksRepository: mockCreateQuickBooksRepository,
}));
vi.mock('@/lib/integrations/quickbooks/client', () => ({
  createJournalEntryAsync: mockCreateJournalEntryAsync,
  findJournalEntryByDocNumberAsync: mockFindJournalEntryByDocNumberAsync,
}));

import { POST as exportContributions } from '@/app/api/integrations/quickbooks/export/contributions/route';
import { POST as exportGrants } from '@/app/api/integrations/quickbooks/export/grants/route';

function request(path: string, body: Record<string, unknown>) {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireOrgAccess.mockResolvedValue({
    ok: true,
    context: { orgId: ORG_ID, user: { id: 'user-1' }, db: { from: mockFrom } },
  });
  mockCreateQuickBooksRepository.mockReturnValue({
    getAuthenticatedClient: mockGetAuthenticatedClient,
    claimExportAttempt: mockClaimExportAttempt,
    completeExportAttempt: mockCompleteExportAttempt,
    failExportAttempt: mockFailExportAttempt,
    reconcileContributionExport: mockReconcileContributionExport,
    reconcileGrantExport: mockReconcileGrantExport,
    recordExportLog: mockRecordExportLog,
  });
  mockGetAuthenticatedClient.mockResolvedValue({ client: { kind: 'qb-client' } });
  mockClaimExportAttempt.mockResolvedValue({ status: 'claimed', attemptId: 'attempt-1' });
  mockCreateJournalEntryAsync.mockResolvedValue({ Id: 'journal-1' });
  mockReconcileContributionExport.mockResolvedValue({ error: null });
  mockReconcileGrantExport.mockResolvedValue({ error: null });
});

describe('QuickBooks export routes', () => {
  it('constructs no repository when cross-org admin access is denied', async () => {
    mockRequireOrgAccess.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    });

    const response = await exportGrants(request(
      '/api/integrations/quickbooks/export/grants',
      { org_id: ORG_ID, expense_account_id: 'expense-1', bank_account_id: 'bank-1' }
    ));

    expect(response.status).toBe(403);
    expect(mockCreateQuickBooksRepository).not.toHaveBeenCalled();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('exports and reconciles a contribution through the scoped repository', async () => {
    const portfoliosQuery = stubQuery({ data: [{ id: 'portfolio-1' }], error: null });
    const contributionsQuery = stubQuery({
      data: [{
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        contribution_date: '2026-01-15',
        recipient_name: 'Community Fund',
        amount_usd: 500,
        calculated_deductible_amount: 500,
      }],
      error: null,
    });
    mockFrom.mockImplementation(table => table === 'portfolios'
      ? portfoliosQuery
      : contributionsQuery);

    const response = await exportContributions(request(
      '/api/integrations/quickbooks/export/contributions',
      {
        org_id: ORG_ID,
        tax_year: 2026,
        expense_account_id: 'expense-1',
        bank_account_id: 'bank-1',
      }
    ));

    expect(response.status).toBe(200);
    expect(mockRequireOrgAccess).toHaveBeenCalledWith(ORG_ID, 'admin');
    expect(portfoliosQuery.calls).toContainEqual({ method: 'eq', args: ['org_id', ORG_ID] });
    expect(mockClaimExportAttempt).toHaveBeenCalledWith(expect.objectContaining({
      exportType: 'contribution',
      sourceId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    }));
    expect(mockReconcileContributionExport).toHaveBeenCalledWith(
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      'journal-1'
    );
    expect(mockRecordExportLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'contributions_export',
      status: 'success',
      recordCount: 1,
    }));
  });

  it('exports and reconciles a grant through the scoped repository', async () => {
    const portfoliosQuery = stubQuery({ data: [{ id: 'portfolio-1' }], error: null });
    const grantsQuery = stubQuery({
      data: [{
        id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        approved_amount: 1000,
        requested_amount: 1000,
        grant_period_start: '2026-02-01',
        grant_period_end: null,
        holdings: { name: 'Education Grant', funds_allocated: 1000 },
      }],
      error: null,
    });
    mockFrom.mockImplementation(table => table === 'portfolios' ? portfoliosQuery : grantsQuery);

    const response = await exportGrants(request(
      '/api/integrations/quickbooks/export/grants',
      { org_id: ORG_ID, expense_account_id: 'expense-1', bank_account_id: 'bank-1' }
    ));

    expect(response.status).toBe(200);
    expect(mockClaimExportAttempt).toHaveBeenCalledWith(expect.objectContaining({
      exportType: 'grant',
      sourceId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    }));
    expect(mockReconcileGrantExport).toHaveBeenCalledWith(
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'journal-1'
    );
    expect(mockRecordExportLog).toHaveBeenCalledWith(expect.objectContaining({
      eventType: 'grants_export',
      recordCount: 1,
    }));
  });
});
