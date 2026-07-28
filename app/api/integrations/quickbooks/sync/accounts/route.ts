// POST /api/integrations/quickbooks/sync/accounts

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrgAccess } from '@/lib/api/access';
import { createQuickBooksRepository } from '@/lib/api/repositories/quickbooks';
import { jsonError, jsonOk } from '@/lib/api/responses';

const syncAccountsSchema = z.object({
  org_id: z.string().uuid(),
}).strict();

export async function POST(req: NextRequest): Promise<Response> {
  const parsed = syncAccountsSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('org_id is required', 400);

  const orgId = parsed.data.org_id;
  const access = await requireOrgAccess(orgId, 'admin');
  if (!access.ok) return access.response;

  const result = await createQuickBooksRepository({
    orgId,
    actorId: access.context.user.id,
  }).syncAccounts();

  if (result.status === 'not_connected') {
    return jsonError('QuickBooks not connected or token refresh failed', 422);
  }
  if (result.status === 'provider_error') {
    return jsonError('Failed to fetch accounts from QuickBooks', 502);
  }
  if (result.status === 'storage_error') {
    return jsonError('Failed to store accounts', 500);
  }
  return jsonOk({ ok: true, synced: result.synced });
}
