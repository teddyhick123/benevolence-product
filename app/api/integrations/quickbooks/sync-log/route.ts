// GET /api/integrations/quickbooks/sync-log?org_id=<uuid>&limit=10

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

const orgIdSchema = z.string().uuid();

export async function GET(req: NextRequest): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const parsedOrgId = orgIdSchema.safeParse(searchParams.get('org_id'));
  if (!parsedOrgId.success) return jsonError('org_id is required', 400);

  const requestedLimit = Number.parseInt(searchParams.get('limit') ?? '10', 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 100)
    : 10;
  const orgId = parsedOrgId.data;
  const access = await requireOrgAccess(orgId, 'admin');
  if (!access.ok) return access.response;

  const { data: log, error } = await access.context.db
    .from('qb_sync_log')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('[QB] sync-log fetch error:', error);
    return jsonError('Failed to fetch sync log', 500);
  }
  return jsonOk({ log: log ?? [] });
}
