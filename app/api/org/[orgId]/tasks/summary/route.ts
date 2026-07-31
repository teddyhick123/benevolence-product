import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'viewer');
  if (isAccessDenied(access)) return access.response;

  try {
    const db = access.context.db;
    const now = new Date();
    const nowIso = now.toISOString();
    const sevenDaysIso = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const notDone = '(completed,cancelled)';

    const [overdueRes, dueSoonRes, blockedRes, mineRes, openRes] = await Promise.all([
      db.from('tasks').select('*', { count: 'exact', head: true })
        .eq('org_id', orgId).lt('due_at', nowIso).not('status', 'in', notDone).is('deleted_at', null),
      db.from('tasks').select('*', { count: 'exact', head: true })
        .eq('org_id', orgId).gte('due_at', nowIso).lte('due_at', sevenDaysIso).not('status', 'in', notDone).is('deleted_at', null),
      db.from('tasks').select('*', { count: 'exact', head: true })
        .eq('org_id', orgId).eq('status', 'blocked').is('deleted_at', null),
      db.from('tasks').select('*', { count: 'exact', head: true })
        .eq('org_id', orgId).eq('assigned_to', access.context.principal.userId).not('status', 'in', notDone).is('deleted_at', null),
      db.from('tasks').select('*', { count: 'exact', head: true })
        .eq('org_id', orgId).not('status', 'in', notDone).is('deleted_at', null),
    ]);

    const firstError = [overdueRes, dueSoonRes, blockedRes, mineRes, openRes]
      .find(result => result.error);
    if (firstError?.error) return jsonError(firstError.error.message, 500);

    return jsonOk({
      overdue: overdueRes.count ?? 0,
      due_soon: dueSoonRes.count ?? 0,
      blocked: blockedRes.count ?? 0,
      mine: mineRes.count ?? 0,
      total_open: openRes.count ?? 0,
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : 'Task summary failed', 500);
  }
}
