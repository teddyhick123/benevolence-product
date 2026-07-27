import { createElevatedClient } from '@/lib/api/admin-client';
import type { PortfolioAccessContext } from '@/lib/api/principals';

type TaxRepositoryScope = Pick<PortfolioAccessContext, 'portfolioId'>;
const TAX_DOCUMENT_BUCKET = 'tax-documents';

export type TaxYearSyncInput = {
  taxYear: number;
  adjustedGrossIncome: number | null;
  filingStatus: string | null;
};

function documentPrefix(portfolioId: string, contributionId: string) {
  return `${portfolioId}/${contributionId}/`;
}

function assertDocumentPath(
  portfolioId: string,
  contributionId: string,
  storagePath: string
) {
  if (
    !storagePath.startsWith(documentPrefix(portfolioId, contributionId)) ||
    storagePath.includes('..') ||
    storagePath.includes('\\')
  ) {
    throw new Error('Tax document storage path is outside the authorized scope');
  }
}

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

    async uploadDocumentObject(input: {
      contributionId: string;
      objectName: string;
      body: Buffer;
      contentType: string;
    }) {
      if (
        input.objectName.includes('/') ||
        input.objectName.includes('\\') ||
        input.objectName.includes('..')
      ) {
        throw new Error('Invalid tax document object name');
      }
      const storagePath = documentPrefix(scope.portfolioId, input.contributionId)
        + input.objectName;
      const result = await db.storage
        .from(TAX_DOCUMENT_BUCKET)
        .upload(storagePath, input.body, {
          contentType: input.contentType,
          upsert: false,
        });
      return { ...result, storagePath };
    },

    async createSignedDocumentUrl(input: {
      contributionId: string;
      storagePath: string;
      expiresIn?: number;
    }) {
      assertDocumentPath(scope.portfolioId, input.contributionId, input.storagePath);
      return db.storage
        .from(TAX_DOCUMENT_BUCKET)
        .createSignedUrl(input.storagePath, input.expiresIn ?? 3600);
    },

    async removeDocumentObject(input: {
      contributionId: string;
      storagePath: string;
    }) {
      assertDocumentPath(scope.portfolioId, input.contributionId, input.storagePath);
      return db.storage
        .from(TAX_DOCUMENT_BUCKET)
        .remove([input.storagePath]);
    },
  };
}
