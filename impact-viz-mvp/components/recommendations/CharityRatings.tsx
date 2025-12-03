'use client';

import { useState, useEffect } from 'react';
import {
  CharityRatingsData,
  formatRating,
  getRatingColorClass,
  getSealBadge,
  shouldRefreshRatings,
} from '@/lib/services/charity-ratings';

type Props = {
  recommendationId: string;
  ein?: string | null;
  organizationName: string;
  initialRatings?: CharityRatingsData | null;
  compact?: boolean; // Compact view for card display
};

export default function CharityRatings({
  recommendationId,
  ein,
  organizationName,
  initialRatings,
  compact = false,
}: Props) {
  const [ratings, setRatings] = useState<CharityRatingsData | null>(initialRatings || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  // Auto-fetch ratings on mount if not provided
  useEffect(() => {
    if (!initialRatings && ein && !loading) {
      fetchRatings();
    }
  }, []);

  const fetchRatings = async (forceRefresh = false) => {
    if (!ein) {
      setError('EIN required to fetch charity ratings');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = `/api/recommendations/${recommendationId}/ratings${forceRefresh ? '?forceRefresh=true' : ''}`;
      const res = await fetch(url);

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || 'Failed to fetch ratings');
      }

      const data = await res.json();
      setRatings(data.ratings);
    } catch (err: any) {
      console.error('Error fetching charity ratings:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = () => {
    fetchRatings(true);
  };

  // No EIN provided
  if (!ein) {
    return (
      <div className="text-sm text-neutral-500 italic">
        No EIN provided - unable to fetch charity ratings
      </div>
    );
  }

  // Loading state
  if (loading && !ratings) {
    return (
      <div className="flex items-center gap-2 text-sm text-neutral-500">
        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Loading charity ratings...
      </div>
    );
  }

  // Error state
  if (error && !ratings) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-sm text-red-700">Failed to load charity ratings: {error}</p>
        <button
          onClick={() => fetchRatings()}
          className="mt-2 text-sm text-red-600 hover:text-red-700 underline"
        >
          Try again
        </button>
      </div>
    );
  }

  // No ratings data
  if (!ratings) {
    return (
      <div className="text-sm text-neutral-500">
        <button
          onClick={() => fetchRatings()}
          className="text-azure hover:text-azure/80 underline"
        >
          Load charity ratings
        </button>
      </div>
    );
  }

  // Check if data is stale
  const isStale = shouldRefreshRatings(ratings.lastUpdated, ratings.nextRefreshAfter);

  // Compact view for card display
  if (compact) {
    return (
      <div className="space-y-2">
        {/* Summary Score */}
        {ratings.summary?.overallHealthScore && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className={`text-2xl font-bold ${getRatingColorClass(ratings.summary.overallHealthScore)}`}>
                {ratings.summary.overallHealthScore}
              </div>
              <div className="text-sm text-neutral-600">
                <div className="font-medium">Health Score</div>
                <div className="text-xs text-neutral-500">Grade: {ratings.summary.financialHealthGrade}</div>
              </div>
            </div>

            {ratings.candid?.sealLevel && ratings.candid.sealLevel !== 'none' && (
              <div className={`px-2 py-1 rounded text-xs font-medium ${getSealBadge(ratings.candid.sealLevel).color}`}>
                {getSealBadge(ratings.candid.sealLevel).label}
              </div>
            )}
          </div>
        )}

        {/* Key Metrics */}
        {ratings.summary?.programExpenseRatio && (
          <div className="flex items-center gap-1 text-xs text-neutral-600">
            <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            <span>{Math.round(ratings.summary.programExpenseRatio)}% to programs</span>
          </div>
        )}

        {/* Expand button */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-azure hover:text-azure/80 underline"
        >
          {expanded ? 'Show less' : 'View detailed ratings'}
        </button>

        {/* Expanded detail */}
        {expanded && (
          <div className="pt-3 border-t border-neutral-100">
            <CharityRatingsExpanded ratings={ratings} organizationName={organizationName} />
          </div>
        )}

        {/* Refresh indicator */}
        {isStale && (
          <div className="text-xs text-orange-600 flex items-center gap-1">
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Data may be outdated
            <button onClick={handleRefresh} className="underline ml-1">
              Refresh
            </button>
          </div>
        )}
      </div>
    );
  }

  // Full view
  return (
    <div className="space-y-4">
      <CharityRatingsExpanded ratings={ratings} organizationName={organizationName} />

      {/* Refresh button */}
      <div className="flex items-center justify-between text-xs text-neutral-500 pt-3 border-t border-neutral-100">
        <div>
          Last updated: {new Date(ratings.lastUpdated).toLocaleDateString()}
          {isStale && <span className="text-orange-600 ml-2">(Outdated)</span>}
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="text-azure hover:text-azure/80 underline disabled:opacity-50"
        >
          {loading ? 'Refreshing...' : 'Refresh data'}
        </button>
      </div>
    </div>
  );
}

