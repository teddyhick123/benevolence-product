'use client';

import { useState } from 'react';

type FactRowProps = {
  fact: {
    id: string;
    holding_id: string;
    metric_code: string;
    value?: number | string | null;
    updated_at: string;
    period_start?: string | null;
    period_end?: string | null;
    source?: string | null;
  };
  holdingId: string;
  updateAction: (formData: FormData) => Promise<void>;
  deleteAction: (formData: FormData) => Promise<void>;
};

function humanDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString();
}

export default function FactRow({ fact, holdingId, updateAction, deleteAction }: FactRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this fact? This action cannot be undone.')) {
      return;
    }

    setIsDeleting(true);
    const formData = new FormData();
    formData.append('fact_id', fact.id);
    formData.append('holding_id', holdingId);

    try {
      await deleteAction(formData);
    } catch (error: any) {
      alert(`Failed to delete: ${error.message}`);
      setIsDeleting(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);

    try {
      await updateAction(formData);
      setIsEditing(false);
    } catch (error: any) {
      alert(`Failed to update: ${error.message}`);
    }
  };

  if (isEditing) {
    return (
      <tr className="bg-blue-50/50">
        <td colSpan={5} className="px-4 py-3">
          <form onSubmit={handleUpdate} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
            <input type="hidden" name="fact_id" value={fact.id} />
            <input type="hidden" name="holding_id" value={holdingId} />

            <label className="block">
              <span className="text-xs font-medium text-neutral-700">Period End</span>
              <input
                type="date"
                name="period_end"
                defaultValue={fact.period_end || ''}
                className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-neutral-700">Metric Code *</span>
              <input
                name="metric_code"
                defaultValue={fact.metric_code}
                required
                className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-neutral-700">Value *</span>
              <input
                name="value"
                type="number"
                step="any"
                defaultValue={fact.value?.toString() || ''}
                required
                className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </label>

            <label className="block">
              <span className="text-xs font-medium text-neutral-700">Source URL</span>
              <input
                name="source"
                type="url"
                defaultValue={fact.source || ''}
                className="mt-1.5 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </label>

            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 transition-colors"
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="flex-1 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </td>
      </tr>
    );
  }

  return (
    <tr className="hover:bg-neutral-50 transition-colors group">
      <td className="px-4 py-3 text-sm text-neutral-800">
        {humanDate(fact.period_end || fact.period_start || fact.updated_at)}
      </td>
      <td className="px-4 py-3 text-sm font-medium text-neutral-900">{fact.metric_code}</td>
      <td className="px-4 py-3 text-sm text-neutral-800">{fact.value ?? '—'}</td>
      <td className="px-4 py-3 text-sm">
        {fact.source ? (
          <a
            className="text-indigo-600 hover:text-indigo-700 hover:underline"
            href={fact.source}
            target="_blank"
            rel="noreferrer"
          >
            View Source
          </a>
        ) : (
          <span className="text-neutral-400">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => setIsEditing(true)}
            className="p-1.5 rounded-lg text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 transition-colors"
            title="Edit fact"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </button>
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-1.5 rounded-lg text-red-600 hover:bg-red-50 hover:text-red-700 transition-colors disabled:opacity-50"
            title="Delete fact"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </td>
    </tr>
  );
}
