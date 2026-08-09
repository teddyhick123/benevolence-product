'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  DatabaseZap,
  FileUp,
  Gauge,
  GitPullRequestArrow,
  Loader2,
  Settings2,
} from 'lucide-react';

type SetupTask = {
  id: string;
  label: string;
  completed: boolean;
};

type WorkbenchAction = {
  id: string;
  label: string;
  description: string;
  href: string;
  priority: 'high' | 'medium' | 'low';
};

type HealthIssue = {
  id: string;
  label: string;
  count: number;
  severity: 'ok' | 'warning' | 'critical';
  href: string;
};

type RecentImport = {
  id: string;
  name: string;
  status: string;
  total_records_extracted: number;
  records_loaded: number;
  records_failed: number;
  error_rows: number;
  created_at: string;
};

type DashboardResponse = {
  org?: {
    id: string;
    name: string;
    org_type?: string | null;
  };
  setup_progress?: {
    tasks: SetupTask[];
    completed_count: number;
    total_count: number;
  } | null;
  workbench?: {
    next_actions: WorkbenchAction[];
    data_health: {
      score: number;
      issues: HealthIssue[];
      records_checked: number;
    };
    imports: {
      recent: RecentImport[];
      total_recent: number;
    };
    builder: {
      // null means the count could not be read, which is not the same as zero.
      pending_proposals: number | null;
      configured_layers: {
        workflow_items: number | null;
        custom_fields: number | null;
        automation_rules: number | null;
        ai_context_items: number | null;
        view_preferences: number | null;
      };
    };
    usage: {
      plan: string;
      imports_used: number;
      imports_limit: number;
      ai_calls_used: number | null;
      ai_calls_limit: number | null;
    };
  };
};

interface Props {
  orgId: string;
}

function statusLabel(status: string) {
  return status.replace(/_/g, ' ');
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date);
}

/** A count that could not be read reads as unavailable, never as a number. */
function formatCount(count: number | null) {
  return count === null ? 'Unavailable' : count;
}

function statClasses(count: number | null) {
  return count === null
    ? 'text-sm font-medium text-neutral-400'
    : 'text-2xl font-semibold tabular-nums text-neutral-900';
}

