import KpiCard from '@/components/KpiCard';
import HoldingsTable from '@/components/HoldingsTable';
import ImpactMap from '@/components/ImpactMap';

export default async function Home() {
  // Stubbed data; replace with calls to /api/portfolio/[id]/overview etc.
  const kpis = [
    { title: 'Impact Coverage', value: '78%', delta: 3.1, badge: 'Verified' },
    { title: 'WACI', value: 92, delta: -5.5, badge: 'Issuer Reported' },
    { title: 'Financed Emissions', value: '48,200 tCO₂e', delta: -1200 },
    { title: 'Jobs Supported', value: 1340, delta: 25 }
  ];

  const holdings = [
    { name: 'GreenGrid Solar Fund I', nav: 6200000, asset_class: 'Private Equity', last_updated: '2025-06-30', status: 'OK' },
    { name: 'BlueWave Water Corp', nav: 1800000, asset_class: 'Public Equity', last_updated: '2025-06-30', status: 'Watch' },
    { name: 'Global Green Bonds ETF', nav: 2000000, asset_class: 'Fixed Income', last_updated: '2025-06-30', status: 'OK' }
  ];

  const points = [
    { lon: -122.33, lat: 47.60, weight: 10, label: 'US - NW' },
    { lon: -73.94, lat: 40.67, weight: 8, label: 'US - NE' },
    { lon: -3.70, lat: 40.41, weight: 5, label: 'Europe' }
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold">Portfolio Overview</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {kpis.map((k, i) => <KpiCard key={i} {...k as any} />)}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <h2 className="text-xl font-semibold mb-2">Holdings</h2>
          <HoldingsTable rows={holdings as any} />
        </div>
        <div>
          <h2 className="text-xl font-semibold mb-2">Impact Map</h2>
          <ImpactMap points={points as any} />
        </div>
      </div>
    </div>
  );
}
