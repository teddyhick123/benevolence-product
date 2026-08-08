'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, DatabaseZap, FileUp, Loader2, RotateCcw, Rows3, ShieldCheck } from 'lucide-react';
import { ImportStatusBadge } from '@/components/admin/ImportStatusBadge';
import { NewImportWizard } from '@/components/admin/NewImportWizard';
import type { EntityType, ImportJob } from '@/lib/import/types';

interface Portfolio {
  id: string;
  name: string;
  org_id: string;
}

interface Props {
  orgId: string;
  canManageImports: boolean;
  initialJobs: ImportJob[];
  portfolios: Portfolio[];
}

type ValidationError = {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  rule?: string;
};

type ErrorRow = {
  id: string;
  row_number: number;
  raw_data: Record<string, string>;
  transformed_data: Record<string, unknown> | null;
  validation_errors: ValidationError[] | null;
  validation_status: string;
  action_taken: string;
};

type StagingCounts = Record<EntityType, {
  total: number;
  valid: number;
  invalid: number;
  pending: number;
  warning: number;
}>;

const ENTITY_OPTIONS: Array<{ value: EntityType; label: string; stagingTable: string }> = [
  { value: 'donors', label: 'Donors', stagingTable: 'staging_import_donors' },
  { value: 'investees', label: 'Organizations', stagingTable: 'staging_import_investees' },
  { value: 'holdings', label: 'Holdings', stagingTable: 'staging_import_holdings' },
  { value: 'contributions', label: 'Contributions', stagingTable: 'staging_import_contributions' },
  { value: 'metrics', label: 'Metrics', stagingTable: 'staging_import_metrics' },
];

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function sourceLabel(value: string) {
  return value.replace(/_/g, ' ');
}

