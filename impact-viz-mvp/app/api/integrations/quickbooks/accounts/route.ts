// app/api/integrations/quickbooks/accounts/route.ts
// GET /api/integrations/quickbooks/accounts?org_id=<uuid>
// Returns the locally-synced QuickBooks accounts for the org.

import { createServerClient, createAdminClient } from '@/lib/supabase';

export async function GET(req: Request): Promise<Response> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const orgId = searchParams.get('org_id');
  if (!orgId) {
    return Response.json({ error: 'org_id is required' }, { status: 400 });
  }

  // Confirm user is a member of this org
  const { data: membership } = await supabase
    .from('organization_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const adminSupabase = createAdminClient();
  const { data: accounts, error } = await adminSupabase
    .from('qb_accounts')
    .select('id, qb_account_id, name, type, subtype, current_balance, synced_at')
    .eq('org_id', orgId)
    .order('type')
    .order('name');

  if (error) {
    return Response.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }

  return Response.json({ accounts: accounts ?? [] });
}
