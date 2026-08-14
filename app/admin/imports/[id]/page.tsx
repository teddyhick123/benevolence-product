// app/admin/imports/[id]/page.tsx
// Import job detail page — server component

import Link from 'next/link';
import { createServerClient } from '@/lib/api/server-client';
import { ImportStatusBadge } from '@/components/admin/ImportStatusBadge';
import { ImportProgressMonitor } from '@/components/admin/ImportProgressMonitor';
import { ImportErrorsTable } from '@/components/admin/ImportErrorsTable';
import { ImportAuditLog } from '@/components/admin/ImportAuditLog';
import { ImportCopilot } from '@/components/admin/ImportCopilot';
import { ImportReportViewer } from '@/components/admin/ImportReportViewer';
import { MigrationHealthScore } from '@/components/admin/MigrationHealthScore';
import type { ImportJob } from '@/lib/import/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function ImportDetailPage({
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
      <div className="mx-auto max-w-4xl">
        <div className="card p-6 text-sm text-neutral-600">
          Not signed in.{' '}
          <Link href="/login" className="text-azure underline">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  const { data: isAdmin } = await supabase.rpc('is_app_admin');
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="card p-6 text-sm text-neutral-600">Admin access required.</div>
      </div>
    );
  }

  const { data: job, error } = await supabase
    .from('import_jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (error || !job) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="card p-6 text-sm text-red-600">Import job not found.</div>
      </div>
    );
  }

  const importJob = job as ImportJob;

  const { count: suggestionsCount } = await supabase
    .from('import_ai_suggestions')
    .select('*', { count: 'exact', head: true })
    .eq('import_job_id', id);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Link href="/admin/imports" className="text-neutral-400 hover:text-neutral-600 text-sm">
              ← Imports
            </Link>
          </div>
          <h1 className="text-2xl font-semibold">{importJob.name}</h1>
          <div className="flex items-center gap-3 text-sm text-neutral-500">
            <ImportStatusBadge status={importJob.status} />
            <span>Created {new Date(importJob.created_at).toLocaleDateString()}</span>
            {importJob.started_at && (
              <span>Started {new Date(importJob.started_at).toLocaleString()}</span>
            )}
          </div>
        </div>
        <MigrationHealthScore
          totalRecords={importJob.total_records_extracted ?? 0}
          failedRecords={importJob.records_failed ?? 0}
          hasCriticalErrors={(importJob.records_failed ?? 0) > 0}
        />
      </div>

      {/* Real-time progress monitor */}
      <div className="card p-6">
        <h3 className="font-medium mb-4">Progress</h3>
        <ImportProgressMonitor importJobId={id} initialJob={importJob} />
      </div>

      {/* Overview + details */}
      <div className="card p-6 space-y-4">
        <h3 className="font-medium">Import Details</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-neutral-500">Source Type</dt>
            <dd className="font-medium capitalize">{importJob.source_type.replace(/_/g, ' ')}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Status</dt>
            <dd>
              <ImportStatusBadge status={importJob.status} />
            </dd>
          </div>
          {importJob.mapping_profile_id && (
            <div>
              <dt className="text-neutral-500">Mapping Profile</dt>
              <dd className="font-medium font-mono text-xs">{importJob.mapping_profile_id}</dd>
            </div>
          )}
          {importJob.error_message && (
            <div className="col-span-2">
              <dt className="text-neutral-500">Error</dt>
              <dd className="text-red-700">{importJob.error_message}</dd>
            </div>
          )}
        </dl>

        <div className="pt-2 border-t border-neutral-100">
          <Link
            href={`/admin/imports/${importJob.id}/mapping`}
            className="text-azure hover:underline text-sm"
          >
            Review Field Mapping →
          </Link>
        </div>
      </div>

      {/* Validation Errors */}
      <div id="errors" className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">Validation Errors</h3>
          {suggestionsCount !== null && suggestionsCount > 0 && (
            <span className="text-xs text-azure">
              {suggestionsCount} AI suggestion{suggestionsCount === 1 ? '' : 's'} available
            </span>
          )}
        </div>
        <ImportErrorsTable importJobId={id} />
      </div>

      {/* Audit Log */}
      <div id="audit" className="card p-6">
        <h3 className="font-medium mb-4">Audit Log</h3>
        <ImportAuditLog importJobId={id} />
      </div>

      {/* Migration Report */}
      <div id="report" className="card p-6">
        <h3 className="font-medium mb-4">Migration Report</h3>
        <ImportReportViewer importJobId={id} />
      </div>

      {/* AI Copilot panel */}
      <ImportCopilot importJobId={id} initialStatus={importJob.status} />
    </div>
  );
}
