// app/api/integrations/quickbooks/callback/route.ts
// GET /api/integrations/quickbooks/callback
// Handles the OAuth redirect from Intuit, exchanges code for tokens, and stores them.

import { NextResponse } from 'next/server';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { createOAuthClient } from '@/lib/integrations/quickbooks/client';

export async function GET(req: Request): Promise<NextResponse> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const stateParam = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    const settingsUrl = new URL('/dashboard/settings/integrations', url.origin);
    settingsUrl.searchParams.set('error', error);
    return NextResponse.redirect(settingsUrl.toString());
  }

  if (!stateParam) {
    return NextResponse.json({ error: 'Missing state parameter' }, { status: 400 });
  }

  let portfolioId: string;
  try {
    const decoded = JSON.parse(
      Buffer.from(stateParam, 'base64url').toString('utf-8')
    ) as { portfolioId: string; userId: string };
    portfolioId = decoded.portfolioId;
  } catch {
    return NextResponse.json({ error: 'Invalid state parameter' }, { status: 400 });
  }

  // Confirm user is a member of this portfolio
  const { data: membership } = await supabase
    .from('portfolio_members')
    .select('id')
    .eq('portfolio_id', portfolioId)
    .eq('user_id', user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const oauthClient = createOAuthClient();

  let tokens: {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    realmId?: string;
  };

  try {
    const authResponse = await oauthClient.createToken(req.url);
    const json = authResponse.getJson() as typeof tokens;
    tokens = json;
  } catch (err) {
    console.error('[QB] Token exchange failed:', err);
    return NextResponse.json({ error: 'Token exchange failed' }, { status: 500 });
  }

  const realmId = url.searchParams.get('realmId') ?? tokens.realmId ?? '';
  if (!realmId) {
    return NextResponse.json({ error: 'Missing realmId' }, { status: 400 });
  }

  const tokenExpiry = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000);

  // Use admin client to upsert — RLS would block the write if the connection doesn't exist yet
  const adminSupabase = createAdminClient();
  const { error: upsertError } = await adminSupabase
    .from('quickbooks_connections')
    .upsert(
      {
        portfolio_id: portfolioId,
        realm_id: realmId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_expiry: tokenExpiry.toISOString(),
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'portfolio_id' }
    );

  if (upsertError) {
    console.error('[QB] Failed to store tokens:', upsertError);
    return NextResponse.json({ error: 'Failed to store connection' }, { status: 500 });
  }

  const settingsUrl = new URL('/dashboard/settings/integrations', url.origin);
  settingsUrl.searchParams.set('connected', '1');
  return NextResponse.redirect(settingsUrl.toString());
}
