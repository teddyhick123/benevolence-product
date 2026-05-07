// app/api/integrations/quickbooks/connect/route.ts
// GET /api/integrations/quickbooks/connect?org_id=<uuid>
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
  const orgId = searchParams.get('org_id');
  if (!orgId) {
    return NextResponse.json({ error: 'org_id is required' }, { status: 400 });
  }

  // Confirm user is an admin or owner of this org
  const { data: membership } = await supabase
    .from('organization_members')
    .select('member_role')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .single();

  if (!membership || !['owner', 'admin'].includes(membership.member_role as string)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const oauthClient = createOAuthClient();

  // Generate a CSRF nonce to validate in the callback
  const nonce = crypto.randomUUID();

  // Encode orgId, userId, and nonce in the OAuth state parameter
  const state = Buffer.from(JSON.stringify({ orgId, userId: user.id, nonce })).toString(
    'base64url'
  );

  const authUri = oauthClient.authorizeUri({
    scope: [OAuthClient.scopes.Accounting, OAuthClient.scopes.OpenId],
    state,
  });

  const response = NextResponse.redirect(authUri);
  response.headers.set(
    'Set-Cookie',
    `qb_oauth_nonce=${nonce}; HttpOnly; SameSite=Lax; Max-Age=600; Path=/`
  );
  return response;
}
