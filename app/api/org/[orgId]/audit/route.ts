// app/api/org/[orgId]/audit/route.ts
import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const { orgId } = await params;
    const access = await requireOrgAccess(orgId, 'admin');
    if (isAccessDenied(access)) return access.response;

    const { searchParams } = new URL(req.url);
    const requestedLimit = Number.parseInt(searchParams.get('limit') || '50', 10);
    const requestedOffset = Number.parseInt(searchParams.get('offset') || '0', 10);
    const limit = Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 200)
      : 50;
    const offset = Number.isFinite(requestedOffset) && requestedOffset >= 0 ? requestedOffset : 0;

    const { data, error } = await access.context.db
      .from('org_audit_log')
      .select('id, action, target_id, actor_id, metadata, created_at')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) return jsonError(error.message, 500);

    const actorIds = Array.from(new Set((data || []).map(row => row.actor_id).filter(Boolean)));
    const { data: profiles, error: profilesError } = actorIds.length > 0
      ? await access.context.db
          .from('profiles')
          .select('id, email, full_name')
          .in('id', actorIds)
      : { data: [], error: null };
    if (profilesError) return jsonError(profilesError.message, 500);
    const profilesById = new Map((profiles || []).map(profile => [profile.id, profile]));

    const entries = (data || []).map((row) => ({
      id: row.id,
      action: row.action,
      target_id: row.target_id,
      metadata: row.metadata,
      created_at: row.created_at,
      actor_email: profilesById.get(row.actor_id)?.email || null,
      actor_name: profilesById.get(row.actor_id)?.full_name || null,
    }));

    return jsonOk({ entries });
  } catch (err) {
    return jsonError(err instanceof Error ? err.message : 'Internal error', 500);
  }
}
