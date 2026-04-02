// app/api/integrations/quickbooks/status/route.ts
// GET /api/integrations/quickbooks/status?portfolio_id=<uuid>
// Returns the current connection status and metadata for the portfolio.

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
  const portfolioId = searchParams.get('portfolio_id');
  if (!portfolioId) {
    return Response.json({ error: 'portfolio_id is required' }, { status: 400 });
  }

  // RLS will naturally restrict to portfolios the user belongs to
  const { data: connection } = await supabase
    .from('quickbooks_connections')
    .select('realm_id, connected_at, last_sync_at, token_expiry')
    .eq('portfolio_id', portfolioId)
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
