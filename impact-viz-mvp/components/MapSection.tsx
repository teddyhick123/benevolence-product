'use client';

import * as React from 'react';
import useSWR from 'swr';
import SectionHeader from '@/components/SectionHeader';
import ImpactMap from '@/components/ImpactMap';
import { useRouter } from 'next/navigation';

const fetcher = async (url: string) => {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res.json();
};

// Shape returned by /api/portfolio/[id]/map
export type MapApiPoint = {
  id: string;
  holdingId: string | null;
  name: string;
  tags: string[];
  status: string | null;
  asOf: string | null;
  amountUSD: number | null;
  coords: [number, number]; // [lon, lat]
};

export default function MapSection({ portfolioId }: { portfolioId: string }) {
  const { data, error, isLoading } = useSWR<{ points: MapApiPoint[] }>(
    `/api/portfolio/${encodeURIComponent(portfolioId)}/map`,
    fetcher
  );
  const router = useRouter();

  const points = data?.points ?? [];

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Map"
        subtitle="Locations and activities across the portfolio"
      />

      {isLoading ? (
        <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6 text-sm text-neutral-500 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg will-change-transform rm:transition-none rm:transform-none">
          Loading map…
        </div>
      ) : error ? (
        <div className="rounded-2xl bg-white border border-red-200 text-red-700 shadow-soft p-6 text-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg will-change-transform rm:transition-none rm:transform-none">
          {(error as Error).message || 'Failed to load map.'}
        </div>
      ) : points.length === 0 ? (
        <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6 text-sm text-neutral-500">
          No locations yet for this portfolio. Add a few in Supabase (table <code>holding_locations</code>) to preview the map.
        </div>
      ) : (
        <div className="rounded-2xl border border-black/5 bg-white shadow-soft overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg will-change-transform rm:transition-none rm:transform-none">
          <div className="w-full h-[520px] sm:h-[560px] md:h-[600px] lg:h-[640px]">
            <ImpactMap
              points={points as any}
              onPointClick={(p: MapApiPoint) => {
                if (!p.holdingId) return;
                // Navigate to the holdings details page at app/dashboard/holdings/[holdingId]/page.tsx
                router.push(`/dashboard/holdings/${encodeURIComponent(p.holdingId)}`);
                console.log('Map point clicked:', {
                  id: p.id,
                  holdingId: p.holdingId,
                  name: p.name,
                  coords: p.coords,
                });
              }}
            />
          </div>
        </div>
      )}
    </section>
  );
}