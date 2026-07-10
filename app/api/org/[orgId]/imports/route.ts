import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { enqueueImportJob } from '@/lib/import/job-queue';
import type { EntityType } from '@/lib/import/types';
import { getOrgAccess, hasOrgAccess } from '@/lib/org-access';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

interface RouteParams {
  params: Promise<{ orgId: string }>;
}

const NO_STORE = { 'Cache-Control': 'no-store' } as const;

const ENTITY_FILE_MAP: Record<string, EntityType> = {
  'funds.csv': 'holdings',
  'donors.csv': 'donors',
  'investees.csv': 'investees',
  'gifts.csv': 'contributions',
  'custom_fields.csv': 'metrics',
};

function json(body: unknown, init: ResponseInit = {}) {
  return NextResponse.json(body, {
    ...init,
    headers: {
      ...NO_STORE,
      ...(init.headers || {}),
    },
  });
}

async function requireOrgAdmin(orgId: string) {
  const supabase = await createServerClient();
  const access = await getOrgAccess(supabase, orgId);
  if (!access.user) return { user: null, error: json({ error: 'Unauthorized' }, { status: 401 }) };
  if (!hasOrgAccess(access, 'admin')) {
    return { user: null, error: json({ error: 'Org admin access required' }, { status: 403 }) };
  }

  return { user: access.user, error: null };
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const { error } = await requireOrgAdmin(orgId);
  if (error) return error;

  const admin = createAdminClient();
  const { data, error: jobsError } = await admin
    .from('import_jobs')
    .select('*')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });

  if (jobsError) return json({ error: jobsError.message }, { status: 500 });
  return json({ jobs: data || [] });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { orgId } = await params;
  const { user, error } = await requireOrgAdmin(orgId);
  if (error) return error;

  const admin = createAdminClient();
  const formData = await req.formData();

  const name = formData.get('name') as string | null;
  const portfolioId = formData.get('portfolio_id') as string | null;
  const sourceType = (formData.get('source_type') as string | null) ?? 'csv_export';
  const mappingProfileId = formData.get('mapping_profile_id') as string | null;

  if (!name?.trim()) return json({ error: 'name is required' }, { status: 400 });
  if (sourceType !== 'csv_export') return json({ error: 'Only CSV imports are supported from the org workbench' }, { status: 400 });

  if (portfolioId) {
    const { data: portfolio } = await admin
      .from('portfolios')
      .select('id')
      .eq('id', portfolioId)
      .eq('org_id', orgId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!portfolio) return json({ error: 'portfolio_id does not belong to this organization' }, { status: 400 });
  }

  const { data: job, error: jobError } = await admin
    .from('import_jobs')
    .insert({
      name: name.trim(),
      portfolio_id: portfolioId || null,
      org_id: orgId,
      source_type: 'csv_export',
      mapping_profile_id: mappingProfileId || null,
      status: 'pending',
      created_by: user!.id,
    })
    .select()
    .single();

  if (jobError || !job) {
    return json({ error: jobError?.message ?? 'Failed to create import job' }, { status: 500 });
  }

  const storagePaths: Partial<Record<EntityType, string>> = {};
  for (const [filename, entityType] of Object.entries(ENTITY_FILE_MAP)) {
    const file = formData.get(filename) as File | null;
    if (!file) continue;

    const storagePath = `${orgId}/imports/${job.id}/${entityType}.csv`;
    const { error: uploadError } = await admin.storage
      .from('imports')
      .upload(storagePath, await file.arrayBuffer(), {
        contentType: 'text/csv',
        upsert: false,
      });

    if (uploadError) {
      await admin
        .from('import_jobs')
        .update({ status: 'failed', error_message: uploadError.message })
        .eq('id', job.id);
      return json({ error: uploadError.message, job }, { status: 500 });
    }

    storagePaths[entityType] = storagePath;
  }

  if (Object.keys(storagePaths).length === 0) {
    await admin.from('import_jobs').delete().eq('id', job.id);
    return json({ error: 'At least one CSV file is required' }, { status: 400 });
  }

  await admin
    .from('import_jobs')
    .update({ source_config: { storage_paths: storagePaths } })
    .eq('id', job.id);

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
    await admin
      .from('import_jobs')
      .update({
        status: 'failed',
        error_message: `Import queue unavailable: ${message}`,
      })
      .eq('id', job.id);
    return json({ error: 'Import queue unavailable', detail: message, job }, { status: 503 });
  }

  const { data: updatedJob } = await admin
    .from('import_jobs')
    .select('*')
    .eq('id', job.id)
    .single();

  return json({ job: updatedJob || job, bullJobId }, { status: 201 });
}
