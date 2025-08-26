import KpiCard from '@/components/KpiCard';
import HoldingsTable from '@/components/HoldingsTable';
import ImpactMap from '@/components/ImpactMap';
import VisualCarousel from '@/components/vis/VisualCarousel';
import { headers } from 'next/headers';
import AISummaryCard from '@/components/AISummaryCard';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type OverviewResponse = {
  latest: Array<{ portfolio_id: string; holding_name: string | null; sector: string | null; country: string | null; metric_name: string | null; metric_value: number | null; as_of_date: string | null; }>;
  kpis: Record<string, number>;
};
type HoldingsResponse = { data: Array<any>; count: number | null; nextOffset: number | null; };
type MapResponse = { points: Array<{ lon: number | null; lat: number | null; weight: number; country?: string; label?: string }>; };

async function getBaseUrl() {
  const h = await headers(); // <-- await
  const proto = h.get('x-forwarded-proto') ?? 'http';
  const host = h.get('host') ?? 'localhost:3000';
  return `${proto}://${host}`;
}
function fmtNumber(n: number | null | undefined): string {
  if (n == null || !isFinite(Number(n))) return '—';
  const v = Number(n);
  if (Math.abs(v) >= 1_000_000_000) return (v / 1_000_000_000).toFixed(1) + 'B';
  if (Math.abs(v) >= 1_000_000) return (v / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(v) >= 1_000) return (v / 1_000).toFixed(1) + 'K';
  return v.toString();
}

export default async function Dashboard(searchParamsPromise: Promise<{ [key: string]: string | string[] | undefined }>) {
  const sp = await searchParamsPromise;
  const base = await getBaseUrl();
  const urlPortfolio =
    (typeof sp?.portfolio_id === 'string' && sp?.portfolio_id) ||
    (Array.isArray(sp?.portfolio_id) ? sp?.portfolio_id[0] : undefined);

  let me: { portfolio_id?: string | null } | null = null;
  try {
    const meRes = await fetch(`${base}/api/me`, { cache: 'no-store' });
    if (meRes.ok) me = await meRes.json();
  } catch {}
  const envPid = process.env.NEXT_PUBLIC_PORTFOLIO_ID_DEFAULT || '';
  const portfolioId = urlPortfolio || me?.portfolio_id || envPid;

  if (!portfolioId) {
    return <div className="p-6">No portfolio selected.</div>;
  }

  const settingsRes = await fetch(`${base}/api/portfolio/${portfolioId}/settings`, { cache: 'no-store' }).catch(() => undefined);
  const settingsJson: { show_map?: boolean; widgets?: string[] } = settingsRes && settingsRes.ok ? await settingsRes.json() : { show_map: true, widgets: ['kpi_waci','sector_emissions'] };
  const showMap = settingsJson.show_map !== false;
  const widgetIds = Array.isArray(settingsJson.widgets) && settingsJson.widgets!.length ? settingsJson.widgets! : ['kpi_waci','sector_emissions'];

  const [overviewRes, holdingsRes, mapRes] = await Promise.all([
    fetch(`${base}/api/portfolio/${portfolioId}/overview`, { cache: 'no-store' }).catch(() => undefined),
    fetch(`${base}/api/portfolio/${portfolioId}/holdings?limit=50`, { cache: 'no-store' }).catch(() => undefined),
    fetch(`${base}/api/portfolio/${portfolioId}/map`, { cache: 'no-store' }).catch(() => undefined),
  ]);

  const overview: OverviewResponse | null = overviewRes && overviewRes.ok ? await overviewRes.json() : { latest: [], kpis: {} };
  const holdingsJson: HoldingsResponse | null = holdingsRes && holdingsRes.ok ? await holdingsRes.json() : { data: [], count: 0, nextOffset: null };
  const mapJson: MapResponse | null = mapRes && mapRes.ok ? await mapRes.json() : { points: [] };

  const kpiEntries = Object.entries(overview?.kpis || {});
  const kpis = (kpiEntries.length ? kpiEntries : [['WACI', 0], ['FEMISS', 0], ['RE_MWH', 0]]).map(([metric, value]) => ({
    title: metric, value: fmtNumber(Number(value)), badge: 'Latest'
  }));

  const holdings = holdingsJson?.data ?? [];
  const points = (mapJson?.points ?? []).map((p) => ({ lon: p.lon, lat: p.lat, weight: p.weight, label: p.country || p.label || '' }));

  const carouselItems = widgetIds.map((id) => ({
    id,
    label:
      id === 'kpi_waci' ? 'WACI trend' :
      id === 'kpi_femiss' ? 'FEMISS trend' :
      id === 'sector_emissions' ? 'Emissions by sector' : id
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold">Portfolio Dashboard</h1>
        <a
          href="/admin/upload"
          className="px-4 py-2 rounded-2xl bg-azure text-white shadow-soft hover:opacity-90 transition"
        >
          Upload
        </a>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {kpis.map((k, i) => <KpiCard key={i} {...(k as any)} />)}
      </div>

      {/* Holdings + carousel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <HoldingsTable rows={holdings as any} />
        <VisualCarousel items={carouselItems as any} portfolioId={portfolioId} />
      </div>

      {/* AI summary */}
      <div className="grid grid-cols-1 gap-6">
        <AISummaryCard portfolioId={portfolioId} />
      </div>

      {/* Impact map (toggle from admin settings) */}
      {showMap && (
        <div className="grid grid-cols-1 gap-6">
          <ImpactMap points={points as any} />
        </div>
      )}
    </div>
  );
}