'use client';

import * as React from 'react';
import useSWR from 'swr';
import SectionHeader from '@/components/SectionHeader';
import ImpactMap from '@/components/ImpactMap';
import MapModeSelector, { MapMode } from '@/components/map/MapModeSelector';
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
  assetType?: string | null;
  topKpis?: Array<{
    metricCode: string;
    displayName: string;
    value: number;
    unit: string | null;
    periodEnd: string;
  }>;
  totalContributions?: number;
};

export default function MapSection({ portfolioId }: { portfolioId: string }) {
  const { data, error, isLoading } = useSWR<{ points: MapApiPoint[] }>(
    `/api/portfolio/${encodeURIComponent(portfolioId)}/map`,
    fetcher
  );
  const router = useRouter();

  // Two-way highlighting state
  const [highlightedHoldingId, setHighlightedHoldingId] = React.useState<string | null>(null);

  // Visualization mode state
  const [mapMode, setMapMode] = React.useState<MapMode>('points');

  // Filter state
  const [searchQuery, setSearchQuery] = React.useState<string>('');
  const [assetTypeFilter, setAssetTypeFilter] = React.useState<string[]>([]);
  const [showFilters, setShowFilters] = React.useState<boolean>(false);

  const points = data?.points ?? [];

  // Get unique asset types for filter options
  const uniqueAssetTypes = React.useMemo(() => {
    const types = new Set<string>();
    points.forEach(p => {
      if (p.assetType) types.add(p.assetType);
    });
    return Array.from(types).sort();
  }, [points]);

  // Apply filters
  const filteredPoints = React.useMemo(() => {
    let filtered = points;

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(query)
      );
    }

    // Filter by asset type
    if (assetTypeFilter.length > 0) {
      filtered = filtered.filter(p =>
        p.assetType && assetTypeFilter.includes(p.assetType)
      );
    }

    return filtered;
  }, [points, searchQuery, assetTypeFilter]);

  // Toggle asset type filter
  const toggleAssetTypeFilter = (type: string) => {
    setAssetTypeFilter(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  return (
    <section className="space-y-4">
      <SectionHeader
        title="Map"
        subtitle="Locations and activities across the portfolio"
      />

      {/* Mode Selector and Filter Controls */}
      {points.length > 0 && (
        <div className="flex gap-4">
          {/* Visualization Mode Selector */}
          <div className="w-64 flex-shrink-0">
            <MapModeSelector mode={mapMode} onModeChange={setMapMode} />
          </div>

          {/* Filter Controls */}
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-black/10 text-sm text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
              </svg>
              Filters
              {(searchQuery || assetTypeFilter.length > 0) && (
                <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-azure text-white text-xs font-semibold">
                  {(searchQuery ? 1 : 0) + assetTypeFilter.length}
                </span>
              )}
            </button>
            {filteredPoints.length !== points.length && (
              <span className="text-sm text-neutral-600">
                Showing {filteredPoints.length} of {points.length} holdings
              </span>
            )}
          </div>

          {showFilters && (
            <div className="rounded-xl border border-black/5 bg-white shadow-soft p-4 space-y-4">
              {/* Search Input */}
              <div>
                <label htmlFor="map-search" className="block text-sm font-medium text-neutral-700 mb-1.5">
                  Search by name
                </label>
                <input
                  id="map-search"
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search holdings..."
                  className="w-full px-3 py-2 rounded-md border border-black/10 text-sm focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure"
                />
              </div>

              {/* Asset Type Filters */}
              {uniqueAssetTypes.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-neutral-700 mb-2">
                    Asset Types
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {uniqueAssetTypes.map(type => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => toggleAssetTypeFilter(type)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                          assetTypeFilter.includes(type)
                            ? 'bg-azure text-white border-azure'
                            : 'bg-white text-neutral-700 border-black/10 hover:border-azure/50'
                        }`}
                      >
                        {assetTypeFilter.includes(type) && (
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {type.replace(/_/g, ' ')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Clear Filters */}
              {(searchQuery || assetTypeFilter.length > 0) && (
                <div className="pt-2 border-t border-black/5">
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setAssetTypeFilter([]);
                    }}
                    className="text-sm text-azure hover:text-azure/80 font-medium"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      )}

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
          No geocoded holdings yet for this portfolio. Holdings will appear on the map once they have location data.
        </div>
      ) : filteredPoints.length === 0 ? (
        <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-6 text-sm text-neutral-500">
          No holdings match the current filters. Try adjusting your search or clearing filters.
        </div>
      ) : (
        <div className="rounded-2xl border border-black/5 bg-white shadow-soft overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg will-change-transform rm:transition-none rm:transform-none">
          <div className="w-full h-[520px] sm:h-[560px] md:h-[600px] lg:h-[640px]">
            <ImpactMap
              points={filteredPoints as any}
              mode={mapMode}
              onPointClick={(p: MapApiPoint) => {
                if (!p.holdingId) return;
                // Navigate to the holdings details page at app/dashboard/holdings/[holdingId]/page.tsx
                router.push(`/dashboard/holdings/${encodeURIComponent(p.holdingId)}`);
              }}
              onPointHover={setHighlightedHoldingId}
              highlightedId={highlightedHoldingId}
            />
          </div>
        </div>
      )}
    </section>
  );
}