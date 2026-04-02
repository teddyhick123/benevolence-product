// app/api/integrations/quickbooks/export/grants/route.ts
// POST /api/integrations/quickbooks/export/grants
// Body: { portfolio_id: string; expense_account_id: string; bank_account_id: string; since?: string }
//
// Reads grants (holdings with grant_details) and creates Journal Entries in QuickBooks.

import { createServerClient } from '@/lib/supabase';
import {
  getAuthenticatedQBClient,
  createJournalEntryAsync,
  QBJournalEntry,
} from '@/lib/integrations/quickbooks/client';

interface ExportGrantsBody {
  portfolio_id?: string;
  expense_account_id?: string;
  bank_account_id?: string;
  /** ISO date string — only export grants whose period started on or after this date */
  since?: string;
}

interface GrantRow {
  id: string;
  name: string;
  total_committed: number | null;
  grant_period_start: string | null;
  grant_period_end: string | null;
}

export async function POST(req: Request): Promise<Response> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as ExportGrantsBody;
  const { portfolio_id: portfolioId, expense_account_id, bank_account_id, since } = body;

  if (!portfolioId || !expense_account_id || !bank_account_id) {
    return Response.json(
      { error: 'portfolio_id, expense_account_id, and bank_account_id are required' },
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

  // Fetch holdings that have grant_details, along with grant period info
  let query = supabase
    .from('holdings')
    .select(
      `id,
       name,
       total_committed,
       grant_details!inner(grant_period_start, grant_period_end)`
    )
    .eq('portfolio_id', portfolioId)
    .not('total_committed', 'is', null)
    .gt('total_committed', 0)
    .limit(1000);

  if (since) {
    query = query.gte('grant_details.grant_period_start', since);
  }

  const { data: grants, error: fetchError } = await query;

  if (fetchError) {
    console.error('[QB] grants fetch error:', fetchError);
    return Response.json({ error: 'Failed to fetch grants' }, { status: 500 });
  }

  if (!grants || grants.length === 0) {
    return Response.json({ ok: true, exported: 0, message: 'No grants found' });
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

  const eligibleGrants = (grants as unknown as GrantRow[]).filter(g => g.total_committed && g.total_committed > 0);

  const BATCH_SIZE = 30;
  for (let i = 0; i < eligibleGrants.length; i += BATCH_SIZE) {
    const batch = eligibleGrants.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (grant) => {
        const amount = grant.total_committed!;
        const txnDate =
          grant.grant_period_start
            ? grant.grant_period_start.slice(0, 10)
            : new Date().toISOString().slice(0, 10);

        const entry: QBJournalEntry = {
          TxnDate: txnDate,
          DocNumber: `BEN-GRANT-${grant.id.slice(0, 8).toUpperCase()}`,
          PrivateNote: `Grant to ${grant.name} — exported from Benevolence`,
          Line: [
            {
              Description: `Grant disbursement — ${grant.name}`,
              Amount: amount,
              DetailType: 'JournalEntryLineDetail',
              JournalEntryLineDetail: {
                PostingType: 'Debit',
                AccountRef: { value: expense_account_id, name: 'Grant Expense' },
              },
            },
            {
              Description: `Payment — ${grant.name}`,
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
          exported.push(grant.id);
        } catch (err) {
          console.error(`[QB] Journal entry failed for grant ${grant.id}:`, err);
          failed.push({
            id: grant.id,
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
