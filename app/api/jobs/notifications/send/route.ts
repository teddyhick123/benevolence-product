// app/api/jobs/notifications/send/route.ts
import { NextRequest } from 'next/server';
import { isAccessDenied, requireJobAccess } from '@/lib/api/access';
import { createNotificationJobRepository } from '@/lib/api/repositories/notification-jobs';
import { jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const access = requireJobAccess(req, 'notifications');
  if (isAccessDenied(access)) return access.response;

  const body = await req.json().catch(() => ({}));
  const result = await createNotificationJobRepository(access.context).deliver({
    dryRun: body.dry_run ?? false,
  });
  return jsonOk(result, result.ok ? {} : { status: 500 });
}
