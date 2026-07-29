// app/api/admin/imports/route.ts
// GET: list import jobs; POST: create new import job

import { NextRequest } from 'next/server';
import { requireAppAdmin } from '@/lib/api/access';
import { jsonError, jsonOk } from '@/lib/api/responses';
import { enqueueImportJob } from '@/lib/import/job-queue';
import type { EntityType } from '@/lib/import/types';

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

// GET /api/admin/imports
export async function GET(req: NextRequest) {
  const access = await requireAppAdmin();
  if (!access.ok) return access.response;

  const { searchParams } = new URL(req.url);
  const portfolioId = searchParams.get('portfolio_id');
  const status = searchParams.get('status');

  let query = access.context.db
    .from('import_jobs')
    .select('*')
    .order('created_at', { ascending: false });

  if (portfolioId) query = query.eq('portfolio_id', portfolioId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    return jsonError(error.message, 500);
  }

  return jsonOk({ jobs: data });
}

// POST /api/admin/imports
export async function POST(req: NextRequest) {
  const access = await requireAppAdmin();
  if (!access.ok) return access.response;

  const { db, user } = access.context;
  const formData = await req.formData().catch(() => null);
  if (!formData) return jsonError('Invalid multipart form data', 400);

  const name = textEntry(formData, 'name');
  const portfolioId = textEntry(formData, 'portfolio_id');
  const orgId = textEntry(formData, 'org_id');
  const sourceType = textEntry(formData, 'source_type') ?? 'csv_export';
  const mappingProfileId = textEntry(formData, 'mapping_profile_id');

  if (!name?.trim()) return jsonError('name is required', 400);
  if (!orgId) return jsonError('org_id is required', 400);
  if (!['csv_export', 'blackbaud_api', 'direct_db'].includes(sourceType)) {
    return jsonError('Invalid source_type', 400);
  }

  const { data: organization, error: organizationError } = await db
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .maybeSingle();
  if (organizationError) return jsonError(organizationError.message, 500);
  if (!organization) return jsonError('Organization not found', 400);

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

  // Create the import_jobs row first to get an ID
  const { data: job, error: jobError } = await db
    .from('import_jobs')
    .insert({
      name: name.trim(),
      portfolio_id: portfolioId || null,
      org_id: orgId || null,
      source_type: sourceType as 'csv_export' | 'blackbaud_api' | 'direct_db',
      mapping_profile_id: mappingProfileId || null,
      status: 'pending',
      created_by: user.id,
    })
    .select()
    .single();

  if (jobError || !job) {
    return jsonError(jobError?.message ?? 'Failed to create job', 500);
  }

  const jobId: string = job.id;

  // Upload each CSV file to Supabase Storage
  const storagePaths: Partial<Record<EntityType, string>> = {};

  for (const [filename, entityType] of Object.entries(ENTITY_FILE_MAP)) {
    const file = formData.get(filename);
    if (!file || typeof file === 'string') continue;

    const storagePath = `${orgId}/imports/${jobId}/${entityType}.csv`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await db.storage
      .from('imports')
      .upload(storagePath, arrayBuffer, {
        contentType: 'text/csv',
        upsert: false,
      });

    if (uploadError) {
      console.error(`Failed to upload ${filename}:`, uploadError.message);
      continue;
    }

    storagePaths[entityType] = storagePath;
  }

  // Update source_config with storage paths
  const { error: configError } = await db
    .from('import_jobs')
    .update({ source_config: { storage_paths: storagePaths } })
    .eq('id', jobId)
    .eq('org_id', orgId);
  if (configError) return jsonError(configError.message, 500, { job });

  // Enqueue the Bull job
  let bullJobId = '';
  if (Object.keys(storagePaths).length > 0) {
    try {
      bullJobId = await enqueueImportJob({
        importJobId: jobId,
        portfolioId: portfolioId || undefined,
        sourceType: sourceType as 'csv_export' | 'blackbaud_api' | 'direct_db',
        storagePaths,
        mappingProfileId: mappingProfileId || undefined,
      });
    } catch (queueError) {
      const message = queueError instanceof Error ? queueError.message : String(queueError);
      await db
        .from('import_jobs')
        .update({ status: 'failed', error_message: `Import queue unavailable: ${message}` })
        .eq('id', jobId)
        .eq('org_id', orgId);
      return jsonError('Import queue unavailable', 503, { detail: message, job });
    }
  }

  return jsonOk({ job, bullJobId }, { status: 201 });
}
