'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useState, useEffect, useCallback } from 'react';

interface BudgetItem {
  id: string;
  grant_id: string;
  category: string;
  description: string;
  budgeted_amount: number;
  actual_amount: number | null;
  notes: string | null;
}

interface Props {
  grantId: string;
  portfolioId: string;
}

const CATEGORIES = [
  'Personnel',
  'Equipment',
  'Supplies',
  'Travel',
  'Contractual',
  'Indirect Costs',
  'Other',
];

export default function BudgetTracker({ grantId, portfolioId }: Props) {
  const [items, setItems] = useState<BudgetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editActual, setEditActual] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({ category: 'Personnel', description: '', budgeted_amount: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await apiRequest(`/api/portfolio/${portfolioId}/grants/${grantId}/budget`);
      if (!res.ok) throw new Error('Failed to load budget');
      const json = await readJson(res);
      setItems(json.data || []);
    } catch (err) {
      console.error('Error fetching budget:', err);
    } finally {
      setLoading(false);
    }
  }, [portfolioId, grantId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const handleSaveActual = async (item: BudgetItem) => {
    setSaving(true);
    setError(null);
    try {
      const res = await apiRequest(
        `/api/portfolio/${portfolioId}/grants/${grantId}/budget?itemId=${item.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ actual_amount: editActual === '' ? null : Number(editActual) }),
        }
      );
      if (!res.ok) {
        const json = await readJson(res);
        throw new Error(json.error || 'Save failed');
      }
      const json = await readJson(res);
      setItems((prev) => prev.map((i) => (i.id === item.id ? json.data : i)));
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handleAddItem = async () => {
    if (!newItem.description.trim() || !newItem.budgeted_amount) {
      setError('Description and budgeted amount are required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await apiRequest(`/api/portfolio/${portfolioId}/grants/${grantId}/budget`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: newItem.category,
          description: newItem.description,
          budgeted_amount: Number(newItem.budgeted_amount),
        }),
      });
      if (!res.ok) {
        const json = await readJson(res);
        throw new Error(json.error || 'Failed to add item');
      }
      const json = await readJson(res);
      setItems((prev) => [...prev, json.data]);
      setNewItem({ category: 'Personnel', description: '', budgeted_amount: '' });
      setShowAddForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add item');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this budget item?')) return;
    try {
      const res = await apiRequest(
        `/api/portfolio/${portfolioId}/grants/${grantId}/budget?itemId=${id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Delete failed');
      setItems((prev) => prev.filter((i) => i.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const formatCurrency = (n: number | null) => {
    if (n == null) return '—';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);
  };

  const totalBudgeted = items.reduce((s, i) => s + i.budgeted_amount, 0);
  const totalActual = items.reduce((s, i) => s + (i.actual_amount ?? 0), 0);
  const hasActuals = items.some((i) => i.actual_amount != null);
  const netVariance = totalBudgeted - totalActual;

  const getVarianceColor = (budgeted: number, actual: number | null) => {
    if (actual == null) return 'text-neutral-400';
    const diff = budgeted - actual;
    if (diff > 0) return 'text-green-600';
    if (diff < 0) return 'text-red-600';
    return 'text-neutral-600';
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-16 bg-neutral-200 rounded-2xl"></div>
        <div className="h-48 bg-neutral-200 rounded-2xl"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Row */}
      {items.length > 0 && (
        <div className="grid grid-cols-3 gap-4">
          <div className="rounded-2xl border border-black/5 bg-white shadow-soft p-4 text-center">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Total Budgeted</p>
            <p className="mt-1 text-xl font-semibold text-ink">{formatCurrency(totalBudgeted)}</p>
          </div>
          <div className="rounded-2xl border border-black/5 bg-white shadow-soft p-4 text-center">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Total Actual</p>
            <p className="mt-1 text-xl font-semibold text-ink">{hasActuals ? formatCurrency(totalActual) : '—'}</p>
          </div>
          <div className="rounded-2xl border border-black/5 bg-white shadow-soft p-4 text-center">
            <p className="text-xs text-neutral-500 uppercase tracking-wide">Net Variance</p>
            <p className={`mt-1 text-xl font-semibold ${hasActuals ? (netVariance >= 0 ? 'text-green-600' : 'text-red-600') : 'text-neutral-400'}`}>
              {hasActuals ? formatCurrency(netVariance) : '—'}
            </p>
          </div>
        </div>
      )}

      {/* Line Items Table */}
      <div className="rounded-2xl border border-black/5 bg-white shadow-soft overflow-hidden">
        <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink">Budget Line Items</h3>
          <button
            onClick={() => { setShowAddForm(!showAddForm); setError(null); }}
            className="text-sm text-azure hover:opacity-80 font-medium flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Add Line Item
          </button>
        </div>

        {/* Add Form */}
        {showAddForm && (
          <div className="px-6 py-4 bg-neutral-50 border-b border-black/5">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <select
                value={newItem.category}
                onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                className="px-3 py-2 border border-black/10 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
              >
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <input
                type="text"
                placeholder="Description"
                value={newItem.description}
                onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                className="px-3 py-2 border border-black/10 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30 md:col-span-2"
              />
              <input
                type="number"
                placeholder="Budgeted amount"
                value={newItem.budgeted_amount}
                onChange={(e) => setNewItem({ ...newItem, budgeted_amount: e.target.value })}
                min="0"
                step="1"
                className="px-3 py-2 border border-black/10 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
              />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={handleAddItem}
                disabled={saving}
                className="px-4 py-2 bg-azure text-white rounded-2xl text-sm font-medium hover:opacity-90 disabled:opacity-50"
              >
                {saving ? 'Adding...' : 'Add Item'}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setError(null); }}
                className="px-4 py-2 border border-black/10 text-neutral-700 rounded-2xl text-sm hover:bg-neutral-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {error && (
          <div className="mx-6 my-3 p-3 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700">{error}</div>
        )}

        {items.length === 0 && !showAddForm ? (
          <div className="p-8 text-center">
            <svg className="mx-auto h-10 w-10 text-neutral-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 11h.01M12 11h.01M15 11h.01M4 19h16a2 2 0 002-2V7a2 2 0 00-2-2H4a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="mt-2 text-sm text-neutral-500">No budget items yet.</p>
            <p className="text-xs text-neutral-400">Add line items to track spending against budget.</p>
          </div>
        ) : items.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-black/5">
              <thead className="bg-neutral-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Description</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Budgeted</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Actual</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Variance</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-black/5">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-neutral-50">
                    <td className="px-6 py-4 text-sm text-neutral-600">{item.category}</td>
                    <td className="px-6 py-4 text-sm text-ink">{item.description}</td>
                    <td className="px-6 py-4 text-sm text-ink text-right">{formatCurrency(item.budgeted_amount)}</td>
                    <td className="px-6 py-4 text-right">
                      {editingId === item.id ? (
                        <div className="flex items-center justify-end gap-2">
                          <input
                            type="number"
                            value={editActual}
                            onChange={(e) => setEditActual(e.target.value)}
                            className="w-28 px-2 py-1 border border-black/10 rounded text-sm text-right focus:outline-none focus:ring-2 focus:ring-azure/30"
                            autoFocus
                            min="0"
                            step="1"
                          />
                          <button
                            onClick={() => handleSaveActual(item)}
                            disabled={saving}
                            className="text-xs text-azure hover:opacity-80 font-medium"
                          >
                            Save
                          </button>
                          <button onClick={() => setEditingId(null)} className="text-xs text-neutral-400 hover:text-neutral-600">
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => { setEditingId(item.id); setEditActual(item.actual_amount != null ? String(item.actual_amount) : ''); }}
                          className="text-sm text-ink hover:text-azure text-right w-full"
                          title="Click to edit actual amount"
                        >
                          {item.actual_amount != null ? formatCurrency(item.actual_amount) : <span className="text-neutral-400 italic">click to enter</span>}
                        </button>
                      )}
                    </td>
                    <td className={`px-6 py-4 text-sm text-right font-medium ${getVarianceColor(item.budgeted_amount, item.actual_amount)}`}>
                      {item.actual_amount != null ? formatCurrency(item.budgeted_amount - item.actual_amount) : '—'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => handleDelete(item.id)}
                        className="text-neutral-300 hover:text-red-500"
                        title="Delete"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
              {items.length > 1 && (
                <tfoot className="bg-neutral-50">
                  <tr>
                    <td className="px-6 py-3 text-sm font-semibold text-ink" colSpan={2}>Total</td>
                    <td className="px-6 py-3 text-sm font-semibold text-ink text-right">{formatCurrency(totalBudgeted)}</td>
                    <td className="px-6 py-3 text-sm font-semibold text-ink text-right">{hasActuals ? formatCurrency(totalActual) : '—'}</td>
                    <td className={`px-6 py-3 text-sm font-semibold text-right ${hasActuals ? (netVariance >= 0 ? 'text-green-600' : 'text-red-600') : 'text-neutral-400'}`}>
                      {hasActuals ? formatCurrency(netVariance) : '—'}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        ) : null}
      </div>
    </div>
  );
}
