// GET /api/integrations/quickbooks/callback
// Exchanges the Intuit OAuth code and stores the org-scoped connection.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOrgAccess, requireUserAccess } from '@/lib/api/access';
import type { AccessPrincipal } from '@/lib/api/principals';
import { jsonError } from '@/lib/api/responses';
import { createOAuthClient } from '@/lib/integrations/quickbooks/client';
import { encryptToken } from '@/lib/integrations/quickbooks/token-crypto';

const oauthStateSchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid(),
  nonce: z.string().uuid(),
}).strict();

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userAccess = await requireUserAccess();
  if (!userAccess.ok) return userAccess.response;

  const url = new URL(req.url);
  const oauthError = url.searchParams.get('error');
  if (oauthError) {
    const settingsUrl = new URL('/settings/integrations', url.origin);
    settingsUrl.searchParams.set('error', oauthError);
    return NextResponse.redirect(settingsUrl.toString());
  }

  const stateParam = url.searchParams.get('state');
  if (!stateParam) return jsonError('Missing state parameter', 400);
  const cookieNonce = req.headers.get('cookie')
    ?.split(';')
    .map(cookie => cookie.trim())
    .find(cookie => cookie.startsWith('qb_oauth_nonce='))
    ?.split('=')[1];

  let state: z.infer<typeof oauthStateSchema>;
  try {
    state = oauthStateSchema.parse(JSON.parse(
      Buffer.from(stateParam, 'base64url').toString('utf8')
    ));
  } catch {
    return jsonError('Invalid state parameter', 400);
  }

  if (
    !cookieNonce ||
    cookieNonce !== state.nonce ||
    state.userId !== userAccess.context.user.id
  ) {
    return jsonError('Invalid state', 400);
  }

  const orgAccess = await requireOrgAccess(state.orgId, 'admin');
  if (!orgAccess.ok) return orgAccess.response;
  if (orgAccess.context.user.id !== state.userId) {
    return jsonError('Invalid state', 400);
  }

  const oauthPrincipal: Extract<AccessPrincipal, { kind: 'oauth' }> = {
    kind: 'oauth',
    provider: 'quickbooks',
    subject: state.userId,
  };
  const oauthClient = createOAuthClient();
  let tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    x_refresh_token_expires_in?: number;
    token_type?: string;
    realmId?: string;
  };

  try {
    const authResponse = await oauthClient.createToken(req.url);
    tokens = authResponse.getJson() as typeof tokens;
  } catch (err) {
    console.error('[QB] Token exchange failed:', err);
    return jsonError('Token exchange failed', 500);
  }

  const realmId = url.searchParams.get('realmId') ?? tokens.realmId ?? '';
  if (!realmId) return jsonError('Missing realmId', 400);

  const tokenExpiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);
  const refreshTokenExpiry = tokens.x_refresh_token_expires_in
    ? new Date(Date.now() + tokens.x_refresh_token_expires_in * 1000)
    : null;
  const { error: upsertError } = await orgAccess.context.db
    .from('quickbooks_connections')
    .upsert({
      org_id: state.orgId,
      realm_id: realmId,
      access_token: encryptToken(tokens.access_token),
      refresh_token: encryptToken(tokens.refresh_token),
      token_type: tokens.token_type ?? 'bearer',
      expires_at: tokenExpiry.toISOString(),
      refresh_expires_at: refreshTokenExpiry?.toISOString() ?? null,
      connected_by: oauthPrincipal.subject,
      disconnected_at: null,
      disconnected_by: null,
    }, { onConflict: 'org_id' });

  if (upsertError) {
    console.error('[QB] Failed to store tokens:', upsertError);
    return jsonError('Failed to store connection', 500);
  }

  const settingsUrl = new URL('/settings/integrations', url.origin);
  settingsUrl.searchParams.set('connected', '1');
  settingsUrl.searchParams.set('org', state.orgId);
  const response = NextResponse.redirect(settingsUrl.toString());
  response.headers.set(
    'Set-Cookie',
    'qb_oauth_nonce=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/'
  );
  return response;
}
