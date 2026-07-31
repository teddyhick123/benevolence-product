// app/api/org/[orgId]/notifications/[notificationId]/read/route.ts
import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string; notificationId: string }> }
) {
  try {
    const { orgId, notificationId } = await params;

    const access = await requireOrgAccess(orgId);
    if (isAccessDenied(access)) return access.response;
    const { db, user } = access.context;
    const { error } = await db
      .from('notification_events')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId)
      .eq('recipient_user_id', user.id)
      .eq('org_id', orgId)
      .is('read_at', null);

    if (error) throw error;
    return jsonOk({ ok: true });
  } catch (err: any) {
    return jsonError(err.message, 500);
  }
}
