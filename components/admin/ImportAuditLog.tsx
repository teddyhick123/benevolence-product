'use client';

import { apiRequest, readJson } from "@/lib/api/client";
// components/admin/ImportAuditLog.tsx
// Audit log viewer for import jobs with before/after snapshot diffs

import { useState, useEffect, useCallback } from 'react';

interface AuditLogEntry {
  id: string;
  import_job_id: string;
  table_name: string;
  operation: 'insert' | 'update' | 'skip' | 'error' | 'rollback';
  record_id: string;
  staging_table: string | null;
  staging_row_id: string | null;
  data_snapshot: { before?: Record<string, unknown>; after?: Record<string, unknown> } | null;
  error_message: string | null;
  created_at: string;
}

interface ImportAuditLogProps {
  importJobId: string;
}

const OPERATION_COLORS: Record<string, string> = {
  insert: 'bg-green-100 text-green-800',
  update: 'bg-azure/10 text-azure-deep',
  skip: 'bg-neutral-100 text-neutral-600',
  error: 'bg-red-100 text-red-700',
  rollback: 'bg-coral/10 text-coral',
};

const ALL_TABLES = ['donors', 'investees', 'holdings', 'contributions_received', 'metric_facts'];
const ALL_OPERATIONS = ['insert', 'update', 'skip', 'error', 'rollback'];

export function ImportAuditLog({ importJobId }: ImportAuditLogProps) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [tableFilter, setTableFilter] = useState('');
  const [opFilter, setOpFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const limit = 50;

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (tableFilter) params.set('table_name', tableFilter);
      if (opFilter) params.set('operation', opFilter);

      const res = await apiRequest(`/api/admin/imports/${importJobId}/audit?${params}`);
      if (res.ok) {
        const data = await readJson(res) as { entries: AuditLogEntry[]; total: number };
        setEntries(data.entries);
        setTotal(data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [importJobId, tableFilter, opFilter, offset]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const handleFilterChange = () => {
    setOffset(0);
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={tableFilter}
          onChange={(e) => { setTableFilter(e.target.value); handleFilterChange(); }}
          className="text-sm border border-neutral-200 rounded-2xl px-2 py-1.5"
        >
          <option value="">All tables</option>
          {ALL_TABLES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          value={opFilter}
          onChange={(e) => { setOpFilter(e.target.value); handleFilterChange(); }}
          className="text-sm border border-neutral-200 rounded-2xl px-2 py-1.5"
        >
          <option value="">All operations</option>
          {ALL_OPERATIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>

        <span className="text-xs text-neutral-500 ml-auto">
          {total.toLocaleString()} entries
        </span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-sm text-neutral-500 py-4 text-center">Loading audit log…</div>
      ) : entries.length === 0 ? (
        <div className="text-sm text-neutral-500 py-4 text-center">No audit entries yet.</div>
      ) : (
        <div className="border border-neutral-200 rounded-2xl overflow-hidden text-sm">
          <table className="w-full">
            <thead className="bg-neutral-50 text-xs text-neutral-500 uppercase tracking-wide">
              <tr>
                <th className="px-4 py-2 text-left">Table</th>
                <th className="px-4 py-2 text-left">Operation</th>
                <th className="px-4 py-2 text-left">Record ID</th>
                <th className="px-4 py-2 text-left">Timestamp</th>
                <th className="px-4 py-2 text-left">Snapshot</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {entries.map((entry) => (
                <>
                  <tr key={entry.id} className="hover:bg-neutral-50">
                    <td className="px-4 py-2 font-mono text-xs">{entry.table_name}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${OPERATION_COLORS[entry.operation] ?? 'bg-neutral-100'}`}>
                        {entry.operation}
                      </span>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-neutral-500">
                      {entry.record_id.slice(0, 8)}…
                    </td>
                    <td className="px-4 py-2 text-xs text-neutral-500">
                      {new Date(entry.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      {entry.data_snapshot && (
                        <button
                          onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                          className="text-xs text-azure hover:underline"
                        >
                          {expandedId === entry.id ? 'Hide' : 'View snapshot'}
                        </button>
                      )}
                      {entry.error_message && (
                        <span className="text-xs text-red-600">{entry.error_message.slice(0, 60)}</span>
                      )}
                    </td>
                  </tr>
                  {expandedId === entry.id && entry.data_snapshot && (
                    <tr key={`${entry.id}-expand`} className="bg-neutral-50">
                      <td colSpan={5} className="px-4 py-3">
                        <div className="grid grid-cols-2 gap-4 text-xs">
                          {entry.data_snapshot.before && (
                            <div>
                              <div className="font-medium text-neutral-500 mb-1">Before</div>
                              <pre className="bg-red-50 border border-red-100 rounded p-2 overflow-auto max-h-48 font-mono">
                                {JSON.stringify(entry.data_snapshot.before, null, 2)}
                              </pre>
                            </div>
                          )}
                          {entry.data_snapshot.after && (
                            <div>
                              <div className="font-medium text-neutral-500 mb-1">After</div>
                              <pre className="bg-green-50 border border-green-100 rounded p-2 overflow-auto max-h-48 font-mono">
                                {JSON.stringify(entry.data_snapshot.after, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > limit && (
        <div className="flex items-center gap-2 justify-end text-sm">
          <button
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}
            className="px-3 py-1 border border-neutral-200 rounded disabled:opacity-40 hover:bg-neutral-50"
          >
            Previous
          </button>
          <span className="text-neutral-500 text-xs">
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <button
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}
            className="px-3 py-1 border border-neutral-200 rounded disabled:opacity-40 hover:bg-neutral-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
