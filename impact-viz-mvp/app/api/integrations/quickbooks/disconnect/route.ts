// app/api/integrations/quickbooks/disconnect/route.ts
// POST /api/integrations/quickbooks/disconnect
// Body: { org_id: string }
// Revokes the QB OAuth token and removes the stored connection record.

import { createServerClient, createAdminClient } from '@/lib/supabase';
import { createOAuthClient } from '@/lib/integrations/quickbooks/client';

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

  // Confirm membership
  const { data: membership } = await supabase
    .from('organization_members')
    .select('id')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Fetch the stored connection
  const adminSupabase = createAdminClient();
  const { data: connection } = await adminSupabase
    .from('quickbooks_connections')
    .select('access_token, refresh_token')
    .eq('org_id', orgId)
    .single();

  // Best-effort token revocation — don't fail the whole request if this errors
  if (connection) {
    try {
      const oauthClient = createOAuthClient();
      oauthClient.setToken({
        access_token: connection.access_token as string,
        refresh_token: connection.refresh_token as string,
      });
      await oauthClient.revoke({ token: connection.refresh_token as string });
    } catch (err) {
      console.warn('[QB] Token revocation error (ignored):', err);
    }
  }

  // Remove the connection record and all synced accounts
  await Promise.all([
    adminSupabase
      .from('quickbooks_connections')
      .delete()
      .eq('org_id', orgId),
    adminSupabase
      .from('qb_accounts')
      .delete()
      .eq('org_id', orgId),
  ]);

  return Response.json({ ok: true });
}
