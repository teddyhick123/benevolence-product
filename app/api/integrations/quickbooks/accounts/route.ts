// GET /api/integrations/quickbooks/accounts?org_id=<uuid>

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

  const { data: accounts, error } = await access.context.db
    .from('qb_accounts')
    .select('id, qb_id, qb_name, qb_type, qb_subtype, current_balance, synced_at')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .order('qb_type')
    .order('qb_name');

  if (error) return jsonError('Failed to fetch accounts', 500);
  return jsonOk({ accounts: accounts ?? [] });
}