export default function OrgImportWorkbench({ orgId, canManageImports, initialJobs, portfolios }: Props) {
  const [showWizard, setShowWizard] = useState(false);
  const [jobs, setJobs] = useState(initialJobs);
  const [actionId, setActionId] = useState<string | null>(null);
  const [reviewJobId, setReviewJobId] = useState<string | null>(null);
  const [reviewEntity, setReviewEntity] = useState<EntityType>('holdings');
  const [stagingCounts, setStagingCounts] = useState<StagingCounts | null>(null);
  const [errorRows, setErrorRows] = useState<ErrorRow[]>([]);
  const [errorTotal, setErrorTotal] = useState(0);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [fixValues, setFixValues] = useState<Record<string, string>>({});
  const [fixingKey, setFixingKey] = useState<string | null>(null);
  const portfolioNameById = useMemo(
    () => Object.fromEntries(portfolios.map((portfolio) => [portfolio.id, portfolio.name])),
    [portfolios]
  );

  const totals = useMemo(() => {
    return jobs.reduce(
      (acc, job) => {
        acc.extracted += job.total_records_extracted || 0;
        acc.loaded += job.records_loaded || 0;
        acc.failed += (job.records_failed || 0) + (job.error_rows || 0);
        if (job.status === 'needs_review') acc.needsReview += 1;
        return acc;
      },
      { extracted: 0, loaded: 0, failed: 0, needsReview: 0 }
    );
  }, [jobs]);

  useEffect(() => {
    if (!reviewJobId) return;
    let cancelled = false;
    async function loadReview() {
      setReviewLoading(true);
      try {
        const [summaryRes, errorsRes] = await Promise.all([
          apiRequest(`/api/org/${orgId}/imports/${reviewJobId}`, { cache: 'no-store' }),
          apiRequest(`/api/org/${orgId}/imports/${reviewJobId}/errors?entity=${reviewEntity}&limit=25`, { cache: 'no-store' }),
        ]);
        if (cancelled) return;
        if (summaryRes.ok) {
          const summary = await readJson(summaryRes) as { staging_counts?: StagingCounts };
          setStagingCounts(summary.staging_counts || null);
        }
        if (errorsRes.ok) {
          const errors = await readJson(errorsRes) as { rows?: ErrorRow[]; total?: number };
          setErrorRows(errors.rows || []);
          setErrorTotal(errors.total || 0);
        }
      } finally {
        if (!cancelled) setReviewLoading(false);
      }
    }
    loadReview();
    return () => {
      cancelled = true;
    };
  }, [orgId, reviewJobId, reviewEntity]);

  async function refreshJobs() {
    const res = await apiRequest(`/api/org/${orgId}/imports`, { cache: 'no-store' });
    if (!res.ok) return;
    const data = await readJson(res) as { jobs?: ImportJob[] };
    setJobs(data.jobs || []);
  }

  async function handleResume(jobId: string) {
    setActionId(jobId);
    try {
      const res = await apiRequest(`/api/org/${orgId}/imports/${jobId}/resume`, { method: 'POST' });
      if (res.ok) await refreshJobs();
      else {
        const body = await readJson(res).catch(() => ({}));
        alert(body.error || 'Could not resume import');
      }
    } finally {
      setActionId(null);
    }
  }

  async function handleRollback(jobId: string) {
    if (!confirm('Roll back all data loaded by this import? This cannot be undone.')) return;
    setActionId(jobId);
    try {
      const res = await apiRequest(`/api/org/${orgId}/imports/${jobId}/rollback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope: 'full' }),
      });
      if (res.ok) await refreshJobs();
      else {
        const body = await readJson(res).catch(() => ({}));
        alert(body.error || 'Could not roll back import');
      }
    } finally {
      setActionId(null);
    }
  }

  async function applyFix(row: ErrorRow, error: ValidationError) {
    if (!reviewJobId) return;
    const selectedEntity = ENTITY_OPTIONS.find((entity) => entity.value === reviewEntity);
    if (!selectedEntity) return;
    const key = `${row.id}:${error.field}`;
    const proposedValue = fixValues[key];
    if (proposedValue === undefined || proposedValue === '') return;
    setFixingKey(key);
    try {
      const res = await apiRequest(`/api/org/${orgId}/imports/${reviewJobId}/errors`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staging_table: selectedEntity.stagingTable,
          row_id: row.id,
          field: error.field,
          proposed_value: proposedValue,
        }),
      });
      if (!res.ok) {
        const body = await readJson(res).catch(() => ({}));
        alert(body.error || 'Could not apply fix');
        return;
      }
      setFixValues((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      const errorsRes = await apiRequest(`/api/org/${orgId}/imports/${reviewJobId}/errors?entity=${reviewEntity}&limit=25`, { cache: 'no-store' });
      if (errorsRes.ok) {
        const errors = await readJson(errorsRes) as { rows?: ErrorRow[]; total?: number };
        setErrorRows(errors.rows || []);
        setErrorTotal(errors.total || 0);
      }
      const summaryRes = await apiRequest(`/api/org/${orgId}/imports/${reviewJobId}`, { cache: 'no-store' });
      if (summaryRes.ok) {
        const summary = await readJson(summaryRes) as { staging_counts?: StagingCounts };
        setStagingCounts(summary.staging_counts || null);
      }
    } finally {
      setFixingKey(null);
    }
  }

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-azure">
            <DatabaseZap className="h-4 w-4" />
            Data Workbench
          </div>
          <h2 className="mt-1 text-xl font-semibold text-neutral-950">Import, review, and roll back source data</h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            Start with CSV imports for donors, organizations, holdings, contributions, and metrics. Grant-specific imports are the next vertical slice.
          </p>
        </div>
        {canManageImports ? (
          <button
            onClick={() => setShowWizard(true)}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-azure px-4 text-sm font-medium text-white shadow-sm transition hover:bg-azure/90"
          >
            <FileUp className="h-4 w-4" />
            New import
          </button>
        ) : null}
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        <div className="rounded-md bg-neutral-50 p-3">
          <div className="text-2xl font-semibold tabular-nums text-neutral-900">{jobs.length}</div>
          <div className="text-xs text-neutral-500">Import jobs</div>
        </div>
        <div className="rounded-md bg-neutral-50 p-3">
          <div className="text-2xl font-semibold tabular-nums text-neutral-900">{totals.extracted}</div>
          <div className="text-xs text-neutral-500">Rows extracted</div>
        </div>
        <div className="rounded-md bg-neutral-50 p-3">
          <div className="text-2xl font-semibold tabular-nums text-neutral-900">{totals.loaded}</div>
          <div className="text-xs text-neutral-500">Rows loaded</div>
        </div>
        <div className="rounded-md bg-neutral-50 p-3">
          <div className={`text-2xl font-semibold tabular-nums ${totals.failed > 0 ? 'text-red-600' : 'text-neutral-900'}`}>
            {totals.failed}
          </div>
          <div className="text-xs text-neutral-500">Rows needing attention</div>
        </div>
      </div>

      {!canManageImports ? (
        <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <div className="flex gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Only organization admins can create, resume, or roll back imports.</span>
          </div>
        </div>
      ) : null}

      <div className="mt-5 overflow-x-auto rounded-lg border border-neutral-200">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-neutral-100 bg-neutral-50">
              <th className="px-4 py-3 text-left font-medium text-neutral-600">Import</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">Portfolio</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">Source</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">Status</th>
              <th className="px-4 py-3 text-left font-medium text-neutral-600">Progress</th>
              <th className="px-4 py-3 text-right font-medium text-neutral-600">Actions</th>
            </tr>
          </thead>
          <tbody>
            {jobs.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-neutral-500">
                  No structured imports yet.
                </td>
              </tr>
            ) : jobs.map((job) => (
              <tr key={job.id} className="border-b border-neutral-100 last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-neutral-900">{job.name}</div>
                  <div className="text-xs text-neutral-500">{formatDate(job.created_at)}</div>
                </td>
                <td className="px-4 py-3 text-neutral-600">
                  {job.portfolio_id ? portfolioNameById[job.portfolio_id] || 'Portfolio' : 'Organization-wide'}
                </td>
                <td className="px-4 py-3 capitalize text-neutral-600">{sourceLabel(job.source_type)}</td>
                <td className="px-4 py-3"><ImportStatusBadge status={job.status} /></td>
                <td className="px-4 py-3 text-neutral-600">
                  <div className="flex items-center gap-2">
                    <Rows3 className="h-4 w-4 text-neutral-400" />
                    <span>{job.records_loaded}/{job.total_records_extracted} loaded</span>
                    {job.records_failed + job.error_rows > 0 ? (
                      <span className="text-red-600">· {job.records_failed + job.error_rows} issue{job.records_failed + job.error_rows === 1 ? '' : 's'}</span>
                    ) : null}
                  </div>
                  {job.error_message ? <div className="mt-1 max-w-sm truncate text-xs text-red-600">{job.error_message}</div> : null}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setReviewJobId((current) => current === job.id ? null : job.id)}
                      disabled={!canManageImports}
                      className="inline-flex items-center gap-1 text-xs font-medium text-neutral-700 hover:underline disabled:opacity-50"
                    >
                      Review
                    </button>
                    {job.status === 'needs_review' ? (
                      <button
                        onClick={() => handleResume(job.id)}
                        disabled={!canManageImports || actionId === job.id}
                        className="inline-flex items-center gap-1 text-xs font-medium text-azure hover:underline disabled:opacity-50"
                      >
                        <ShieldCheck className="h-3.5 w-3.5" />
                        {actionId === job.id ? 'Resuming' : 'Resume'}
                      </button>
                    ) : null}
                    {['completed', 'needs_review', 'failed'].includes(job.status) ? (
                      <button
                        onClick={() => handleRollback(job.id)}
                        disabled={!canManageImports || actionId === job.id}
                        className="inline-flex items-center gap-1 text-xs font-medium text-coral hover:underline disabled:opacity-50"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        {actionId === job.id ? 'Working' : 'Rollback'}
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {reviewJobId ? (
        <div className="mt-5 rounded-lg border border-neutral-200 bg-neutral-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-neutral-900">Review import data</h3>
              <p className="mt-1 text-xs text-neutral-500">
                Inspect validation issues, enter corrected values, and resume the import when the rows are ready.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {ENTITY_OPTIONS.map((entity) => {
                const counts = stagingCounts?.[entity.value];
                const issueCount = (counts?.invalid || 0) + (counts?.warning || 0);
                return (
                  <button
                    key={entity.value}
                    onClick={() => setReviewEntity(entity.value)}
                    className={`inline-flex min-h-9 items-center gap-2 rounded-md border px-3 text-xs font-medium transition ${
                      reviewEntity === entity.value
                        ? 'border-azure bg-white text-azure'
                        : 'border-neutral-200 bg-white text-neutral-600 hover:border-neutral-300'
                    }`}
                  >
                    {entity.label}
                    {counts ? (
                      <span className={issueCount > 0 ? 'text-coral' : 'text-emerald-600'}>
                        {issueCount}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {reviewLoading ? (
            <div className="mt-4 flex items-center gap-2 rounded-md bg-white p-4 text-sm text-neutral-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading review rows
            </div>
          ) : errorRows.length === 0 ? (
            <div className="mt-4 flex items-center gap-2 rounded-md bg-white p-4 text-sm text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              No validation issues for {ENTITY_OPTIONS.find((entity) => entity.value === reviewEntity)?.label.toLowerCase()}.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <div className="text-xs text-neutral-500">
                Showing {errorRows.length} of {errorTotal} issue row{errorTotal === 1 ? '' : 's'}.
              </div>
              {errorRows.map((row) => (
                <div key={row.id} className="rounded-md border border-neutral-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm font-medium text-neutral-900">Row {row.row_number}</div>
                    <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">
                      {row.validation_status}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-3">
                    {(row.validation_errors || []).map((error) => {
                      const key = `${row.id}:${error.field}`;
                      return (
                        <div key={key} className="rounded-md border border-neutral-100 bg-neutral-50 p-3">
                          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
                            <div className="min-w-0">
                              <div className="text-sm font-medium text-neutral-900">
                                {error.field}
                                <span className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                                  error.severity === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                                }`}>
                                  {error.severity}
                                </span>
                              </div>
                              <div className="mt-1 text-sm text-neutral-600">{error.message}</div>
                              <div className="mt-1 truncate text-xs text-neutral-500">
                                Raw value: {String(row.raw_data?.[error.field] ?? '') || 'blank'}
                              </div>
                            </div>
                            <div className="flex w-full gap-2 lg:w-80">
                              <input
                                value={fixValues[key] ?? ''}
                                onChange={(event) => setFixValues((prev) => ({ ...prev, [key]: event.target.value }))}
                                placeholder="Corrected value"
                                className="min-h-9 min-w-0 flex-1 rounded-md border border-neutral-200 bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-azure/30"
                              />
                              <button
                                onClick={() => applyFix(row, error)}
                                disabled={!fixValues[key] || fixingKey === key}
                                className="inline-flex min-h-9 items-center justify-center rounded-md bg-azure px-3 text-xs font-medium text-white disabled:opacity-50"
                              >
                                {fixingKey === key ? 'Applying' : 'Apply'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 text-xs text-neutral-500">
        <span className="rounded-full bg-neutral-100 px-2.5 py-1">donors.csv</span>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1">investees.csv</span>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1">funds.csv</span>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1">gifts.csv</span>
        <span className="rounded-full bg-neutral-100 px-2.5 py-1">custom_fields.csv</span>
      </div>

      {showWizard ? (
        <NewImportWizard
          portfolios={portfolios}
          apiEndpoint={`/api/org/${orgId}/imports`}
          detailHrefForJob={() => `/org/${orgId}/data`}
          onClose={() => {
            setShowWizard(false);
            refreshJobs();
          }}
        />
      ) : null}
    </section>
  );
}
