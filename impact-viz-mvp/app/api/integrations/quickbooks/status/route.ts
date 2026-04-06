// app/api/integrations/quickbooks/status/route.ts
// GET /api/integrations/quickbooks/status?org_id=<uuid>
// Returns the current connection status and metadata for the org.

import { createServerClient } from '@/lib/supabase';

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

  const { data: connection } = await supabase
    .from('quickbooks_connections')
    .select('realm_id, connected_at, last_sync_at, token_expiry')
    .eq('org_id', orgId)
    .single();

  if (!connection) {
    return Response.json({ connected: false });
  }

  const tokenExpiry = new Date(connection.token_expiry as string);
  const isExpired = tokenExpiry <= new Date();

  return Response.json({
    connected: true,
    realm_id: connection.realm_id,
    connected_at: connection.connected_at,
    last_sync_at: connection.last_sync_at,
    token_expiry: connection.token_expiry,
    token_expired: isExpired,
  });
}
