// app/api/integrations/quickbooks/export/grants/route.ts
// POST /api/integrations/quickbooks/export/grants
// Body: { org_id: string; expense_account_id: string; bank_account_id: string; since?: string }
//
// Reads grants across ALL portfolios belonging to the org and creates Journal Entries in QuickBooks.

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

const exportGrantsSchema = z.object({
  org_id: z.string().uuid(),
  expense_account_id: z.string().trim().min(1).max(200),
  bank_account_id: z.string().trim().min(1).max(200),
  since: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).strict();

interface GrantRow {
  id: string;
  approved_amount: number | null;
  requested_amount: number | null;
  holdings: { name: string; funds_allocated: number | null } | null;
  name: string;
  funds_allocated: number | null;
  grant_period_start: string | null;
  grant_period_end: string | null;
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
  const parsed = exportGrantsSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return jsonError('org_id, expense_account_id, and bank_account_id are required', 400);
  }
  const { org_id: orgId, expense_account_id, bank_account_id, since } = parsed.data;
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
  if (portfolioError) return jsonError(portfolioError.message, 500);

  if (!portfolios || portfolios.length === 0) {
    return jsonOk({ ok: true, exported: 0, message: 'No portfolios found for this org' });
  }

  const portfolioIds = portfolios.map((p) => p.id);

  // Fetch grants across all org portfolios. Use holdings.funds_allocated
  // (what has been disbursed/drawn) to avoid double-counting full commitments.
  let query = db
    .from('grants')
    .select(
      `id,
       approved_amount,
       requested_amount,
       grant_period_start,
       grant_period_end,
       holdings!inner(name, funds_allocated)`
    )
    .eq('org_id', orgId)
    .in('portfolio_id', portfolioIds)
    .is('deleted_at', null)
    .is('qb_exported_at', null)
    .limit(2000);

  if (since) {
    query = query.gte('grant_period_start', since);
  }

  const { data: grants, error: fetchError } = await query;
  if (fetchError) {
    console.error('[QB] grants fetch error:', fetchError);
    await quickBooks.recordExportLog({
      eventType: 'grants_export',
      status: 'error',
      recordCount: null,
      errorMsg: 'Failed to fetch grants',
    });
    return jsonError('Failed to fetch grants', 500);
  }

  if (!grants || grants.length === 0) {
    return jsonOk({ ok: true, exported: 0, message: 'No grants found' });
  }

  const truncated = grants.length >= 2000;

  const qbResult = await quickBooks.getAuthenticatedClient();
  if (!qbResult) {
    return jsonError('QuickBooks not connected or token refresh failed', 422);
  }

  const { client } = qbResult;
  const exported: Array<{ id: string; qb_journal_entry_id: string }> = [];
  const failed: Array<{ id: string; error: string }> = [];

  const eligibleGrants = (grants as unknown as GrantRow[]).filter(g => {
    const amount = g.holdings?.funds_allocated ?? 0;
    return amount > 0;
  });

  const BATCH_SIZE = 30;
  for (let i = 0; i < eligibleGrants.length; i += BATCH_SIZE) {
    const batch = eligibleGrants.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (grant) => {
        const amount = grant.holdings!.funds_allocated!;
        const grantName = grant.holdings?.name ?? 'Grant';
        const docNumber = `GRANT-${grant.id.slice(0, 8).toUpperCase()}`;
        let attemptId: string | null = null;
        const txnDate =
          grant.grant_period_start
            ? grant.grant_period_start.slice(0, 10)
            : new Date().toISOString().slice(0, 10);

        const entry: QBJournalEntry = {
          TxnDate: txnDate,
          DocNumber: docNumber,
          PrivateNote: `Grant to ${grantName} — exported from ${branding.appName}`,
          Line: [
            {
              Description: `Grant disbursement — ${grantName}`,
              Amount: amount,
              DetailType: 'JournalEntryLineDetail',
              JournalEntryLineDetail: {
                PostingType: 'Debit',
                AccountRef: { value: expense_account_id, name: 'Grant Expense' },
              },
            },
            {
              Description: `Payment — ${grantName}`,
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
            exportType: 'grant',
            sourceTable: 'grants',
            sourceId: grant.id,
            docNumber,
            expectedAmount: amount,
            debitAccountId: expense_account_id,
            creditAccountId: bank_account_id,
          });

          attemptId = claim.attemptId;
          if (claim.status === 'already_succeeded') {
            exported.push({ id: grant.id, qb_journal_entry_id: claim.qbJournalEntryId });
            return;
          }

          if (claim.status === 'in_flight') {
            const existing = await findJournalEntryByDocNumberAsync(client, docNumber);
            const journalEntryId = getJournalEntryId(existing);
            if (journalEntryId && journalEntryMatchesExpected(existing, amount, expense_account_id, bank_account_id)) {
              await quickBooks.completeExportAttempt(attemptId, journalEntryId);
              exported.push({ id: grant.id, qb_journal_entry_id: journalEntryId });
              return;
            }
            failed.push({ id: grant.id, error: 'QuickBooks export already in flight' });
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
          exported.push({ id: grant.id, qb_journal_entry_id: journalEntryId });
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
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
              exported.push({ id: grant.id, qb_journal_entry_id: journalEntryId });
            } catch (lookupErr) {
              const lookupMsg = lookupErr instanceof Error ? lookupErr.message : 'Unknown duplicate lookup error';
              console.error(`[QB] Duplicate lookup failed for grant ${grant.id}:`, lookupErr);
              if (attemptId) await quickBooks.failExportAttempt(attemptId, lookupMsg);
              failed.push({ id: grant.id, error: lookupMsg });
            }
          } else {
            console.error(`[QB] Journal entry failed for grant ${grant.id}:`, err);
            if (attemptId) await quickBooks.failExportAttempt(attemptId, errMsg);
            failed.push({ id: grant.id, error: errMsg });
          }
        }
      })
    );
  }

  if (exported.length > 0) {
    const reconciliationResults = await Promise.all(
      exported.map(({ id, qb_journal_entry_id }) =>
        quickBooks.reconcileGrantExport(id, qb_journal_entry_id)
      )
    );
    reconciliationResults.forEach(({ error }, index) => {
      if (error) {
        const grantId = exported[index]?.id ?? 'unknown';
        console.error(`[QB] Failed to persist grant export state for ${grantId}:`, error);
        failed.push({ id: grantId, error: 'QuickBooks export succeeded but local reconciliation failed' });
      }
    });
  }

  await quickBooks.recordExportLog({
    eventType: 'grants_export',
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
    warning: truncated ? 'Result set was capped at 2,000 grants. Run again for remaining records.' : undefined,
  });
}
