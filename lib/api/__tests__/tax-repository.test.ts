// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTaxRepository } from '@/lib/api/repositories/tax';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockFrom, mockStorageFrom } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
  mockStorageFrom: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

beforeEach(() => {
  mockFrom.mockReset();
  mockStorageFrom.mockReset();
  mockCreateElevatedClient.mockReset();
  mockCreateElevatedClient.mockReturnValue({
    from: mockFrom,
    storage: { from: mockStorageFrom },
  });
});

describe('createTaxRepository', () => {
  it('forces tax-year writes into the repository portfolio scope', async () => {
    const query = stubQuery({ data: null, error: null });
    mockFrom.mockReturnValue(query);
    const repository = createTaxRepository({ portfolioId: 'portfolio-1' });

    await repository.syncTaxYear({
      taxYear: 2024,
      adjustedGrossIncome: 250_000,
      filingStatus: 'single',
    });

    expect(mockFrom).toHaveBeenCalledWith('tax_years');
    expect(query.upsert).toHaveBeenCalledWith({
      portfolio_id: 'portfolio-1',
      tax_year: 2024,
      adjusted_gross_income: 250_000,
      filing_status: 'single',
    }, {
      onConflict: 'portfolio_id,tax_year',
    });
  });

  it('does not expose the elevated client or a generic table method', () => {
    mockFrom.mockReturnValue(stubQuery({ data: null, error: null }));

    const repository = createTaxRepository({ portfolioId: 'portfolio-1' });

    expect(repository).not.toHaveProperty('db');
    expect(repository).not.toHaveProperty('from');
  });

  it('constructs upload paths inside the portfolio and contribution scope', async () => {
    const upload = vi.fn(async () => ({ data: { path: 'stored' }, error: null }));
    mockStorageFrom.mockReturnValue({ upload });
    const repository = createTaxRepository({ portfolioId: 'portfolio-1' });

    const result = await repository.uploadDocumentObject({
      contributionId: 'contribution-1',
      objectName: 'receipt-123.pdf',
      body: Buffer.from('document'),
      contentType: 'application/pdf',
    });

    expect(mockStorageFrom).toHaveBeenCalledWith('tax-documents');
    expect(upload).toHaveBeenCalledWith(
      'portfolio-1/contribution-1/receipt-123.pdf',
      expect.any(Buffer),
      { contentType: 'application/pdf', upsert: false }
    );
    expect(result.storagePath).toBe(
      'portfolio-1/contribution-1/receipt-123.pdf'
    );
  });

  it('rejects object names that could escape their storage prefix', async () => {
    const repository = createTaxRepository({ portfolioId: 'portfolio-1' });

    await expect(repository.uploadDocumentObject({
      contributionId: 'contribution-1',
      objectName: '../outside.pdf',
      body: Buffer.from('document'),
      contentType: 'application/pdf',
    })).rejects.toThrow('Invalid tax document object name');
    expect(mockStorageFrom).not.toHaveBeenCalled();
  });

  it('refuses to sign or remove paths outside the scoped contribution', async () => {
    const repository = createTaxRepository({ portfolioId: 'portfolio-1' });
    const foreignPath = 'portfolio-2/contribution-2/receipt.pdf';

    await expect(repository.createSignedDocumentUrl({
      contributionId: 'contribution-1',
      storagePath: foreignPath,
    })).rejects.toThrow('outside the authorized scope');
    await expect(repository.removeDocumentObject({
      contributionId: 'contribution-1',
      storagePath: foreignPath,
    })).rejects.toThrow('outside the authorized scope');
    expect(mockStorageFrom).not.toHaveBeenCalled();
  });

  it('creates one-hour signed URLs for scoped private documents', async () => {
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: 'https://signed.example.test' },
      error: null,
    }));
    mockStorageFrom.mockReturnValue({ createSignedUrl });
    const repository = createTaxRepository({ portfolioId: 'portfolio-1' });
    const storagePath = 'portfolio-1/contribution-1/receipt.pdf';

    await repository.createSignedDocumentUrl({
      contributionId: 'contribution-1',
      storagePath,
    });

    expect(createSignedUrl).toHaveBeenCalledWith(storagePath, 3600);
  });
});
