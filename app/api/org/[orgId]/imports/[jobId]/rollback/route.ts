import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireOrgAccess } from '@/lib/api/access';
import {
  createImportRollbackRepository,
  ImportRollbackJobNotFoundError,
  ImportRollbackStatusError,
} from '@/lib/api/repositories/imports';
import { jsonError, jsonOk } from '@/lib/api/responses';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: Promise<{ orgId: string; jobId: string }>;
}

const rollbackSchema = z.object({
  scope: z.enum(['full', 'donors', 'investees', 'holdings', 'contributions', 'metrics'])
    .default('full'),
}).strict();

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { orgId, jobId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (!access.ok) return access.response;

  const parsed = rollbackSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });

  try {
    const repository = createImportRollbackRepository({
      orgId,
      actorId: access.context.user.id,
    });
    return jsonOk(await repository.rollback(jobId, parsed.data.scope));
  } catch (err: unknown) {
    if (err instanceof ImportRollbackJobNotFoundError) return jsonError(err.message, 404);
    if (err instanceof ImportRollbackStatusError) return jsonError(err.message, 400);
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(message, 500);
  }
}
