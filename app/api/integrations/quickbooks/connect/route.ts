// GET /api/integrations/quickbooks/connect?org_id=<uuid>
// Redirects an authorized org manager to Intuit's OAuth page.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError } from '@/lib/api/responses';
import { createOAuthClient, OAuthClient } from '@/lib/integrations/quickbooks/client';

const orgIdSchema = z.string().uuid();

export async function GET(req: NextRequest): Promise<NextResponse> {
  const parsedOrgId = orgIdSchema.safeParse(new URL(req.url).searchParams.get('org_id'));
  if (!parsedOrgId.success) {
    return jsonError('org_id is required', 400);
  }

  const orgId = parsedOrgId.data;
  const access = await requireOrgAccess(orgId, 'admin');
  if (!access.ok) return access.response;

  const nonce = crypto.randomUUID();
  const state = Buffer.from(JSON.stringify({
    orgId,
    userId: access.context.user.id,
    nonce,
  })).toString('base64url');
  const authUri = createOAuthClient().authorizeUri({
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
