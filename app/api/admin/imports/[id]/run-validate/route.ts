// app/api/admin/imports/[id]/run-validate/route.ts
// POST: trigger transform+validate phase for a specific import job

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createServerClient } from '@/lib/supabase';
import { runTransformValidate } from '@/lib/import/etl-runner';
import type { MappingProfile } from '@/lib/import/types';
import { requireAdmin } from '@/lib/admin-auth';

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await requireAdmin();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const entityTypes: string[] | undefined = body.entityTypes;

  const supabase = createAdminClient();

  const { data: job, error: jobError } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: 'Import job not found' }, { status: 404 });
  }

  // Find mapping profile
  let profile: MappingProfile | null = null;

  if (job.mapping_profile_id) {
    const { data } = await supabase
      .from('import_mapping_profiles')
      .select('*')
      .eq('id', job.mapping_profile_id)
      .single();
    profile = data as MappingProfile | null;
  }

  if (!profile) {
    const { data: defaultProfile } = await supabase
      .from('import_mapping_profiles')
      .select('*')
      .eq('is_default', true)
      .limit(1)
      .single();
    profile = defaultProfile as MappingProfile | null;
  }

  if (!profile) {
    return NextResponse.json({ error: 'No mapping profile found' }, { status: 400 });
  }

  const result = await runTransformValidate(supabase, id, profile, {
    entityTypes,
    portfolioId: job.portfolio_id ?? undefined,
  });

  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
