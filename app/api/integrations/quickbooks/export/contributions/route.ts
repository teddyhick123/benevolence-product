// app/api/integrations/quickbooks/export/contributions/route.ts
// POST /api/integrations/quickbooks/export/contributions
// Body: { org_id: string; tax_year: number; expense_account_id: string; bank_account_id: string }
//
// Fetches contributions across ALL portfolios belonging to the org for the given tax year
// and creates Journal Entries in QuickBooks (debit Expense, credit Bank).

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrgAccess } from '@/lib/api/access';
import { createQuickBooksRepository } from '@/lib/api/repositories/quickbooks';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { branding } from '@/lib/config';
import {
  createJournalEntryAsync,
  findJournalEntryByDocNumberAsync,
  QBJournalEntry,
} from '@/lib/integrations/quickbooks/client';

const exportContributionsSchema = z.object({
  org_id: z.string().uuid(),
  tax_year: z.number().int().min(1900).max(2100),
  expense_account_id: z.string().trim().min(1).max(200),
  bank_account_id: z.string().trim().min(1).max(200),
}).strict();

interface ContributionRow {
  id: string;
  contribution_date: string;
  recipient_name: string;
  amount_usd: number;
  calculated_deductible_amount: number | null;
}

function getJournalEntryId(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const row = result as any;
  return row.Id ?? row.JournalEntry?.Id ?? row.QueryResponse?.JournalEntry?.[0]?.Id ?? null;
}

function getJournalEntry(result: unknown): any | null {
  if (!result || typeof result !== 'object') return null;
  const row = result as any;
  return row.JournalEntry ?? row.QueryResponse?.JournalEntry?.[0] ?? row;
}

function journalEntryMatchesExpected(
  result: unknown,
  amount: number,
  debitAccountId: string,
  creditAccountId: string
): boolean {
  const entry = getJournalEntry(result);
  const lines = Array.isArray(entry?.Line) ? entry.Line : [];
  const matchesLine = (postingType: 'Debit' | 'Credit', accountId: string) =>
    lines.some((line: any) =>
      Number(line.Amount) === Number(amount) &&
      line.JournalEntryLineDetail?.PostingType === postingType &&
      line.JournalEntryLineDetail?.AccountRef?.value === accountId
    );

  return matchesLine('Debit', debitAccountId) && matchesLine('Credit', creditAccountId);
}

