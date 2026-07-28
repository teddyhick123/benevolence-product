// GET /api/integrations/quickbooks/status?org_id=<uuid>

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

const orgIdSchema = z.string().uuid();

export async function GET(req: NextRequest): Promise<Response> {
  const parsedOrgId = orgIdSchema.safeParse(new URL(req.url).searchParams.get('org_id'));
  if (!parsedOrgId.success) return jsonError('org_id is required', 400);

  const orgId = parsedOrgId.data;
  const access = await requireOrgAccess(orgId, 'viewer');
  if (!access.ok) return access.response;

  const { data: connection } = await access.context.db
    .from('quickbooks_connections')
    .select('realm_id, created_at, last_sync_at, expires_at, refresh_expires_at')
    .eq('org_id', orgId)
    .maybeSingle();

  if (!connection) return jsonOk({ connected: false });

  const tokenExpiry = new Date(connection.expires_at as string);
  const refreshExpiry = connection.refresh_expires_at
    ? new Date(connection.refresh_expires_at as string)
    : null;
  const isRefreshExpired = refreshExpiry ? refreshExpiry <= new Date() : false;

  return jsonOk({
    connected: true,
    realm_id: connection.realm_id,
    connected_at: connection.created_at,
    last_sync_at: connection.last_sync_at,
    token_expiry: connection.expires_at,
    token_expired: tokenExpiry <= new Date(),
    refresh_expires_at: connection.refresh_expires_at,
    refresh_token_expired: isRefreshExpired,
    needs_reconnect: isRefreshExpired,
  });
}
