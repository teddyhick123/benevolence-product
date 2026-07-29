// app/api/admin/builder/proposals/route.ts
import { NextRequest } from 'next/server';
import { isAccessDenied, requireAppAdmin } from '@/lib/api/access';
import { createAppAdminBuilderRepository } from '@/lib/api/repositories/builder';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const access = await requireAppAdmin();
    if (isAccessDenied(access)) return access.response;

    const status = req.nextUrl.searchParams.get('status') || 'pending';
    const validStatuses = ['pending', 'approved', 'rejected', 'applied'];
    if (!validStatuses.includes(status)) {
      return jsonError('Invalid status filter', 400);
    }

    const data = await createAppAdminBuilderRepository({
      isAppAdmin: access.context.isAppAdmin,
      actorId: access.context.user.id,
    }).listProposals(status);

    const proposals = (data || []).map(({ organizations, current_revision, ...p }) => {
      const revision = Array.isArray(current_revision) ? current_revision[0] : current_revision;
      return {
        ...p,
        file_count: (revision as { file_count?: number } | null)?.file_count ?? null,
        org_name: (Array.isArray(organizations) ? organizations[0]?.name : (organizations as { name: string } | null)?.name) ?? null,
      };
    });
    return jsonOk({ proposals });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return jsonError(message, 500);
  }
}
