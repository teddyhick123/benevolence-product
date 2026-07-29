import { NextRequest } from 'next/server';
import { requireOrgAccess } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { enqueueImportJob } from '@/lib/import/job-queue';
import type { EntityType } from '@/lib/import/types';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

const ENTITY_FILE_MAP: Record<string, EntityType> = {
  'funds.csv': 'holdings',
  'donors.csv': 'donors',
  'investees.csv': 'investees',
  'gifts.csv': 'contributions',
  'custom_fields.csv': 'metrics',
};

function textEntry(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  return typeof value === 'string' ? value : null;
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (!access.ok) return access.response;

  const { data, error: jobsError } = await access.context.db
    .from('import_jobs')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (jobsError) return jsonError(jobsError.message, 500);
  return jsonOk({ jobs: data || [] });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const access = await requireOrgAccess(orgId, 'admin');
  if (!access.ok) return access.response;

  const { db, user } = access.context;
  const formData = await req.formData().catch(() => null);
  if (!formData) return jsonError('Invalid multipart form data', 400);

  const name = textEntry(formData, 'name');
  const portfolioId = textEntry(formData, 'portfolio_id');
  const sourceType = textEntry(formData, 'source_type') ?? 'csv_export';
  const mappingProfileId = textEntry(formData, 'mapping_profile_id');

  if (!name?.trim()) return jsonError('name is required', 400);
  if (sourceType !== 'csv_export') {
    return jsonError('Only CSV imports are supported from the org workbench', 400);
  }

  if (portfolioId) {
    const { data: portfolio, error: portfolioError } = await db
      .from('portfolios')
      .select('id')
      .eq('id', portfolioId)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (portfolioError) return jsonError(portfolioError.message, 500);
    if (!portfolio) return jsonError('portfolio_id does not belong to this organization', 400);
  }

  if (mappingProfileId) {
    const { data: mappingProfile, error: mappingProfileError } = await db
      .from('import_mapping_profiles')
      .select('id')
      .eq('id', mappingProfileId)
      .eq('org_id', orgId)
      .maybeSingle();
    if (mappingProfileError) return jsonError(mappingProfileError.message, 500);
    if (!mappingProfile) {
      return jsonError('mapping_profile_id does not belong to this organization', 400);
    }
  }

  const { data: job, error: jobError } = await db
    .from('import_jobs')
    .insert({
      name: name.trim(),
      portfolio_id: portfolioId || null,
      org_id: orgId,
      source_type: 'csv_export',
      mapping_profile_id: mappingProfileId || null,
      status: 'pending',
      created_by: user.id,
    })
    .select()
    .single();

  if (jobError || !job) {
    return jsonError(jobError?.message ?? 'Failed to create import job', 500);
  }

  const storagePaths: Partial<Record<EntityType, string>> = {};
  for (const [filename, entityType] of Object.entries(ENTITY_FILE_MAP)) {
    const file = formData.get(filename);
    if (!file || typeof file === 'string') continue;

    const storagePath = `${orgId}/imports/${job.id}/${entityType}.csv`;
    const { error: uploadError } = await db.storage
      .from('imports')
      .upload(storagePath, await file.arrayBuffer(), {
        contentType: 'text/csv',
        upsert: false,
      });

    if (uploadError) {
      await db
        .from('import_jobs')
        .update({ status: 'failed', error_message: uploadError.message })
        .eq('id', job.id)
        .eq('org_id', orgId);
      return jsonError(uploadError.message, 500, { job });
    }

    storagePaths[entityType] = storagePath;
  }

  if (Object.keys(storagePaths).length === 0) {
    await db.from('import_jobs').delete().eq('id', job.id).eq('org_id', orgId);
    return jsonError('At least one CSV file is required', 400);
  }

  const { error: sourceConfigError } = await db
    .from('import_jobs')
    .update({ source_config: { storage_paths: storagePaths } })
    .eq('id', job.id)
    .eq('org_id', orgId);
  if (sourceConfigError) {
    await db
      .from('import_jobs')
      .update({ status: 'failed', error_message: sourceConfigError.message })
      .eq('id', job.id)
      .eq('org_id', orgId);
    return jsonError(sourceConfigError.message, 500, { job });
  }

  let bullJobId = '';
  try {
    bullJobId = await enqueueImportJob({
      importJobId: job.id,
      portfolioId: portfolioId || undefined,
      sourceType: 'csv_export',
      storagePaths,
      mappingProfileId: mappingProfileId || undefined,
    });
  } catch (queueError) {
    const message = queueError instanceof Error ? queueError.message : String(queueError);
    await db
      .from('import_jobs')
      .update({
        status: 'failed',
        error_message: `Import queue unavailable: ${message}`,
      })
      .eq('id', job.id)
      .eq('org_id', orgId);
    return jsonError('Import queue unavailable', 503, { detail: message, job });
  }

  const { data: updatedJob } = await db
    .from('import_jobs')
    .select('*')
    .eq('id', job.id)
    .eq('org_id', orgId)
    .single();

  return jsonOk({ job: updatedJob || job, bullJobId }, { status: 201 });
}
