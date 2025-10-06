

'use client';
import { useEffect, useMemo, useState, use } from 'react';
import Link from 'next/link';

const ALL_WIDGETS: { id: string; label: string }[] = [
  { id: 'kpi_waci', label: 'WACI trend' },
  { id: 'kpi_femiss', label: 'FEMISS trend' },
  { id: 'sector_emissions', label: 'Emissions by sector' },
];

type Settings = { show_map: boolean; widgets: string[] };

export default function PortfolioSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: portfolioId } = use(params);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [showMap, setShowMap] = useState<boolean>(true);
  const [widgets, setWidgets] = useState<string[]>(['kpi_waci','sector_emissions']);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const r = await fetch(`/api/portfolio/${encodeURIComponent(portfolioId)}/settings`, { cache: 'no-store' });
        const j = await r.json();
        if (!mounted) return;
        setShowMap(Boolean(j?.show_map ?? true));
        if (Array.isArray(j?.widgets) && j.widgets.length) setWidgets(j.widgets);
      } catch (e: any) {
        if (mounted) setError(e?.message || 'Failed to load settings');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [portfolioId]);

  function toggleWidget(id: string) {
    setWidgets((prev) => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null); setOk(null);
    try {
      const res = await fetch(`/api/admin/portfolios/${encodeURIComponent(portfolioId)}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show_map: showMap, widgets }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Failed to save');
      setOk('Settings saved');
      setTimeout(() => setOk(null), 1500);
    } catch (e: any) {
      setError(e?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const selectedCount = useMemo(() => widgets.length, [widgets]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Portfolio Settings</h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/portfolios/${encodeURIComponent(portfolioId)}/kpis`}
            className="text-sm px-3 py-2 rounded-2xl border border-black/10 hover:bg-white shadow-sm hover:shadow transition"
          >
            KPIs
          </Link>
          <Link
            href={`/dashboard?portfolio_id=${encodeURIComponent(portfolioId)}`}
            className="text-sm px-3 py-2 rounded-2xl bg-azure text-white shadow-soft hover:opacity-90 transition"
          >
            Dashboard
          </Link>
        </div>
      </div>

      {error && (
        <div className="card p-4 text-sm text-rose-700 bg-rose-50 border border-rose-200">{error}</div>
      )}
      {ok && (
        <div className="card p-4 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200">{ok}</div>
      )}

      <form onSubmit={onSave} className="space-y-6">
        {/* Map toggle */}
        <div className="card p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-neutral-600">Impact map</div>
              <div className="text-xs text-neutral-500">Show or hide the impact map on the dashboard.</div>
            </div>
            <button
              type="button"
              onClick={() => setShowMap(s => !s)}
              className={`px-3 py-1.5 rounded-2xl border transition ${showMap ? 'bg-azure/10 text-azure border-azure/20' : 'border-black/10 hover:bg-white'}`}
            >
              {showMap ? 'Shown' : 'Hidden'}
            </button>
          </div>
        </div>

        {/* Carousel widgets */}
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-neutral-600">Visualization carousel</div>
              <div className="text-xs text-neutral-500">Pick which visuals appear beside the holdings table.</div>
            </div>
            <div className="text-xs text-neutral-500">{selectedCount} selected</div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {ALL_WIDGETS.map(w => (
              <label key={w.id} className={`flex items-center gap-2 px-3 py-2 rounded-2xl border cursor-pointer transition ${widgets.includes(w.id) ? 'bg-azure/10 text-azure border-azure/20' : 'border-black/10 hover:bg-white'}`}>
                <input
                  type="checkbox"
                  className="mr-1"
                  checked={widgets.includes(w.id)}
                  onChange={() => toggleWidget(w.id)}
                />
                <span className="text-sm">{w.label}</span>
                <span className="ml-auto text-[11px] text-neutral-500 font-mono">{w.id}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            disabled={saving || loading}
            className="px-4 py-2 rounded-2xl bg-azure text-white shadow-soft hover:opacity-90 transition disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
          <button
            type="button"
            disabled={saving || loading}
            className="px-4 py-2 rounded-2xl border border-black/10 hover:bg-white shadow-sm hover:shadow transition"
            onClick={() => { setShowMap(true); setWidgets(['kpi_waci','sector_emissions']); setOk(null); setError(null); }}
          >
            Reset to defaults
          </button>
        </div>
      </form>
    </div>
  );
}