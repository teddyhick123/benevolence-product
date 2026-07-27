// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTaxRepository } from '@/lib/api/repositories/tax';
import { stubQuery } from '@/tests/helpers/supabase-mock';

const { mockCreateElevatedClient, mockFrom } = vi.hoisted(() => ({
  mockCreateElevatedClient: vi.fn(),
  mockFrom: vi.fn(),
}));

vi.mock('@/lib/api/admin-client', () => ({
  createElevatedClient: mockCreateElevatedClient,
}));

beforeEach(() => {
  mockFrom.mockReset();
  mockCreateElevatedClient.mockReset();
  mockCreateElevatedClient.mockReturnValue({ from: mockFrom });
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
});
