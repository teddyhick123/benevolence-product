// app/api/integrations/quickbooks/export/contributions/route.ts
// POST /api/integrations/quickbooks/export/contributions
// Body: { org_id: string; tax_year: number; expense_account_id: string; bank_account_id: string }
//
// Fetches contributions across ALL portfolios belonging to the org for the given tax year
// and creates Journal Entries in QuickBooks (debit Expense, credit Bank).

import { createAdminClient, createServerClient } from '@/lib/supabase';
import { branding } from '@/lib/config';
import {
  getAuthenticatedQBClientByOrg,
  createJournalEntryAsync,
  findJournalEntryByDocNumberAsync,
  QBJournalEntry,
} from '@/lib/integrations/quickbooks/client';
import {
  claimQBExportAttempt,
  completeQBExportAttempt,
  failQBExportAttempt,
} from '@/lib/integrations/quickbooks/export-attempts';

interface ExportBody {
  org_id?: string;
  tax_year?: number;
  expense_account_id?: string;
  bank_account_id?: string;
}

interface ContributionRow {
  id: string;
  contribution_date: string;
  recipient_name: string;
  amount_usd: number;
  calculated_deductible_amount: number | null;
}

function json(body: Record<string, unknown>, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: {
      ...init?.headers,
      'Cache-Control': 'no-store',
    },
  });
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

async function logQBSync(
  db: ReturnType<typeof createAdminClient>,
  orgId: string,
  status: 'success' | 'error',
  recordCount: number | null,
  errorMsg?: string
) {
  const { error } = await db.from('qb_sync_log').insert({
    org_id: orgId,
    event_type: 'contributions_export',
    status,
    record_count: recordCount,
    error_msg: errorMsg ?? null,
  });

  if (error) {
    throw error;
  }
}

export async function POST(req: Request): Promise<Response> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as ExportBody;
  const { org_id: orgId, tax_year: taxYear, expense_account_id, bank_account_id } = body;

  if (!orgId || !taxYear || !expense_account_id || !bank_account_id) {
    return json(
      {
        error:
          'org_id, tax_year, expense_account_id, and bank_account_id are required',
      },
      { status: 400 }
    );
  }

  // Confirm user is an admin or owner of this org
  const { data: membership, error: membershipError } = await supabase
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single();
  if (membershipError) return json({ error: membershipError.message }, { status: 500 });

  if (!membership || !['owner', 'admin'].includes(membership.role as string)) {
    return json({ error: 'Admin access required' }, { status: 403 });
  }

  // Fetch all portfolio IDs belonging to this org
  const { data: portfolios, error: portfolioError } = await supabase
    .from('portfolios')
    .select('id')
    .eq('org_id', orgId);

  if (portfolioError || !portfolios || portfolios.length === 0) {
    return json({ ok: true, exported: 0, message: 'No portfolios found for this org' });
  }

  const portfolioIds = portfolios.map((p) => p.id);
  const db = createAdminClient();

  // Fetch contributions across all org portfolios for the given tax year
  const { data: contributions, error: fetchError } = await supabase
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
    await logQBSync(db, orgId, 'error', null, 'Failed to fetch contributions');
    return json({ error: 'Failed to fetch contributions' }, { status: 500 });
  }

  if (!contributions || contributions.length === 0) {
    return json({ ok: true, exported: 0, message: 'No contributions found for this year' });
  }

  const truncated = contributions.length >= 2000;

  const qbResult = await getAuthenticatedQBClientByOrg(orgId);
  if (!qbResult) {
    return json(
      { error: 'QuickBooks not connected or token refresh failed' },
      { status: 422 }
    );
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
          const claim = await claimQBExportAttempt(db, {
            orgId,
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
              await completeQBExportAttempt(db, attemptId, journalEntryId);
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
          await completeQBExportAttempt(db, attemptId, journalEntryId);
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
                await completeQBExportAttempt(db, attemptId, journalEntryId);
              }
              exported.push({ id: contribution.id, qb_journal_entry_id: journalEntryId });
            } catch (lookupErr) {
              const lookupMsg = lookupErr instanceof Error ? lookupErr.message : 'Unknown duplicate lookup error';
              console.error(`[QB] Duplicate lookup failed for contribution ${contribution.id}:`, lookupErr);
              if (attemptId) await failQBExportAttempt(db, attemptId, lookupMsg);
              failed.push({ id: contribution.id, error: lookupMsg });
            }
          } else {
            console.error(`[QB] Journal entry failed for contribution ${contribution.id}:`, err);
            if (attemptId) await failQBExportAttempt(db, attemptId, errMsg);
            failed.push({ id: contribution.id, error: errMsg });
          }
        }
      })
    );
  }

  if (exported.length > 0) {
    const reconciliationResults = await Promise.all(
      exported.map(({ id, qb_journal_entry_id }) =>
        db
          .from('tax_contributions')
          .update({
            qb_exported_at: new Date().toISOString(),
            qb_journal_entry_id,
          })
          .eq('id', id)
          .eq('org_id', orgId)
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

  await logQBSync(
    db,
    orgId,
    failed.length > 0 ? 'error' : 'success',
    exported.length,
    failed.length > 0 ? JSON.stringify(failed.slice(0, 25)) : undefined
  );

  return json({
    ok: true,
    exported: exported.length,
    failed: failed.length,
    failures: failed.length > 0 ? failed : undefined,
    truncated,
    warning: truncated ? 'Result set was capped at 2,000 contributions. Run again for remaining records.' : undefined,
  });
}
