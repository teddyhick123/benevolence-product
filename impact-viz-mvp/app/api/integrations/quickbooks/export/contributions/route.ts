// app/api/integrations/quickbooks/export/contributions/route.ts
// POST /api/integrations/quickbooks/export/contributions
// Body: { portfolio_id: string; tax_year: number; expense_account_id: string; bank_account_id: string }
//
// Reads contributions from v_tax_contributions_enriched for the given tax year
// and creates Journal Entries in QuickBooks (debit Expense, credit Bank).

import { createServerClient } from '@/lib/supabase';
import {
  getAuthenticatedQBClient,
  createJournalEntryAsync,
  QBJournalEntry,
} from '@/lib/integrations/quickbooks/client';

interface ExportBody {
  portfolio_id?: string;
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

export async function POST(req: Request): Promise<Response> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as ExportBody;
  const { portfolio_id: portfolioId, tax_year: taxYear, expense_account_id, bank_account_id } =
    body;

  if (!portfolioId || !taxYear || !expense_account_id || !bank_account_id) {
    return Response.json(
      {
        error:
          'portfolio_id, tax_year, expense_account_id, and bank_account_id are required',
      },
      { status: 400 }
    );
  }

  const { data: membership } = await supabase
    .from('portfolio_members')
    .select('id')
    .eq('portfolio_id', portfolioId)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch contributions for the given year
  const { data: contributions, error: fetchError } = await supabase
    .from('v_tax_contributions_enriched')
    .select(
      'id, contribution_date, recipient_name, amount_usd, calculated_deductible_amount'
    )
    .eq('portfolio_id', portfolioId)
    .eq('tax_year', taxYear)
    .order('contribution_date')
    .limit(1000);

  if (fetchError) {
    return Response.json({ error: 'Failed to fetch contributions' }, { status: 500 });
  }

  if (!contributions || contributions.length === 0) {
    return Response.json({ ok: true, exported: 0, message: 'No contributions found for this year' });
  }

  const qbResult = await getAuthenticatedQBClient(portfolioId);
  if (!qbResult) {
    return Response.json(
      { error: 'QuickBooks not connected or token refresh failed' },
      { status: 422 }
    );
  }

  const { client } = qbResult;
  const exported: string[] = [];
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
        const entry: QBJournalEntry = {
          TxnDate: contribution.contribution_date,
          DocNumber: `BEN-CONTRIB-${contribution.id.slice(0, 8).toUpperCase()}`,
          PrivateNote: `Charitable contribution to ${contribution.recipient_name} — exported from Benevolence`,
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
          await createJournalEntryAsync(client, entry);
          exported.push(contribution.id);
        } catch (err) {
          console.error(`[QB] Journal entry failed for contribution ${contribution.id}:`, err);
          failed.push({
            id: contribution.id,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      })
    );
  }

  return Response.json({
    ok: true,
    exported: exported.length,
    failed: failed.length,
    failures: failed.length > 0 ? failed : undefined,
  });
}
