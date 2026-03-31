'use client';
// components/admin/ImportErrorsTable.tsx
// Browse validation errors for an import job

import { useState, useEffect, useCallback } from 'react';

interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
  rule: string;
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

const PAGE_SIZE = 50;

export function ImportErrorsTable({ importJobId }: ImportErrorsTableProps) {
  const [entity, setEntity] = useState<EntityType>('holdings');
  const [severity, setSeverity] = useState<SeverityFilter>('all');
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<ErrorRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        const body = await res.json();
        throw new Error(body.error ?? 'Failed to load errors');
      }
      const data = await res.json();
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

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-500">Entity</label>
          <select
            value={entity}
            onChange={(e) => { setEntity(e.target.value as EntityType); setOffset(0); }}
            className="text-xs border border-neutral-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-azure/30"
          >
            {entityOptions.map((e) => (
              <option key={e} value={e}>
                {e.charAt(0).toUpperCase() + e.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-neutral-500">Severity</label>
          <select
            value={severity}
            onChange={(e) => { setSeverity(e.target.value as SeverityFilter); setOffset(0); }}
            className="text-xs border border-neutral-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-azure/30"
          >
            <option value="all">All</option>
            <option value="error">Errors only</option>
            <option value="warning">Warnings only</option>
          </select>
        </div>
        <div className="ml-auto">
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
              </tr>
            </thead>
            <tbody>
              {rows.flatMap((row) =>
                (row.validation_errors ?? []).map((e, idx) => (
                  <tr
                    key={`${row.id}-${idx}`}
                    className={`border-b border-neutral-50 ${
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
                    </td>
                    <td className="px-3 py-2 font-mono text-neutral-500 max-w-xs truncate">
                      {String(row.raw_data[e.field] ?? '—')}
                    </td>
                  </tr>
                ))
              )}
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
