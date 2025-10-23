'use client';

import { useState, useMemo } from 'react';
import RecommendationCard from './RecommendationCard';

type Recommendation = {
  id: string;
  organization_name: string;
  website: string | null;
  sector: string | null;
  ein: string | null;
  location: string | null;
  description: string | null;
  impact_focus: string[] | null;
  accreditation: any;
  contact_info: any;
  min_investment: number | null;
  max_investment: number | null;
  recommended_at: string;
  isManager?: boolean;
  onEdit?: (rec: any) => void;
  onArchive?: (id: string) => void;
};

type Props = {
  recommendations: Recommendation[];
  loading?: boolean;
};

export default function RecommendationsView({ recommendations, loading }: Props) {
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');

  // Extract unique sectors for filtering
  const sectors = useMemo(() => {
    const uniqueSectors = new Set<string>();
    recommendations.forEach(rec => {
      if (rec.sector) uniqueSectors.add(rec.sector);
    });
    return Array.from(uniqueSectors).sort();
  }, [recommendations]);

  // Filter and sort recommendations
  const filteredRecommendations = useMemo(() => {
    let filtered = recommendations;

    // Apply sector filter
    if (sectorFilter !== 'all') {
      filtered = filtered.filter(rec => rec.sector === sectorFilter);
    }

    // Apply sorting
    const sorted = [...filtered];
    if (sortBy === 'name') {
      sorted.sort((a, b) => a.organization_name.localeCompare(b.organization_name));
    } else {
      sorted.sort((a, b) => new Date(b.recommended_at).getTime() - new Date(a.recommended_at).getTime());
    }

    return sorted;
  }, [recommendations, sectorFilter, sortBy]);

  if (loading) {
    return (
      <div className="min-h-screen bg-creme flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block w-8 h-8 border-4 border-azure/30 border-t-azure rounded-full animate-spin mb-4"></div>
          <p className="text-neutral-800">Loading recommendations...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">Recommended Organizations</h1>
          <p className="text-neutral-600 mt-1">
            Curated philanthropic opportunities aligned with this portfolio's mission
          </p>
        </div>
      </div>

      {/* Filters and Sort */}
      {recommendations.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Filter by Sector
            </label>
            <select
              value={sectorFilter}
              onChange={(e) => setSectorFilter(e.target.value)}
              className="w-full sm:w-auto px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure bg-white"
            >
              <option value="all">All Sectors ({recommendations.length})</option>
              {sectors.map(sector => (
                <option key={sector} value={sector}>
                  {sector} ({recommendations.filter(r => r.sector === sector).length})
                </option>
              ))}
            </select>
          </div>

          <div className="flex-1">
            <label className="block text-sm font-medium text-neutral-700 mb-1.5">
              Sort By
            </label>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'name')}
              className="w-full sm:w-auto px-4 py-2 border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-azure/50 focus:border-azure bg-white"
            >
              <option value="date">Recently Added</option>
              <option value="name">Organization Name</option>
            </select>
          </div>
        </div>
      )}

      {/* Results Count */}
      {recommendations.length > 0 && (
        <div className="text-sm text-neutral-600">
          Showing {filteredRecommendations.length} of {recommendations.length} recommendations
        </div>
      )}

      {/* Recommendations Grid */}
      {filteredRecommendations.length === 0 ? (
        <div className="card p-12 text-center">
          <svg className="w-16 h-16 text-neutral-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <h3 className="text-lg font-medium text-neutral-900 mb-2">
            {sectorFilter !== 'all' ? 'No recommendations in this sector' : 'No recommendations yet'}
          </h3>
          <p className="text-neutral-600">
            {sectorFilter !== 'all'
              ? 'Try selecting a different sector or view all recommendations.'
              : 'Your portfolio manager will add recommended organizations here.'}
          </p>
          {sectorFilter !== 'all' && (
            <button
              onClick={() => setSectorFilter('all')}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-azure text-white text-sm font-medium hover:opacity-90 transition-opacity"
            >
              View All Recommendations
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRecommendations.map((rec) => (
            <RecommendationCard
              key={rec.id}
              recommendation={rec}
              isManager={rec.isManager}
              onEdit={rec.onEdit}
              onArchive={rec.onArchive}
            />
          ))}
        </div>
      )}

      {/* Help Text */}
      {recommendations.length > 0 && (
        <div className="mt-8 p-4 bg-azure/5 border border-azure/20 rounded-lg">
          <p className="text-sm text-neutral-700">
            <strong>Note:</strong> These are curated recommendations from your portfolio manager.
            Each organization has been selected based on alignment with your portfolio's mission and impact goals.
            Contact information is provided for organizations you'd like to explore further.
          </p>
        </div>
      )}
    </div>
  );
}
