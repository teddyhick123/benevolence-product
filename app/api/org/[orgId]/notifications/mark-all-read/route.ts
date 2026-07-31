// app/api/org/[orgId]/notifications/mark-all-read/route.ts
import { NextRequest } from 'next/server';
import { isAccessDenied, requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> }
) {
  try {
    const { orgId } = await params;

    const access = await requireOrgAccess(orgId);
    if (isAccessDenied(access)) return access.response;
    const { db, user } = access.context;
    const { error } = await db
      .from('notification_events')
      .update({ read_at: new Date().toISOString() })
      .eq('org_id', orgId)
      .eq('recipient_user_id', user.id)
      .eq('channel', 'in_app')
      .is('read_at', null);

    if (error) throw error;
    return jsonOk({ ok: true });
  } catch (err: any) {
    return jsonError(err.message, 500);
  }
}
