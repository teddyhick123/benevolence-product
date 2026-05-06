'use client';
// components/admin/ImportErrorsTable.tsx
// Browse validation errors for an import job

import { useState, useEffect, useCallback } from 'react';
import type { AISuggestion } from '@/lib/import/ai/validate-row';

interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  rule: string;
  auto_fixable?: boolean;
}

interface ErrorRow {
  id: string;
  row_number: number;
  raw_data: Record<string, string>;
  transformed_data: Record<string, unknown> | null;
  validation_errors: ValidationError[] | null;
  validation_status: string;
  action_taken: string;
}

type EntityType = 'holdings' | 'investees' | 'contributions' | 'metrics' | 'users';
type SeverityFilter = 'all' | 'error' | 'warning';

interface ImportErrorsTableProps {
  importJobId: string;
}

const STAGING_TABLE: Record<EntityType, string> = {
  holdings: 'staging_import_holdings',
  investees: 'staging_import_investees',
  contributions: 'staging_import_contributions',
  metrics: 'staging_import_metrics',
  users: 'staging_import_users',
};

const PAGE_SIZE = 50;

export function ImportErrorsTable({ importJobId }: ImportErrorsTableProps) {
  const [entity, setEntity] = useState<EntityType>('holdings');
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bulkFixFeedback, setBulkFixFeedback] = useState<string | null>(null);
  const [applyingBulkFix, setApplyingBulkFix] = useState(false);

  // AI fix state: rowId → suggestions
  const [aiFixMap, setAiFixMap] = useState<Record<string, AISuggestion[]>>({});
  const [loadingAIFor, setLoadingAIFor] = useState<Set<string>>(new Set());
  // rowId:field → accepted state
  const [acceptedKeys, setAcceptedKeys] = useState<Set<string>>(new Set());
  const [acceptingKey, setAcceptingKey] = useState<string | null>(null);

  const fetchErrors = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        entity,
        limit: String(PAGE_SIZE),
        offset: String(offset),
      });
      if (severity !== 'all') params.set('severity', severity);

      const res = await fetch(`/api/admin/imports/${importJobId}/errors?${params}`);
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? 'Failed to load errors');
      }
      const data = await res.json() as { rows?: ErrorRow[]; total?: number };
      setRows(data.rows ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [importJobId, entity, severity, offset]);

  useEffect(() => {
    fetchErrors();
  }, [fetchErrors]);

  const fetchAIFix = async (row: ErrorRow) => {
    setLoadingAIFor((prev) => new Set(prev).add(row.id));
    try {
      const res = await fetch('/api/admin/import/ai/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          import_job_id: importJobId,
          staging_table: STAGING_TABLE[entity],
          staging_row_ids: [row.id],
        }),
      });
      if (res.ok) {
        const data = await res.json() as {
          suggestions: Array<{ row_id: string; suggestions: AISuggestion[] }>;
        };
        const rowSuggestions = data.suggestions.find((s) => s.row_id === row.id);
        if (rowSuggestions) {
          setAiFixMap((prev) => ({ ...prev, [row.id]: rowSuggestions.suggestions }));
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoadingAIFor((prev) => {
        const next = new Set(prev);
        next.delete(row.id);
        return next;
      });
    }
  };

  const acceptSuggestion = async (
    row: ErrorRow,
    suggestion: AISuggestion,
    stagingTable: string
  ) => {
    const key = `${row.id}:${suggestion.field}`;
    setAcceptingKey(key);
    try {
      const res = await fetch(`/api/admin/imports/${importJobId}/errors`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staging_table: stagingTable,
          row_id: row.id,
          field: suggestion.field,
          proposed_value: suggestion.proposed_value,
        }),
      });
      if (res.ok) {
        setAcceptedKeys((prev) => new Set(prev).add(key));
        // Refresh table to reflect updated status
        await fetchErrors();
      }
    } catch {
      // silently fail
    } finally {
      setAcceptingKey(null);
    }
  };

  const applyAllAutoFixable = async () => {
    setApplyingBulkFix(true);
    setBulkFixFeedback(null);

    // Detect which fields need fixing from current rows
    const fieldFixMap: Record<string, string> = {
      recipient_ein: 'normalize_ein',
      organization_ein: 'normalize_ein',
      ein: 'normalize_ein',
      contribution_date: 'parse_date',
      date: 'parse_date',
      amount: 'strip_currency',
      grant_amount: 'strip_currency',
      gift_type: 'map_gift_type',
    };

    const fixesNeeded = new Set<string>();
    for (const row of rows) {
      for (const err of row.validation_errors ?? []) {
        if (err.auto_fixable && fieldFixMap[err.field]) {
          fixesNeeded.add(`${err.field}:${fieldFixMap[err.field]}`);
        }
      }
    }

    let totalFixed = 0;
    let totalStillFailing = 0;

    for (const key of fixesNeeded) {
      const [field, fix] = key.split(':');
      try {
        const res = await fetch(`/api/admin/imports/${importJobId}/bulk-fix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entity, field, fix }),
        });
        if (res.ok) {
          const data = await res.json() as { fixed?: number; still_failing?: number };
          totalFixed += data.fixed ?? 0;
          totalStillFailing += data.still_failing ?? 0;
        }
      } catch {
        // continue
      }
    }

    setApplyingBulkFix(false);
    setBulkFixFeedback(
      `Fixed ${totalFixed} rows. ${totalStillFailing > 0 ? `${totalStillFailing} rows still have errors.` : 'All fixed!'}`
    );

    // Refresh the table
    await fetchErrors();
  };

  const handleExportCSV = () => {
    const headers = ['Row #', 'Entity', 'Field', 'Error Message', 'Severity', 'Raw Value'];
    const csvRows = rows.flatMap((row) =>
      (row.validation_errors ?? []).map((e) => [
        row.row_number,
        entity,
        e.field,
        e.message,
        e.severity,
        row.raw_data[e.field] ?? '',
      ])
    );

    const csv = [headers, ...csvRows]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `import-errors-${importJobId}-${entity}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const entityOptions: EntityType[] = ['holdings', 'investees', 'contributions', 'metrics', 'users'];

  const autoFixableCount = rows.filter((r) =>
    r.validation_errors?.some((e) => e.auto_fixable)
  ).length;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Entity type tabs */}
        <div className="flex gap-1">
          {entityOptions.map((e) => (
            <button
              key={e}
              onClick={() => { setEntity(e); setOffset(0); }}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors capitalize ${
                entity === e
                  ? 'border-azure bg-azure/10 text-azure font-medium'
                  : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'
              }`}
            >
              {e}
            </button>
          ))}
        </div>

        {/* Severity filter */}
        <div className="flex gap-1">
          {(['all', 'error', 'warning'] as SeverityFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => { setSeverity(s); setOffset(0); }}
              className={`px-3 py-1.5 text-xs rounded-md border transition-colors ${
                severity === s
                  ? s === 'error'
                    ? 'border-red-300 bg-red-50 text-red-700 font-medium'
                    : s === 'warning'
                    ? 'border-yellow-300 bg-yellow-50 text-yellow-700 font-medium'
                    : 'border-azure bg-azure/10 text-azure font-medium'
                  : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'
              }`}
            >
              {s === 'all' ? 'All' : s === 'error' ? 'Errors only' : 'Warnings only'}
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {autoFixableCount > 0 && (
            <button
              onClick={applyAllAutoFixable}
              disabled={applyingBulkFix}
              className="text-xs px-3 py-1.5 border border-azure/30 rounded-md text-azure hover:bg-azure/5 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {applyingBulkFix ? 'Applying fixes…' : `✦ Apply ${autoFixableCount} auto-fixable fixes`}
            </button>
          )}
          <button
            onClick={handleExportCSV}
            disabled={rows.length === 0}
            className="text-xs px-3 py-1.5 border border-neutral-200 rounded-md hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            Export errors as CSV
          </button>
        </div>
      </div>

      {/* Results summary */}
      <p className="text-xs text-neutral-500">
        {loading ? 'Loading…' : `${total.toLocaleString()} row${total === 1 ? '' : 's'} with issues`}
      </p>

      {bulkFixFeedback && (
        <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center justify-between">
          <span>{bulkFixFeedback}</span>
          <button
            onClick={() => setBulkFixFeedback(null)}
            className="text-green-500 hover:text-green-700 ml-2"
          >
            ×
          </button>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Error table */}
      {!loading && rows.length === 0 ? (
        <div className="text-center py-8 text-neutral-400 text-sm">
          No errors found for this entity/severity.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-200 bg-neutral-50">
                <th className="text-left px-3 py-2 font-medium text-neutral-600">Row #</th>
                <th className="text-left px-3 py-2 font-medium text-neutral-600">Field</th>
                <th className="text-left px-3 py-2 font-medium text-neutral-600">Error Message</th>
                <th className="text-left px-3 py-2 font-medium text-neutral-600">Severity</th>
                <th className="text-left px-3 py-2 font-medium text-neutral-600">Raw Value</th>
                <th className="text-left px-3 py-2 font-medium text-neutral-600">AI Fix</th>
              </tr>
            </thead>
            <tbody>
              {rows.flatMap((row) => {
                const hasAutoFixable = row.validation_errors?.some((e) => e.auto_fixable) ?? false;
                const rowSuggestions = aiFixMap[row.id] ?? [];
                const isLoadingAI = loadingAIFor.has(row.id);

                return (row.validation_errors ?? []).map((e, idx) => {
                  const aiSug = rowSuggestions.find((s) => s.field === e.field);
                  return (
                    <tr
                      key={`${row.id}-${idx}`}
                      className={`border-b border-neutral-50 ${
                        hasAutoFixable ? 'bg-azure/2' :
                        e.severity === 'error' ? 'bg-red-50/30' : 'bg-yellow-50/30'
                      }`}
                    >
                      <td className="px-3 py-2 font-mono tabular-nums">{row.row_number}</td>
                      <td className="px-3 py-2 font-mono">{e.field}</td>
                      <td className="px-3 py-2 text-neutral-700">{e.message}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                            e.severity === 'error'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {e.severity}
                        </span>
                        {e.auto_fixable && (
                          <span className="ml-1 inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-azure/10 text-azure">
                            auto-fixable
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-mono text-neutral-500 max-w-xs truncate">
                        {String(row.raw_data[e.field] ?? '—')}
                      </td>
                      <td className="px-3 py-2">
                        {idx === 0 && (
                          <>
                            {!aiFixMap[row.id] && !isLoadingAI && (
                              hasAutoFixable ? (
                                <button
                                  onClick={() => fetchAIFix(row)}
                                  className="text-xs px-2 py-1 rounded border border-azure/30 text-azure hover:bg-azure/5 transition-colors whitespace-nowrap"
                                >
                                  ✦ Apply Fix
                                </button>
                              ) : null
                            )}
                            {isLoadingAI && (
                              <span className="text-xs text-neutral-400 animate-pulse">
                                Analyzing…
                              </span>
                            )}
                          </>
                        )}
                        {aiSug && (() => {
                          const key = `${row.id}:${aiSug.field}`;
                          const accepted = acceptedKeys.has(key);
                          const accepting = acceptingKey === key;
                          return (
                            <div className="text-xs space-y-1">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-green-700 font-medium">
                                  → {String(aiSug.proposed_value ?? '—')}
                                </span>
                                <span className="text-neutral-400">
                                  ({Math.round(aiSug.confidence * 100)}%)
                                </span>
                              </div>
                              {accepted ? (
                                <span className="text-green-600 font-medium">✓ Accepted</span>
                              ) : (
                                <button
                                  onClick={() => acceptSuggestion(row, aiSug, STAGING_TABLE[entity])}
                                  disabled={accepting}
                                  className="px-2 py-0.5 rounded border border-green-300 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50 transition-colors whitespace-nowrap"
                                >
                                  {accepting ? 'Applying…' : 'Accept'}
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                });
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>
            Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0}
              className="px-3 py-1.5 border border-neutral-200 rounded-md hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setOffset(offset + PAGE_SIZE)}
              disabled={offset + PAGE_SIZE >= total}
              className="px-3 py-1.5 border border-neutral-200 rounded-md hover:bg-neutral-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
