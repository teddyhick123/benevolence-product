// app/api/admin/imports/[id]/rollback/route.ts
// POST: rollback an import job (full or partial scope)

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAppAdmin } from '@/lib/api/access';
import {
  createImportRollbackRepository,
  ImportRollbackJobNotFoundError,
  ImportRollbackStatusError,
} from '@/lib/api/repositories/imports';
import { jsonError, jsonOk } from '@/lib/api/responses';

const rollbackSchema = z.object({
  scope: z.enum(['full', 'donors', 'investees', 'holdings', 'contributions', 'metrics'])
    .default('full'),
}).strict();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAppAdmin();
  if (!access.ok) return access.response;

  const { id } = await params;
  const parsed = rollbackSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });

  const { data: job, error: jobError } = await access.context.db
    .from('import_jobs')
    .select('id, org_id')
    .eq('id', id)
    .maybeSingle();

  if (jobError || !job) {
    return jsonError('Import job not found', 404);
  }

  try {
    const repository = createImportRollbackRepository({
      orgId: job.org_id,
      actorId: access.context.user.id,
    });
    return jsonOk(await repository.rollback(id, parsed.data.scope));
  } catch (err: unknown) {
    if (err instanceof ImportRollbackJobNotFoundError) return jsonError(err.message, 404);
    if (err instanceof ImportRollbackStatusError) return jsonError(err.message, 400);
    const message = err instanceof Error ? err.message : String(err);
    return jsonError(message, 500);
  }
}
