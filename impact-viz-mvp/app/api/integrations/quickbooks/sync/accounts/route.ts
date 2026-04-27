// app/api/integrations/quickbooks/sync/accounts/route.ts
// POST /api/integrations/quickbooks/sync/accounts
// Body: { org_id: string }
// Fetches the Chart of Accounts from QuickBooks and upserts into qb_accounts.

import { createServerClient, createAdminClient } from '@/lib/supabase';
import {
  getAuthenticatedQBClientByOrg,
  findAccountsAsync,
} from '@/lib/integrations/quickbooks/client';

export async function POST(req: Request): Promise<Response> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { org_id?: string };
  const orgId = body.org_id;
  if (!orgId) {
    return Response.json({ error: 'org_id is required' }, { status: 400 });
  }

  const { data: membership } = await supabase
    .from('organization_members')
    .select('member_role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.member_role as string)) {
    return Response.json({ error: 'Admin access required' }, { status: 403 });
  }

  const qbResult = await getAuthenticatedQBClientByOrg(orgId);
  if (!qbResult) {
    return Response.json(
      { error: 'QuickBooks not connected or token refresh failed' },
      { status: 422 }
    );
  }

  const { client } = qbResult;

  let accounts;
  try {
    accounts = await findAccountsAsync(client);
  } catch (err) {
    console.error('[QB] findAccounts error:', err);
    return Response.json({ error: 'Failed to fetch accounts from QuickBooks' }, { status: 502 });
  }

  const now = new Date().toISOString();

  const rows = accounts.map((a) => ({
    org_id: orgId,
    qb_id: a.Id,
    qb_name: a.Name,
    qb_type: a.AccountType,
    qb_subtype: a.AccountSubType ?? null,
    current_balance: a.CurrentBalance ?? 0,
    synced_at: now,
  }));

  const adminSupabase = createAdminClient();

  // Upsert all accounts; conflict on (org_id, qb_id)
  const { error: upsertError } = await adminSupabase
    .from('qb_accounts')
    .upsert(rows, { onConflict: 'org_id,qb_id' });

  if (upsertError) {
    console.error('[QB] qb_accounts upsert error:', upsertError);
    return Response.json({ error: 'Failed to store accounts' }, { status: 500 });
  }

  // Update last_sync_at on the connection record
  await adminSupabase
    .from('quickbooks_connections')
    .update({ last_sync_at: now })
    .eq('org_id', orgId);

  return Response.json({ ok: true, synced: rows.length });
}
