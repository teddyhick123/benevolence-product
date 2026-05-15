// app/api/integrations/quickbooks/export/grants/route.ts
// POST /api/integrations/quickbooks/export/grants
// Body: { org_id: string; expense_account_id: string; bank_account_id: string; since?: string }
//
// Reads grants across ALL portfolios belonging to the org and creates Journal Entries in QuickBooks.

import { createServerClient } from '@/lib/supabase';
import { branding } from '@/lib/config';
import {
  getAuthenticatedQBClientByOrg,
  createJournalEntryAsync,
  QBJournalEntry,
} from '@/lib/integrations/quickbooks/client';

interface ExportGrantsBody {
  org_id?: string;
  expense_account_id?: string;
  bank_account_id?: string;
  /** ISO date string — only export grants whose period started on or after this date */
  since?: string;
}

interface GrantRow {
  id: string;
  name: string;
  funds_allocated: number | null;
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
  const { org_id: orgId, expense_account_id, bank_account_id, since } = body;

  if (!orgId || !expense_account_id || !bank_account_id) {
    return Response.json(
      { error: 'org_id, expense_account_id, and bank_account_id are required' },
      { status: 400 }
    );
  }

  // Confirm user is an admin or owner of this org
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.role as string)) {
    return Response.json({ error: 'Admin access required' }, { status: 403 });
  }

  // Fetch all portfolio IDs belonging to this org
  const { data: portfolios } = await supabase
    .from('portfolios')
    .select('id')
    .eq('org_id', orgId);

  if (!portfolios || portfolios.length === 0) {
    return Response.json({ ok: true, exported: 0, message: 'No portfolios found for this org' });
  }

  const portfolioIds = portfolios.map((p) => p.id);

  // Fetch holdings with grant_details across all org portfolios.
  // Use funds_allocated (what has been disbursed/drawn) not total_committed
  // (the full multi-year pledge) to avoid double-counting on re-exports.
  let query = supabase
    .from('holdings')
    .select(
      `id,
       name,
       funds_allocated,
       grant_details!inner(grant_period_start, grant_period_end)`
    )
    .in('portfolio_id', portfolioIds)
    .not('funds_allocated', 'is', null)
    .gt('funds_allocated', 0)
    .limit(2000);

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

  const truncated = grants.length >= 2000;

  const qbResult = await getAuthenticatedQBClientByOrg(orgId);
  if (!qbResult) {
    return Response.json(
      { error: 'QuickBooks not connected or token refresh failed' },
      { status: 422 }
    );
  }

  const { client } = qbResult;
  const exported: string[] = [];
  const failed: Array<{ id: string; error: string }> = [];

  const eligibleGrants = (grants as unknown as GrantRow[]).filter(g => g.funds_allocated && g.funds_allocated > 0);

  const BATCH_SIZE = 30;
  for (let i = 0; i < eligibleGrants.length; i += BATCH_SIZE) {
    const batch = eligibleGrants.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (grant) => {
        const amount = grant.funds_allocated!;
        const txnDate =
          grant.grant_period_start
            ? grant.grant_period_start.slice(0, 10)
            : new Date().toISOString().slice(0, 10);

        const entry: QBJournalEntry = {
          TxnDate: txnDate,
          DocNumber: `GRANT-${grant.id.slice(0, 8).toUpperCase()}`,
          PrivateNote: `Grant to ${grant.name} — exported from ${branding.appName}`,
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
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          if (errMsg.toLowerCase().includes('duplicate') || errMsg.toLowerCase().includes('doc number')) {
            exported.push(grant.id);
          } else {
            console.error(`[QB] Journal entry failed for grant ${grant.id}:`, err);
            failed.push({ id: grant.id, error: errMsg });
          }
        }
      })
    );
  }

  return Response.json({
    ok: true,
    exported: exported.length,
    failed: failed.length,
    failures: failed.length > 0 ? failed : undefined,
    truncated,
    warning: truncated ? 'Result set was capped at 2,000 grants. Run again for remaining records.' : undefined,
  });
}
