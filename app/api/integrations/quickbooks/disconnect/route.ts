// app/api/integrations/quickbooks/disconnect/route.ts
// POST /api/integrations/quickbooks/disconnect
// Body: { org_id: string }
// Revokes the QB OAuth token and removes the stored connection record.

import { createServerClient } from '@/lib/supabase';
import { isWorkspaceManager } from '@/lib/roles';
import { createOAuthClient } from '@/lib/integrations/quickbooks/client';
import { decryptToken, isEncrypted } from '@/lib/integrations/quickbooks/token-crypto';

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

  // Confirm user is an admin or owner of this org
  const { data: membership } = await supabase
    .from('organization_members')
    .select('role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single();

  if (!membership || !isWorkspaceManager(membership.role)) {
    return Response.json({ error: 'Admin access required' }, { status: 403 });
  }

  // Fetch the stored connection (RLS allows org admin to read their own connection)
  const { data: connection } = await supabase
    .from('quickbooks_connections')
    .select('access_token, refresh_token')
    .eq('org_id', orgId)
    .single();

  // Best-effort token revocation — don't fail the whole request if this errors
  if (connection) {
    try {
      const rawAccess = connection.access_token as string;
      const rawRefresh = connection.refresh_token as string;
      const accessToken = isEncrypted(rawAccess) ? decryptToken(rawAccess) : rawAccess;
      const refreshToken = isEncrypted(rawRefresh) ? decryptToken(rawRefresh) : rawRefresh;
      const oauthClient = createOAuthClient();
      oauthClient.setToken({ access_token: accessToken, refresh_token: refreshToken });
      await oauthClient.revoke({ token: refreshToken });
    } catch (err) {
      console.warn('[QB] Token revocation error (ignored):', err);
    }
  }

  // Remove the connection record and all synced accounts (RLS enforces org scope)
  await Promise.all([
    supabase.from('quickbooks_connections').delete().eq('org_id', orgId),
    supabase.from('qb_accounts').delete().eq('org_id', orgId),
  ]);

  return Response.json({ ok: true });
}
