// app/api/integrations/quickbooks/connect/route.ts
// GET /api/integrations/quickbooks/connect?portfolio_id=<uuid>
// Redirects the authenticated user to Intuit's OAuth authorization page.

import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import { createOAuthClient, OAuthClient } from '@/lib/integrations/quickbooks/client';

export async function GET(req: Request): Promise<NextResponse> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const portfolioId = searchParams.get('portfolio_id');
  if (!portfolioId) {
    return NextResponse.json({ error: 'portfolio_id is required' }, { status: 400 });
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

  // Encode portfolio_id in the OAuth state parameter so we can recover it in the callback
  const state = Buffer.from(JSON.stringify({ portfolioId, userId: user.id })).toString(
    'base64url'
  );

  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting, OAuthClient.scopes.OpenId],
    state,
  });

  return NextResponse.redirect(authUri);
}
