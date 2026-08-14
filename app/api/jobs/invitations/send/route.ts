import { NextRequest } from 'next/server';
import { isAccessDenied, requireJobAccess } from '@/lib/api/access';
import { createInvitationJobRepository } from '@/lib/api/repositories/invitation-jobs';
import { jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const access = requireJobAccess(req, 'invitations');
  if (isAccessDenied(access)) return access.response;

  const body = await req.json().catch(() => ({}));
  const result = await createInvitationJobRepository(access.context).deliver({
    dryRun: body.dry_run ?? false,
    limit: typeof body.limit === 'number' ? body.limit : undefined,
  });
  return jsonOk(result, result.ok ? {} : { status: 500 });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
