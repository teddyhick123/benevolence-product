// POST /api/integrations/quickbooks/disconnect
// Revokes the QB OAuth token and removes the stored org connection.

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { createOAuthClient } from '@/lib/integrations/quickbooks/client';
import { decryptToken, isEncrypted } from '@/lib/integrations/quickbooks/token-crypto';

const disconnectSchema = z.object({
  org_id: z.string().uuid(),
}).strict();

export async function POST(req: NextRequest): Promise<Response> {
  const parsed = disconnectSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('org_id is required', 400);

  const orgId = parsed.data.org_id;
  const access = await requireOrgAccess(orgId, 'admin');
  if (!access.ok) return access.response;
  const db = access.context.db;

  const { data: connection } = await db
    .from('quickbooks_connections')
    .select('access_token, refresh_token')
    .eq('org_id', orgId)
    .maybeSingle();

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

  await Promise.all([
    db.from('quickbooks_connections').delete().eq('org_id', orgId),
    db.from('qb_accounts').delete().eq('org_id', orgId),
  ]);

  return jsonOk({ ok: true });
}
