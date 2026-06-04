

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

  const [portfolioName, setPortfolioName] = useState<string>('');
  const [showMap, setShowMap] = useState<boolean>(true);
  const [widgets, setWidgets] = useState<string[]>(['kpi_waci','sector_emissions']);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch portfolio info and settings in parallel
        const [portfolioRes, settingsRes] = await Promise.all([
          fetch(`/api/portfolio/${encodeURIComponent(portfolioId)}`, { cache: 'no-store' }),
          fetch(`/api/portfolio/${encodeURIComponent(portfolioId)}/settings`, { cache: 'no-store' })
        ]);

        if (!mounted) return;

        // Handle portfolio info
        if (portfolioRes.ok) {
          const portfolioData = await portfolioRes.json();
          if (mounted && portfolioData?.name) {
            setPortfolioName(portfolioData.name);
          }
        }

        // Handle settings
        if (settingsRes.ok) {
          const settingsData = await settingsRes.json();
          if (mounted) {
            setShowMap(Boolean(settingsData?.show_map ?? true));
            if (Array.isArray(settingsData?.widgets) && settingsData.widgets.length) {
              setWidgets(settingsData.widgets);
            }
          }
        }
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
        body: JSON.stringify({ name: portfolioName, show_map: showMap, widgets }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j?.error || 'Failed to save');
      setOk('Settings saved');
      setTimeout(() => setOk(null), 3000);
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
            className="text-sm px-3 py-2 rounded-2xl bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 transition"
          >
            Dashboard
          </Link>
        </div>
      </div>

      {error && (
        <div className="card p-4 text-sm text-red-700 bg-red-50 border border-red-200">{error}</div>
      )}
      {ok && (
        <div className="card p-4 text-sm text-green-700 bg-green-50 border border-green-200">{ok}</div>
      )}

      <form onSubmit={onSave} className="space-y-6">
        {/* Portfolio Name */}
        <div className="card p-4">
          <div className="space-y-2">
            <label htmlFor="portfolioName" className="block text-sm font-medium text-neutral-700">
              Portfolio Name
            </label>
            <input
              type="text"
              id="portfolioName"
              value={portfolioName}
              onChange={(e) => setPortfolioName(e.target.value)}
              placeholder="Enter portfolio name"
              required
              className="w-full px-3 py-2 border border-neutral-300 rounded-2xl focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure text-sm"
            />
            <p className="text-xs text-neutral-500">
              This name appears in the dashboard header and admin lists.
            </p>
          </div>
        </div>

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
            className="px-4 py-2 rounded-2xl bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white shadow-soft hover:opacity-90 transition disabled:opacity-50"
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