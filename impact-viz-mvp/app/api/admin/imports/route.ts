// app/api/admin/imports/route.ts
// GET: list import jobs; POST: create new import job

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { enqueueImportJob } from '@/lib/import/job-queue';
import type { EntityType } from '@/lib/import/types';

// Verify the requesting user is an admin
async function requireAdmin(): Promise<string | null> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: adminRow } = await supabase
    .from('admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();

  return adminRow ? user.id : null;
}

// GET /api/admin/imports
export async function GET(req: NextRequest) {
  const userId = await requireAdmin();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const portfolioId = searchParams.get('portfolio_id');
  const status = searchParams.get('status');

  const supabase = createAdminClient();
  let query = supabase
    .from('import_jobs')
    .select('*')
    .order('created_at', { ascending: false });

  if (portfolioId) query = query.eq('portfolio_id', portfolioId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: data }, { headers: { 'Cache-Control': 'no-store' } });
}

// POST /api/admin/imports
export async function POST(req: NextRequest) {
  const userId = await requireAdmin();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const formData = await req.formData();

  const name = formData.get('name') as string | null;
  const portfolioId = formData.get('portfolio_id') as string | null;
  const orgId = formData.get('org_id') as string | null;
  const sourceType = (formData.get('source_type') as string | null) ?? 'csv_export';
  const mappingProfileId = formData.get('mapping_profile_id') as string | null;

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  // Create the import_jobs row first to get an ID
  const { data: job, error: jobError } = await supabase
    .from('import_jobs')
    .insert({
      name,
      portfolio_id: portfolioId || null,
      org_id: orgId || null,
      source_type: sourceType as 'csv_export' | 'blackbaud_api' | 'direct_db',
      mapping_profile_id: mappingProfileId || null,
      status: 'pending',
      created_by: userId,
    })
    .select()
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: jobError?.message ?? 'Failed to create job' }, { status: 500 });
  }

  const jobId: string = job.id;

  // Upload each CSV file to Supabase Storage
  const entityFileMap: Record<string, string> = {
    'funds.csv': 'holdings',
    'constituents.csv': 'investees',
    'gifts.csv': 'contributions',
    'custom_fields.csv': 'metrics',
    'users.csv': 'users',
  };

  const storagePaths: Partial<Record<EntityType, string>> = {};

  for (const [filename, entityType] of Object.entries(entityFileMap)) {
    const file = formData.get(filename) as File | null;
    if (!file) continue;

    const storagePath = `imports/${jobId}/${entityType}.csv`;
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from('imports')
      .upload(storagePath, arrayBuffer, {
        contentType: 'text/csv',
        upsert: false,
      });

    if (uploadError) {
      console.error(`Failed to upload ${filename}:`, uploadError.message);
      continue;
    }

    storagePaths[entityType as EntityType] = storagePath;
  }

  // Update source_config with storage paths
  await supabase
    .from('import_jobs')
    .update({ source_config: { storage_paths: storagePaths } })
    .eq('id', jobId);

  // Enqueue the Bull job
  let bullJobId = '';
  if (Object.keys(storagePaths).length > 0) {
    bullJobId = await enqueueImportJob({
      importJobId: jobId,
      portfolioId: portfolioId || undefined,
      sourceType: sourceType as 'csv_export' | 'blackbaud_api' | 'direct_db',
      storagePaths,
      mappingProfileId: mappingProfileId || undefined,
    });
  }

  return NextResponse.json(
    { job, bullJobId },
    { status: 201, headers: { 'Cache-Control': 'no-store' } }
  );
}
