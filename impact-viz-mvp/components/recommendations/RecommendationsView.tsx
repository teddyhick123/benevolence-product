'use client';

import { useState, useMemo } from 'react';
import RecommendationCard from './RecommendationCard';
import ComparisonToolbar from './ComparisonToolbar';
import ComparisonView from './ComparisonView';
import { Recommendation } from '@/lib/schemas/recommendations';

type Props = {
  recommendations: Recommendation[];
  loading?: boolean;
  isManager?: boolean;
  onEdit?: (rec: Recommendation) => void;
  onArchive?: (id: string) => void;
  onFavoriteToggle?: (id: string, currentState: boolean) => void;
};

export default function RecommendationsView({
  recommendations,
  loading,
  isManager,
  onEdit,
  onArchive,
  onFavoriteToggle
}: Props) {
  const [sectorFilter, setSectorFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  // Comparison mode state
  const [comparisonMode, setComparisonMode] = useState(false);
  const [selectedForComparison, setSelectedForComparison] = useState<Set<string>>(new Set());
  const [showComparisonView, setShowComparisonView] = useState(false);
  const MAX_COMPARISON_SELECTIONS = 4;

  // Extract unique sectors for filtering
  const sectors = useMemo(() => {
    const uniqueSectors = new Set<string>();
    recommendations.forEach(rec => {
      if (rec.sector) uniqueSectors.add(rec.sector);
    });
    return Array.from(uniqueSectors).sort();
  }, [recommendations]);

  // Calculate favorites count
  const favoritesCount = useMemo(() => {
    return recommendations.filter(rec => rec.is_favorited).length;
  }, [recommendations]);

  // Filter and sort recommendations
  const filteredRecommendations = useMemo(() => {
    let filtered = recommendations;

    // Apply favorites filter
    if (showFavoritesOnly) {
      filtered = filtered.filter(rec => rec.is_favorited);
    }

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
  }, [recommendations, sectorFilter, sortBy, showFavoritesOnly]);

  // Get selected recommendations for comparison
  const selectedRecommendations = useMemo(() => {
    return recommendations.filter(rec => selectedForComparison.has(rec.id));
  }, [recommendations, selectedForComparison]);

  // Handle comparison selection toggle
  const handleSelectionToggle = (id: string, selected: boolean) => {
    setSelectedForComparison(prev => {
      const newSet = new Set(prev);
      if (selected) {
        if (newSet.size < MAX_COMPARISON_SELECTIONS) {
          newSet.add(id);
        }
      } else {
        newSet.delete(id);
      }
      return newSet;
    });
  };

  // Handle starting comparison mode
  const handleStartComparison = () => {
    setComparisonMode(true);
    setSelectedForComparison(new Set());
  };

  // Handle exiting comparison mode
  const handleExitComparison = () => {
    setComparisonMode(false);
    setSelectedForComparison(new Set());
  };

  // Handle opening comparison view
  const handleCompare = () => {
    setShowComparisonView(true);
  };

  // Handle closing comparison view
  const handleCloseComparison = () => {
    setShowComparisonView(false);
    handleExitComparison();
  };

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

        {/* Comparison Mode Toggle */}
        {recommendations.length >= 2 && (
          <button
            onClick={comparisonMode ? handleExitComparison : handleStartComparison}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              comparisonMode
                ? 'bg-azure text-white hover:bg-azure/90'
                : 'border border-azure text-azure hover:bg-azure/5'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            {comparisonMode ? 'Exit Comparison Mode' : 'Compare Organizations'}
          </button>
        )}
      </div>

      {/* Shortlist Toggle */}
      {favoritesCount > 0 && (
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              showFavoritesOnly
                ? 'bg-red-50 border-2 border-red-500 text-red-700'
                : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-50'
            }`}
          >
            <svg
              className={`w-4 h-4 ${showFavoritesOnly ? 'fill-current' : ''}`}
              fill={showFavoritesOnly ? 'currentColor' : 'none'}
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={showFavoritesOnly ? 0 : 2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
            </svg>
            {showFavoritesOnly ? 'Viewing My Shortlist' : 'View My Shortlist'} ({favoritesCount})
          </button>
        </div>
      )}

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
            {showFavoritesOnly
              ? 'No favorites yet'
              : sectorFilter !== 'all'
              ? 'No recommendations in this sector'
              : 'No recommendations yet'}
          </h3>
          <p className="text-neutral-600">
            {showFavoritesOnly
              ? 'Click the heart icon on recommendations to add them to your shortlist.'
              : sectorFilter !== 'all'
              ? 'Try selecting a different sector or view all recommendations.'
              : 'Your portfolio manager will add recommended organizations here.'}
          </p>
          {(sectorFilter !== 'all' || showFavoritesOnly) && (
            <button
              onClick={() => {
                setSectorFilter('all');
                setShowFavoritesOnly(false);
              }}
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
              isManager={isManager}
              onEdit={onEdit}
              onArchive={onArchive}
              onFavoriteToggle={onFavoriteToggle}
              comparisonMode={comparisonMode}
              isSelected={selectedForComparison.has(rec.id)}
              onSelectionToggle={handleSelectionToggle}
              selectionDisabled={selectedForComparison.size >= MAX_COMPARISON_SELECTIONS}
            />
          ))}
        </div>
      )}

      {/* Comparison Toolbar */}
      {comparisonMode && (
        <ComparisonToolbar
          selectedCount={selectedForComparison.size}
          onCompare={handleCompare}
          onClear={() => setSelectedForComparison(new Set())}
          maxSelections={MAX_COMPARISON_SELECTIONS}
        />
      )}

      {/* Comparison View Modal */}
      {showComparisonView && selectedRecommendations.length >= 2 && (
        <ComparisonView
          recommendations={selectedRecommendations}
          onClose={handleCloseComparison}
          onExport={(format) => {
          }}
        />
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
