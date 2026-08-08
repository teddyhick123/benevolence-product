'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type KpiRow = {
  id: string;
  metric_code: string;
  display_name: string | null;
  target_value: number | null;
  target_date: string | null;
  order_index: number | null;
};

type Metric = {
  code: string;
  name: string;
  unit: string | null;
};

function MetricCodeSelect({
  value,
  onChange,
  metrics,
}: {
  value: string;
  onChange: (value: string) => void;
  metrics: Metric[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border border-black/10 rounded-2xl px-3 py-2 w-full focus:ring-2 focus:ring-azure/30 focus:border-azure"
      required
    >
      <option value="" disabled>
        Select a metric…
      </option>
      {metrics.map((m) => (
        <option key={m.code} value={m.code}>
          {m.code} {m.unit ? `(${m.unit})` : ''} — {m.name}
        </option>
      ))}
    </select>
  );
}

function KpiEditRow({ kpi, metrics, onSave, onDelete }: {
  kpi: KpiRow;
  metrics: Metric[];
  onSave: (id: string, data: Partial<KpiRow>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [metricCode, setMetricCode] = useState(kpi.metric_code);
  const [displayName, setDisplayName] = useState(kpi.display_name || '');
  const [targetValue, setTargetValue] = useState(kpi.target_value?.toString() || '');
  const [targetDate, setTargetDate] = useState(kpi.target_date || '');
  const [orderIndex, setOrderIndex] = useState(kpi.order_index?.toString() || '0');

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(kpi.id, {
        metric_code: metricCode,
        display_name: displayName || null,
        target_value: targetValue ? parseFloat(targetValue) : null,
        target_date: targetDate || null,
        order_index: orderIndex ? parseInt(orderIndex) : null,
      });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirm('Delete this KPI? This cannot be undone.')) return;
    await onDelete(kpi.id);
  }

  if (editing) {
    return (
      <div className="border border-black/5 rounded-2xl p-4 bg-white space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Metric</label>
            <MetricCodeSelect value={metricCode} onChange={setMetricCode} metrics={metrics} />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Display Name</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Optional display name"
              className="border border-black/10 rounded-2xl px-3 py-2 w-full focus:ring-2 focus:ring-azure/30 focus:border-azure"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Target Value</label>
            <input
              type="number"
              step="any"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              placeholder="Target value"
              className="border border-black/10 rounded-2xl px-3 py-2 w-full focus:ring-2 focus:ring-azure/30 focus:border-azure"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-neutral-700 mb-1">Target Date</label>
            <input
              type="date"
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
              className="border border-black/10 rounded-2xl px-3 py-2 w-full focus:ring-2 focus:ring-azure/30 focus:border-azure"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-neutral-700 mb-1">Display Order</label>
            <input
              type="number"
              value={orderIndex}
              onChange={(e) => setOrderIndex(e.target.value)}
              placeholder="Order index"
              className="border border-black/10 rounded-2xl px-3 py-2 w-full focus:ring-2 focus:ring-azure/30 focus:border-azure"
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-2xl bg-azure text-white font-medium hover:bg-azure/90 transition disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button
            onClick={() => setEditing(false)}
            disabled={saving}
            className="px-4 py-2 rounded-2xl border border-black/10 text-neutral-700 hover:bg-neutral-50 transition"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  const metricInfo = metrics.find(m => m.code === kpi.metric_code);

  return (
    <div className="border border-black/5 rounded-2xl p-4 bg-white hover:shadow-md transition">
      <div className="flex items-start justify-between">
        <div className="flex-1 space-y-2">
          <div>
            <div className="font-medium text-ink">
              {kpi.display_name || kpi.metric_code}
            </div>
            {kpi.display_name && (
              <div className="text-xs text-neutral-500 font-mono">{kpi.metric_code}</div>
            )}
            {metricInfo && (
              <div className="text-sm text-neutral-600 mt-1">{metricInfo.name}</div>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-neutral-600">
            {kpi.target_value !== null && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-neutral-500">Target:</span>
                <span className="font-medium">{kpi.target_value.toLocaleString()}</span>
              </div>
            )}
            {kpi.target_date && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-neutral-500">By:</span>
                <span>{new Date(kpi.target_date).toLocaleDateString()}</span>
              </div>
            )}
            <div className="flex items-center gap-1">
              <span className="text-xs text-neutral-500">Order:</span>
              <span>{kpi.order_index ?? 0}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={() => setEditing(true)}
            className="px-3 py-1.5 text-sm rounded-2xl border border-black/10 text-neutral-700 hover:bg-neutral-50 transition"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-sm rounded-2xl border border-red-200 text-red-700 hover:bg-red-50 transition"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}

export default function KpisPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = use(params);
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [kpis, setKpis] = useState<KpiRow[]>([]);
  const [metrics, setMetrics] = useState<Metric[]>([]);

  // New KPI form state
  const [newMetricCode, setNewMetricCode] = useState('');
  const [newDisplayName, setNewDisplayName] = useState('');
  const [newTargetValue, setNewTargetValue] = useState('');
  const [newTargetDate, setNewTargetDate] = useState('');
  const [newOrderIndex, setNewOrderIndex] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadData();
  }, [portfolioId]);

  async function loadData() {
    setLoading(true);
    setError(null);
    try {
      const [kpisRes, metricsRes] = await Promise.all([
        apiRequest(`/api/admin/portfolios/${portfolioId}/kpis`, { cache: 'no-store' }),
        apiRequest(`/api/metrics`, { cache: 'no-store' }),
      ]);

      if (!kpisRes.ok) throw new Error('Failed to load KPIs');
      if (!metricsRes.ok) throw new Error('Failed to load metrics');

      const kpisData = await readJson(kpisRes);
      const metricsData = await readJson(metricsRes);

      setKpis(kpisData.data || []);
      setMetrics(metricsData.data || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load data');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newMetricCode) return;

    setCreating(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await apiRequest(`/api/admin/portfolios/${portfolioId}/kpis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metric_code: newMetricCode,
          display_name: newDisplayName || null,
          target_value: newTargetValue ? parseFloat(newTargetValue) : null,
          target_date: newTargetDate || null,
          order_index: newOrderIndex ? parseInt(newOrderIndex) : null,
        }),
      });

      if (!res.ok) {
        const data = await readJson(res);
        throw new Error(data.error || 'Failed to create KPI');
      }

      setSuccess('KPI created successfully');
      setNewMetricCode('');
      setNewDisplayName('');
      setNewTargetValue('');
      setNewTargetDate('');
      setNewOrderIndex('');
      await loadData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to create KPI');
    } finally {
      setCreating(false);
    }
  }

  async function handleSave(id: string, data: Partial<KpiRow>) {
    setError(null);
    setSuccess(null);

    try {
      const res = await apiRequest(`/api/admin/kpis/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) {
        const resData = await readJson(res);
        throw new Error(resData.error || 'Failed to update KPI');
      }

      setSuccess('KPI updated successfully');
      await loadData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update KPI');
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    setSuccess(null);

    try {
      const res = await apiRequest(`/api/admin/kpis/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await readJson(res);
        throw new Error(data.error || 'Failed to delete KPI');
      }

      setSuccess('KPI deleted successfully');
      await loadData();
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to delete KPI');
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-ink">KPI Management</h1>
          <p className="text-sm text-neutral-600 mt-1">Define and track key performance indicators for this portfolio</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/portfolios/${portfolioId}/members`}
            className="px-4 py-2 rounded-2xl border border-black/10 hover:bg-neutral-50 transition text-sm font-medium"
          >
            Members
          </Link>
          <Link
            href={`/admin/portfolios/${portfolioId}/settings`}
            className="px-4 py-2 rounded-2xl border border-black/10 hover:bg-neutral-50 transition text-sm font-medium"
          >
            Settings
          </Link>
          <Link
            href={`/dashboard?portfolio_id=${portfolioId}`}
            className="px-4 py-2 rounded-2xl bg-azure text-white hover:bg-azure/90 transition text-sm font-medium"
          >
            View Dashboard
          </Link>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-red-800">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">{error}</span>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-2xl p-4">
          <div className="flex items-center gap-2 text-green-800">
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            <span className="font-medium">{success}</span>
          </div>
        </div>
      )}

      {/* Create New KPI */}
      <div className="bg-white border border-black/5 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-ink mb-4">Add New KPI</h2>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Metric <span className="text-red-500">*</span>
              </label>
              <MetricCodeSelect value={newMetricCode} onChange={setNewMetricCode} metrics={metrics} />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Display Name</label>
              <input
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="Optional custom name"
                className="border border-black/10 rounded-2xl px-3 py-2 w-full focus:ring-2 focus:ring-azure/30 focus:border-azure"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Target Value</label>
              <input
                type="number"
                step="any"
                value={newTargetValue}
                onChange={(e) => setNewTargetValue(e.target.value)}
                placeholder="0"
                className="border border-black/10 rounded-2xl px-3 py-2 w-full focus:ring-2 focus:ring-azure/30 focus:border-azure"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Target Date</label>
              <input
                type="date"
                value={newTargetDate}
                onChange={(e) => setNewTargetDate(e.target.value)}
                className="border border-black/10 rounded-2xl px-3 py-2 w-full focus:ring-2 focus:ring-azure/30 focus:border-azure"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">Display Order</label>
              <input
                type="number"
                value={newOrderIndex}
                onChange={(e) => setNewOrderIndex(e.target.value)}
                placeholder="0"
                className="border border-black/10 rounded-2xl px-3 py-2 w-full focus:ring-2 focus:ring-azure/30 focus:border-azure"
              />
            </div>
          </div>
          <button
            type="submit"
            disabled={creating || !newMetricCode}
            className="px-6 py-2.5 rounded-2xl bg-azure text-white font-medium hover:bg-azure/90 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Creating...' : 'Create KPI'}
          </button>
        </form>
      </div>

      {/* Existing KPIs */}
      <div className="bg-white border border-black/5 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-ink mb-4">
          Existing KPIs {kpis.length > 0 && <span className="text-sm font-normal text-neutral-500">({kpis.length})</span>}
        </h2>

        {loading ? (
          <div className="text-center py-8 text-neutral-500">
            <div className="inline-block w-6 h-6 border-2 border-black/10 border-t-azure rounded-full animate-spin mb-2"></div>
            <p className="text-sm">Loading KPIs...</p>
          </div>
        ) : kpis.length === 0 ? (
          <div className="text-center py-8 text-neutral-500">
            <p>No KPIs defined yet. Create your first one above.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {kpis.map((kpi) => (
              <KpiEditRow
                key={kpi.id}
                kpi={kpi}
                metrics={metrics}
                onSave={handleSave}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
