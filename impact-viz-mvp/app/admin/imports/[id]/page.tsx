// app/admin/imports/[id]/page.tsx
// Import job detail page — server component

import Link from 'next/link';
import { createServerClient } from '@/lib/supabase';
import { ImportStatusBadge } from '@/components/admin/ImportStatusBadge';
import type { ImportJob } from '@/lib/import/types';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface StatCardProps {
  label: string;
  value: number;
  color?: string;
}

function StatCard({ label, value, color = 'text-neutral-900' }: StatCardProps) {
  return (
    <div className="card p-5 flex flex-col gap-1">
      <div className={`text-2xl font-bold tabular-nums ${color}`}>
        {value.toLocaleString()}
      </div>
      <div className="text-xs text-neutral-500 uppercase tracking-wide">{label}</div>
    </div>
  );
}

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

  const { data: isAdmin } = await supabase.rpc('is_admin');
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

  // Load AI suggestions count
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

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {importJob.status === 'paused' && (
            <button className="px-4 py-2 text-sm rounded-md bg-yellow-50 border border-yellow-200 text-yellow-700 hover:bg-yellow-100 transition-colors">
              Resume
            </button>
          )}
          {(importJob.status === 'running' || importJob.status === 'paused') && (
            <button className="px-4 py-2 text-sm rounded-md border border-neutral-200 hover:bg-neutral-50 transition-colors">
              Pause
            </button>
          )}
          {importJob.status === 'completed' && (
            <button className="px-4 py-2 text-sm rounded-md bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100 transition-colors">
              Rollback
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Extracted" value={importJob.total_records_extracted} color="text-blue-700" />
        <StatCard label="Validated" value={importJob.records_validated} color="text-azure" />
        <StatCard label="Loaded" value={importJob.records_loaded} color="text-green-700" />
        <StatCard label="Failed" value={importJob.records_failed} color="text-red-600" />
      </div>

      {/* Tabs */}
      <ImportDetailTabs job={importJob} suggestionsCount={suggestionsCount ?? 0} />
    </div>
  );
}

function ImportDetailTabs({
  job,
  suggestionsCount,
}: {
  job: ImportJob;
  suggestionsCount: number;
}) {
  return (
    <div className="space-y-4">
      {/* Tab headers — simplified static rendering for server component */}
      <div className="flex gap-1 border-b border-neutral-200">
        {['Overview', 'Errors', 'AI Suggestions', 'Audit Log'].map((tab) => (
          <div
            key={tab}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === 'Overview'
                ? 'border-azure text-azure'
                : 'border-transparent text-neutral-500'
            }`}
          >
            {tab}
            {tab === 'AI Suggestions' && suggestionsCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 text-xs rounded-full bg-azure text-white">
                {suggestionsCount}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Overview tab content */}
      <div className="card p-6 space-y-4">
        <h3 className="font-medium">Import Overview</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-neutral-500">Source Type</dt>
            <dd className="font-medium capitalize">{job.source_type.replace(/_/g, ' ')}</dd>
          </div>
          <div>
            <dt className="text-neutral-500">Status</dt>
            <dd>
              <ImportStatusBadge status={job.status} />
            </dd>
          </div>
          {job.mapping_profile_id && (
            <div>
              <dt className="text-neutral-500">Mapping Profile</dt>
              <dd className="font-medium font-mono text-xs">{job.mapping_profile_id}</dd>
            </div>
          )}
          {job.pause_reason && (
            <div className="col-span-2">
              <dt className="text-neutral-500">Pause Reason</dt>
              <dd className="text-yellow-700">{job.pause_reason}</dd>
            </div>
          )}
          {job.notes && (
            <div className="col-span-2">
              <dt className="text-neutral-500">Notes</dt>
              <dd>{job.notes}</dd>
            </div>
          )}
        </dl>

        <div className="pt-2 border-t border-neutral-100">
          <Link
            href={`/admin/imports/${job.id}/mapping`}
            className="text-azure hover:underline text-sm"
          >
            Review Field Mapping →
          </Link>
        </div>
      </div>

      {/* Errors tab placeholder */}
      <div className="card p-6">
        <h3 className="font-medium mb-3">Validation Errors</h3>
        <p className="text-sm text-neutral-500">
          Switch to the Errors tab to browse validation issues.
          Use{' '}
          <code className="text-xs bg-neutral-100 px-1 py-0.5 rounded">
            GET /api/admin/imports/{job.id}/errors
          </code>{' '}
          to fetch errors programmatically.
        </p>
      </div>

      {/* AI Suggestions tab placeholder */}
      <div className="card p-6">
        <h3 className="font-medium mb-3">AI Suggestions</h3>
        <p className="text-sm text-neutral-500">
          AI analysis will begin once validation is complete.
        </p>
        {suggestionsCount > 0 && (
          <p className="text-sm text-azure mt-2">
            {suggestionsCount} suggestion{suggestionsCount === 1 ? '' : 's'} available for review.
          </p>
        )}
      </div>
    </div>
  );
}