export async function POST(req: NextRequest): Promise<Response> {
  const parsed = exportContributionsSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError(
      'org_id, tax_year, expense_account_id, and bank_account_id are required',
      400
    );
  }
  const {
    org_id: orgId,
    tax_year: taxYear,
    expense_account_id,
    bank_account_id,
  } = parsed.data;
  const access = await requireOrgAccess(orgId, 'admin');
  if (!access.ok) return access.response;
  const db = access.context.db;
  const quickBooks = createQuickBooksRepository({
    orgId,
    actorId: access.context.user.id,
  });

  // Fetch all portfolio IDs belonging to this org
  const { data: portfolios, error: portfolioError } = await db
    .from('portfolios')
    .select('id')
    .eq('org_id', orgId);

  if (portfolioError || !portfolios || portfolios.length === 0) {
    return jsonOk({ ok: true, exported: 0, message: 'No portfolios found for this org' });
  }

  const portfolioIds = portfolios.map((p) => p.id);
  // Fetch contributions across all org portfolios for the given tax year
  const { data: contributions, error: fetchError } = await db
    .from('v_tax_contributions_enriched')
    .select(
      'id, contribution_date, recipient_name, amount_usd, calculated_deductible_amount'
    )
    .in('portfolio_id', portfolioIds)
    .eq('tax_year', taxYear)
    .is('qb_exported_at', null)
    .order('contribution_date')
    .limit(2000);

  if (fetchError) {
    await quickBooks.recordExportLog({
      eventType: 'contributions_export',
      status: 'error',
      recordCount: null,
      errorMsg: 'Failed to fetch contributions',
    });
    return jsonError('Failed to fetch contributions', 500);
  }

  if (!contributions || contributions.length === 0) {
    return jsonOk({ ok: true, exported: 0, message: 'No contributions found for this year' });
  }

  const truncated = contributions.length >= 2000;

  const qbResult = await quickBooks.getAuthenticatedClient();
  if (!qbResult) {
    return jsonError('QuickBooks not connected or token refresh failed', 422);
  }

  const { client } = qbResult;
  const exported: Array<{ id: string; qb_journal_entry_id: string }> = [];
  const failed: Array<{ id: string; error: string }> = [];

  const eligibleContributions = (contributions as ContributionRow[]).filter(c => {
    const amount = c.calculated_deductible_amount ?? c.amount_usd;
    return amount && amount > 0;
  });

  const BATCH_SIZE = 30;
  for (let i = 0; i < eligibleContributions.length; i += BATCH_SIZE) {
    const batch = eligibleContributions.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (contribution) => {
        const amount = contribution.calculated_deductible_amount ?? contribution.amount_usd;
        const docNumber = `CONTRIB-${contribution.id.slice(0, 8).toUpperCase()}`;
        let attemptId: string | null = null;
        const entry: QBJournalEntry = {
          TxnDate: contribution.contribution_date,
          DocNumber: docNumber,
          PrivateNote: `Charitable contribution to ${contribution.recipient_name} — exported from ${branding.appName}`,
          Line: [
            {
              Description: `Charitable contribution — ${contribution.recipient_name}`,
              Amount: amount,
              DetailType: 'JournalEntryLineDetail',
              JournalEntryLineDetail: {
                PostingType: 'Debit',
                AccountRef: { value: expense_account_id, name: 'Charitable Contributions' },
              },
            },
            {
              Description: `Payment — ${contribution.recipient_name}`,
              Amount: amount,
              DetailType: 'JournalEntryLineDetail',
              JournalEntryLineDetail: {
                PostingType: 'Credit',
                AccountRef: { value: bank_account_id, name: 'Bank Account' },
              },
            },
          ],
        };
        try {
          const claim = await quickBooks.claimExportAttempt({
            exportType: 'contribution',
            sourceTable: 'tax_contributions',
            sourceId: contribution.id,
            docNumber,
            expectedAmount: amount,
            debitAccountId: expense_account_id,
            creditAccountId: bank_account_id,
          });

          attemptId = claim.attemptId;
          if (claim.status === 'already_succeeded') {
            exported.push({ id: contribution.id, qb_journal_entry_id: claim.qbJournalEntryId });
            return;
          }

          if (claim.status === 'in_flight') {
            const existing = await findJournalEntryByDocNumberAsync(client, docNumber);
            const journalEntryId = getJournalEntryId(existing);
            if (journalEntryId && journalEntryMatchesExpected(existing, amount, expense_account_id, bank_account_id)) {
              await quickBooks.completeExportAttempt(attemptId, journalEntryId);
              exported.push({ id: contribution.id, qb_journal_entry_id: journalEntryId });
              return;
            }
            failed.push({ id: contribution.id, error: 'QuickBooks export already in flight' });
            return;
          }

          const result = await createJournalEntryAsync(client, entry);
          let journalEntryId = getJournalEntryId(result);
          if (!journalEntryId) {
            const existing = await findJournalEntryByDocNumberAsync(client, docNumber);
            if (!journalEntryMatchesExpected(existing, amount, expense_account_id, bank_account_id)) {
              throw new Error(`Existing DocNumber ${docNumber} does not match expected amount/accounts`);
            }
            journalEntryId = getJournalEntryId(existing);
          }
          if (!journalEntryId) {
            throw new Error('QuickBooks journal entry created but no JournalEntry Id was returned');
          }
          await quickBooks.completeExportAttempt(attemptId, journalEntryId);
          exported.push({ id: contribution.id, qb_journal_entry_id: journalEntryId });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          // QB returns a duplicate DocNumber error when the entry already exists.
          // Resolve it to the existing JournalEntry so retries become durable.
          if (errMsg.toLowerCase().includes('duplicate') || errMsg.toLowerCase().includes('doc number')) {
            try {
              const existing = await findJournalEntryByDocNumberAsync(client, docNumber);
              const journalEntryId = getJournalEntryId(existing);
              if (!journalEntryId || !journalEntryMatchesExpected(existing, amount, expense_account_id, bank_account_id)) {
                throw new Error(`Duplicate DocNumber ${docNumber} could not be resolved`);
              }
              if (attemptId) {
                await quickBooks.completeExportAttempt(attemptId, journalEntryId);
              }
              exported.push({ id: contribution.id, qb_journal_entry_id: journalEntryId });
            } catch (lookupErr) {
              const lookupMsg = lookupErr instanceof Error ? lookupErr.message : 'Unknown duplicate lookup error';
              console.error(`[QB] Duplicate lookup failed for contribution ${contribution.id}:`, lookupErr);
              if (attemptId) await quickBooks.failExportAttempt(attemptId, lookupMsg);
              failed.push({ id: contribution.id, error: lookupMsg });
            }
          } else {
            console.error(`[QB] Journal entry failed for contribution ${contribution.id}:`, err);
            if (attemptId) await quickBooks.failExportAttempt(attemptId, errMsg);
            failed.push({ id: contribution.id, error: errMsg });
          }
        }
      })
    );
  }

  if (exported.length > 0) {
    const reconciliationResults = await Promise.all(
      exported.map(({ id, qb_journal_entry_id }) =>
        quickBooks.reconcileContributionExport(id, qb_journal_entry_id)
      )
    );
    reconciliationResults.forEach(({ error }, index) => {
      if (error) {
        const contributionId = exported[index]?.id ?? 'unknown';
        console.error(`[QB] Failed to persist export state for contribution ${contributionId}:`, error);
        failed.push({ id: contributionId, error: 'QuickBooks export succeeded but local reconciliation failed' });
      }
    });
  }

  await quickBooks.recordExportLog({
    eventType: 'contributions_export',
    status: failed.length > 0 ? 'error' : 'success',
    recordCount: exported.length,
    errorMsg: failed.length > 0 ? JSON.stringify(failed.slice(0, 25)) : undefined,
  });

  return jsonOk({
    ok: true,
    exported: exported.length,
    failed: failed.length,
    failures: failed.length > 0 ? failed : undefined,
    truncated,
    warning: truncated ? 'Result set was capped at 2,000 contributions. Run again for remaining records.' : undefined,
  });
}