// Expanded detailed view component
function CharityRatingsExpanded({
  ratings,
  organizationName,
}: {
  ratings: CharityRatingsData;
  organizationName: string;
}) {
  return (
    <div className="space-y-4">
      {/* Summary Section */}
      {ratings.summary && (
        <div className="grid grid-cols-2 gap-4">
          {ratings.summary.overallHealthScore && (
            <div className="p-3 bg-neutral-50 rounded-lg">
              <div className="text-xs text-neutral-600 mb-1">Overall Health</div>
              <div className={`text-3xl font-bold ${getRatingColorClass(ratings.summary.overallHealthScore)}`}>
                {ratings.summary.overallHealthScore}
              </div>
              <div className="text-xs text-neutral-500 mt-1">
                Grade: {ratings.summary.financialHealthGrade}
              </div>
            </div>
          )}

          {ratings.summary.transparencyLevel && (
            <div className="p-3 bg-neutral-50 rounded-lg">
              <div className="text-xs text-neutral-600 mb-1">Transparency</div>
              <div className="text-lg font-semibold capitalize text-neutral-900">
                {ratings.summary.transparencyLevel}
              </div>
              <div className="text-xs text-neutral-500 mt-1">
                Confidence: {ratings.summary.recommendationConfidence}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Charity Navigator Section */}
      {ratings.charityNavigator && (
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-neutral-900 flex items-center gap-2">
              <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              Charity Navigator
            </h4>
            {ratings.charityNavigator.dataUrl && (
              <a
                href={ratings.charityNavigator.dataUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-600 hover:underline"
              >
                View Profile →
              </a>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3 text-sm">
            {ratings.charityNavigator.overallScore && (
              <div>
                <div className="text-neutral-600">Overall</div>
                <div className={`font-semibold ${getRatingColorClass(ratings.charityNavigator.overallScore)}`}>
                  {formatRating(ratings.charityNavigator.overallScore)}
                </div>
              </div>
            )}
            {ratings.charityNavigator.financialRating && (
              <div>
                <div className="text-neutral-600">Financial</div>
                <div className={`font-semibold ${getRatingColorClass(ratings.charityNavigator.financialRating)}`}>
                  {formatRating(ratings.charityNavigator.financialRating)}
                </div>
              </div>
            )}
            {ratings.charityNavigator.accountabilityRating && (
              <div>
                <div className="text-neutral-600">Accountability</div>
                <div className={`font-semibold ${getRatingColorClass(ratings.charityNavigator.accountabilityRating)}`}>
                  {formatRating(ratings.charityNavigator.accountabilityRating)}
                </div>
              </div>
            )}
          </div>

          {ratings.charityNavigator.encompassRating && (
            <div className="mt-3 pt-3 border-t border-blue-200 text-sm">
              <span className="font-medium text-blue-700">{ratings.charityNavigator.encompassRating}</span>
            </div>
          )}
        </div>
      )}

      {/* Candid/GuideStar Section */}
      {ratings.candid && (
        <div className="p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h4 className="font-semibold text-neutral-900">GuideStar by Candid</h4>
            {ratings.candid.sealLevel && ratings.candid.sealLevel !== 'none' && (
              <div className={`px-3 py-1 rounded-full text-xs font-medium ${getSealBadge(ratings.candid.sealLevel).color}`}>
                {getSealBadge(ratings.candid.sealLevel).label}
              </div>
            )}
          </div>

          {/* Financial Metrics */}
          {ratings.candid.financials && (
            <div className="space-y-2 text-sm">
              {ratings.candid.financials.programExpenseRatio && (
                <div className="flex items-center justify-between">
                  <span className="text-neutral-600">Program Expenses</span>
                  <span className="font-semibold text-neutral-900">
                    {Math.round(ratings.candid.financials.programExpenseRatio)}%
                  </span>
                </div>
              )}
              {ratings.candid.financials.fundraisingExpenseRatio && (
                <div className="flex items-center justify-between">
                  <span className="text-neutral-600">Fundraising Expenses</span>
                  <span className="font-semibold text-neutral-900">
                    {Math.round(ratings.candid.financials.fundraisingExpenseRatio)}%
                  </span>
                </div>
              )}
              {ratings.candid.financials.administrativeExpenseRatio && (
                <div className="flex items-center justify-between">
                  <span className="text-neutral-600">Administrative Expenses</span>
                  <span className="font-semibold text-neutral-900">
                    {Math.round(ratings.candid.financials.administrativeExpenseRatio)}%
                  </span>
                </div>
              )}
              {ratings.candid.financials.revenue && (
                <div className="flex items-center justify-between pt-2 border-t border-purple-200">
                  <span className="text-neutral-600">Annual Revenue</span>
                  <span className="font-semibold text-neutral-900">
                    ${(ratings.candid.financials.revenue / 1000000).toFixed(1)}M
                  </span>
                </div>
              )}
            </div>
          )}

          {ratings.candid.complianceStatus && (
            <div className="mt-3 pt-3 border-t border-purple-200">
              <div className="flex items-center gap-2 text-sm">
                {ratings.candid.complianceStatus === 'compliant' ? (
                  <>
                    <svg className="w-4 h-4 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span className="text-green-700 font-medium">IRS Compliant</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-orange-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span className="text-orange-700 font-medium capitalize">{ratings.candid.complianceStatus.replace('_', ' ')}</span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Warnings */}
      {ratings.warnings && ratings.warnings.length > 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            <div className="flex-1 space-y-1">
              {ratings.warnings.map((warning, idx) => (
                <p key={idx} className="text-xs text-yellow-700">{warning}</p>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Errors */}
      {ratings.errors && ratings.errors.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div className="flex-1 space-y-1">
              {ratings.errors.map((error, idx) => (
                <p key={idx} className="text-xs text-red-700">{error}</p>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
