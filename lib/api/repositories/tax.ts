import { createElevatedClient } from '@/lib/api/admin-client';
import type { PortfolioAccessContext } from '@/lib/api/principals';

type TaxRepositoryScope = Pick<PortfolioAccessContext, 'portfolioId'>;

export type TaxYearSyncInput = {
  taxYear: number;
  adjustedGrossIncome: number | null;
  filingStatus: string | null;
};

/** Elevated tax operations constrained to one already-authorized portfolio. */
export function createTaxRepository(scope: TaxRepositoryScope) {
  const db = createElevatedClient();

  return {
    async syncTaxYear(input: TaxYearSyncInput) {
      return db
        .from('tax_years')
        .upsert({
          portfolio_id: scope.portfolioId,
          tax_year: input.taxYear,
          adjusted_gross_income: input.adjustedGrossIncome,
          filing_status: input.filingStatus,
        }, {
          onConflict: 'portfolio_id,tax_year',
        });
    },
  };
}
