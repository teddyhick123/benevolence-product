// app/api/admin/imports/[id]/run-validate/route.ts
// POST: trigger transform+validate phase for a specific import job

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireAppAdmin } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { runTransformValidate } from '@/lib/import/etl-runner';
import type { MappingProfile } from '@/lib/import/types';

const validationSchema = z.object({
  entityTypes: z.array(
    z.enum(['donors', 'investees', 'holdings', 'contributions', 'metrics'])
  ).min(1).optional(),
}).strict();

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireAppAdmin();
  if (!access.ok) return access.response;

  const { id } = await params;
  const parsed = validationSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return jsonError('Validation failed', 400, { details: parsed.error.format() });
  const { entityTypes } = parsed.data;
  const { db } = access.context;

  const { data: job, error: jobError } = await db
    .from('import_jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (jobError || !job) {
    return jsonError('Import job not found', 404);
  }

  // Find mapping profile
  let profile: MappingProfile | null = null;

  if (job.mapping_profile_id) {
    const { data } = await db
      .from('import_mapping_profiles')
      .select('*')
      .eq('id', job.mapping_profile_id)
      .eq('org_id', job.org_id)
      .single();
    profile = data as MappingProfile | null;
  }

  if (!profile) {
    const { data: defaultProfile } = await db
      .from('import_mapping_profiles')
      .select('*')
      .eq('org_id', job.org_id)
      .eq('is_default', true)
      .limit(1)
      .single();
    profile = defaultProfile as MappingProfile | null;
  }

  if (!profile) {
    return jsonError('No mapping profile found', 400);
  }

  const result = await runTransformValidate(db, id, profile, {
    entityTypes,
    portfolioId: job.portfolio_id ?? undefined,
  });

  return jsonOk(result);
}
