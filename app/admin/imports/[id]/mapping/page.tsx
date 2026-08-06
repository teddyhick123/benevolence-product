// app/admin/imports/[id]/mapping/page.tsx
// Mapping review page — server component

import Link from 'next/link';
import { createServerClient, createAdminClient } from '@/lib/supabase';
import { branding } from '@/lib/config';
import { MappingPageClient } from './MappingPageClient';
import type { ImportJob, MappingProfile } from '@/lib/import/types';
import { STAGING_TABLE_MAP } from '@/lib/import/types';
import { fromImportRelation } from '@/lib/import/database';

export const dynamic = 'force-dynamic';

export default async function MappingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <div className="card p-6 text-sm text-neutral-600">
        Not signed in.{' '}
        <Link href="/login" className="text-azure underline">
          Sign in
        </Link>
      </div>
    );
  }

  const { data: isAdmin } = await supabase.rpc('is_app_admin');
  if (!isAdmin) {
    return <div className="card p-6 text-sm text-neutral-600">Admin access required.</div>;
  }

  const adminSupabase = createAdminClient();

  const { data: job, error: jobError } = await adminSupabase
    .from('import_jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (jobError || !job) {
    return <div className="card p-6 text-sm text-red-600">Import job not found.</div>;
  }

  const importJob = job as ImportJob;

  // Load mapping profile
  let mappingProfile: MappingProfile | null = null;
  if (importJob.mapping_profile_id) {
    const { data: profile } = await adminSupabase
      .from('import_mapping_profiles')
      .select('*')
      .eq('id', importJob.mapping_profile_id)
      .single();
    mappingProfile = profile as MappingProfile | null;
  }

  // Fall back to default Blackbaud profile
  if (!mappingProfile) {
    const { data: defaultProfile } = await adminSupabase
      .from('import_mapping_profiles')
      .select('*')
      .eq('is_default', true)
      .limit(1)
      .single();
    mappingProfile = defaultProfile as MappingProfile | null;
  }

  if (!mappingProfile) {
    return (
      <div className="card p-6 text-sm text-red-600">
        No mapping profile found. Please create one first.
      </div>
    );
  }

  // Get a sample row from each staging table to extract source field names
  const entityTypes = Object.keys(STAGING_TABLE_MAP) as Array<keyof typeof STAGING_TABLE_MAP>;
  const stagingPreviews = await Promise.all(
    entityTypes.map(async (entity) => {
      const table = STAGING_TABLE_MAP[entity];
      const { data: sampleRows } = await fromImportRelation(adminSupabase, table)
        .select('raw_data')
        .eq('import_job_id', id)
        .limit(5);

      const { count } = await fromImportRelation(adminSupabase, table)
        .select('*', { count: 'exact', head: true })
        .eq('import_job_id', id);

      const sourceFields =
        sampleRows?.[0]?.raw_data ? Object.keys(sampleRows[0].raw_data as Record<string, unknown>) : [];
      const sampleRecords = (sampleRows ?? []).map((r) => r.raw_data as Record<string, unknown>);

      return { entity, sourceFields, sampleRecords, rowCount: count ?? 0 };
    })
  );

  const activePreviews = stagingPreviews.filter((p) => p.rowCount > 0);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <div className="flex items-center gap-3 mb-1">
          <Link href={`/admin/imports/${id}`} className="text-neutral-400 hover:text-neutral-600 text-sm">
            ← {importJob.name}
          </Link>
        </div>
        <h1 className="text-2xl font-semibold">Field Mapping</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Map source CSV columns to {branding.appName} fields. Save & Validate to check data quality.
        </p>
      </div>

      <MappingPageClient
        job={importJob}
        mappingProfile={mappingProfile}
        stagingPreviews={activePreviews.length > 0 ? activePreviews : stagingPreviews}
      />
    </div>
  );
}