function severityClasses(severity: HealthIssue['severity']) {
  if (severity === 'critical') return 'border-red-200 bg-red-50 text-red-700';
  if (severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

export default function WorkbenchHomePanel({ orgId }: Props) {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    setLoading(true);
    apiRequest(`/api/org/${orgId}/dashboard`, { cache: 'no-store' })
      .then((res) => res.ok ? readJson(res) : null)
      .then((json) => {
        if (!cancelled) setData(json);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const setup = data?.setup_progress;
  const workbench = data?.workbench;
  const setupPercent = setup && setup.total_count > 0
    ? Math.round((setup.completed_count / setup.total_count) * 100)
    : 100;

  // A partial sum would read as a real total, so an unreadable count makes the
  // whole figure unavailable rather than silently smaller.
  const layerTotal = useMemo(() => {
    const layers = workbench?.builder.configured_layers;
    if (!layers) return null;
    const counts = Object.values(layers);
    if (counts.some((count) => count === null)) return null;
    return counts.reduce((sum: number, count) => sum + (count ?? 0), 0);
  }, [workbench]);

  if (!orgId) return null;

  if (loading) {
    return (
      <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-soft">
        <div className="flex items-center gap-2 text-sm text-neutral-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading workbench
        </div>
      </section>
    );
  }

  if (!workbench) return null;

  const primaryAction = workbench.next_actions[0];
  const importHref = `/org/${orgId}/data`;

  return (
    <section className="rounded-lg border border-neutral-200 bg-white p-5 shadow-soft">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium text-azure">
            <Gauge className="h-4 w-4" />
            Builder Studio Overview
          </div>
          <h2 className="mt-1 text-xl font-semibold text-neutral-950">
            {primaryAction?.label || 'Workspace is ready'}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-neutral-500">
            {primaryAction?.description || 'No urgent cleanup or configuration steps are waiting.'}
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {primaryAction ? (
            <Link
              href={primaryAction.href}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-md bg-azure px-4 text-sm font-medium text-white shadow-sm transition hover:bg-azure/90"
            >
              <ClipboardCheck className="h-4 w-4" />
              Start next
            </Link>
          ) : null}
          <Link
            href={importHref}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-neutral-200 px-4 text-sm font-medium text-neutral-700 transition hover:bg-neutral-50"
          >
            <FileUp className="h-4 w-4" />
            Upload data
          </Link>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-4 rounded-lg border border-neutral-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
              <ClipboardCheck className="h-4 w-4 text-azure" />
              Setup
            </div>
            <span className="text-sm tabular-nums text-neutral-500">{setupPercent}%</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-neutral-100">
            <div
              className="h-2 rounded-full bg-azure"
              style={{ width: `${setupPercent}%` }}
            />
          </div>
          <div className="mt-3 space-y-2">
            {(setup?.tasks || []).slice(0, 4).map((task) => (
              <div key={task.id} className="flex min-h-6 items-center gap-2 text-sm text-neutral-600">
                {task.completed ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                ) : (
                  <span className="h-4 w-4 rounded-full border border-neutral-300" />
                )}
                <span>{task.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-4 rounded-lg border border-neutral-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
              <DatabaseZap className="h-4 w-4 text-azure" />
              Data Health
            </div>
            <span className="text-sm tabular-nums text-neutral-500">{workbench.data_health.score}/100</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {workbench.data_health.issues.map((issue) => (
              <Link
                key={issue.id}
                href={issue.href}
                className={`min-h-20 rounded-md border p-3 transition hover:shadow-sm ${severityClasses(issue.severity)}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-current">{issue.label}</span>
                  {issue.severity === 'ok' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                  )}
                </div>
                <div className="mt-2 text-2xl font-semibold tabular-nums">{issue.count}</div>
              </Link>
            ))}
          </div>
        </div>

        <div className="lg:col-span-4 rounded-lg border border-neutral-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
              <Settings2 className="h-4 w-4 text-azure" />
              Configuration
            </div>
            <Link href="/builder-studio" className="text-xs font-medium text-azure hover:underline">
              Builder Studio
            </Link>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <div className="rounded-md bg-neutral-50 p-3">
              <div className={statClasses(layerTotal)}>{formatCount(layerTotal)}</div>
              <div className="text-xs text-neutral-500">Configured items</div>
            </div>
            <div className="rounded-md bg-neutral-50 p-3">
              <div className={statClasses(workbench.builder.pending_proposals)}>
                {formatCount(workbench.builder.pending_proposals)}
              </div>
              <div className="text-xs text-neutral-500">Pending proposals</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(workbench.builder.configured_layers).map(([key, count]) => (
              <span key={key} className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs text-neutral-600">
                {key.replace(/_/g, ' ')}: {formatCount(count)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-12">
        <div className="lg:col-span-7 rounded-lg border border-neutral-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
              <GitPullRequestArrow className="h-4 w-4 text-azure" />
              Next Actions
            </div>
          </div>
          <div className="mt-3 divide-y divide-neutral-100">
            {workbench.next_actions.length > 0 ? workbench.next_actions.map((action) => (
              <Link
                key={action.id}
                href={action.href}
                className="flex min-h-16 items-center justify-between gap-4 py-3 text-sm transition hover:text-azure"
              >
                <span>
                  <span className="block font-medium text-neutral-900">{action.label}</span>
                  <span className="block text-neutral-500">{action.description}</span>
                </span>
                <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs capitalize text-neutral-600">
                  {action.priority}
                </span>
              </Link>
            )) : (
              <div className="py-4 text-sm text-neutral-500">No priority actions waiting.</div>
            )}
          </div>
        </div>

        <div className="lg:col-span-5 rounded-lg border border-neutral-200 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold text-neutral-800">
              <FileUp className="h-4 w-4 text-azure" />
              Recent Imports
            </div>
            <span className="text-xs text-neutral-500">
              {workbench.usage.imports_used}/{workbench.usage.imports_limit} starter
            </span>
          </div>
          <div className="mt-3 divide-y divide-neutral-100">
            {workbench.imports.recent.length > 0 ? workbench.imports.recent.map((job) => (
              <Link
                key={job.id}
                href={`/org/${orgId}/data`}
                className="flex min-h-14 items-center justify-between gap-3 py-3 text-sm transition hover:text-azure"
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium text-neutral-900">{job.name}</span>
                  <span className="block text-neutral-500">
                    {statusLabel(job.status)} · {formatDate(job.created_at)}
                  </span>
                </span>
                <span className="text-right text-xs text-neutral-500">
                  <span className="block tabular-nums">{job.records_loaded}/{job.total_records_extracted}</span>
                  <span className="block">loaded</span>
                </span>
              </Link>
            )) : (
              <div className="py-4 text-sm text-neutral-500">No imports yet.</div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
