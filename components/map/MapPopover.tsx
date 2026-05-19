'use client';

import React from 'react';
import type { ImpactMapPoint } from '@/components/map/ImpactMap';

/**
 * Enhanced Map Popover with KPIs
 *
 * Displays when a user clicks on a map point. Shows:
 * - Holding name and tags
 * - Top 3 KPIs with values and units
 * - Financial summary (funds allocated, total contributions)
 * - "View Details" button to navigate to holding page
 *
 * Matches the design system: rounded-xl, clean borders, soft shadows
 */

type Props = {
  point: ImpactMapPoint;
  position: { x: number; y: number };
  onClose: () => void;
  onOpenDetails?: () => void;
};

export default function MapPopover({ point, position, onClose, onOpenDetails }: Props) {
  const hasKpis = point.topKpis && point.topKpis.length > 0;
  const hasFinancial = point.amountUSD != null || point.totalContributions != null;
  const hasMultipleLocations = (point.locationCount ?? 0) > 1;
  const isAdditionalLocation = point.isPrimaryLocation === false;

  return (
    <div
      className="absolute z-10 w-[calc(100%-24px)] sm:max-w-sm rounded-xl border border-black/10 bg-white shadow-lg overflow-hidden"
      style={{
        left: position.x,
        top: position.y,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="bg-gradient-to-r from-azure/5 via-azure/3 to-transparent p-4 border-b border-black/5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-neutral-900 text-base truncate">
              {point.name}
            </h3>

            {/* Location Info Badge (for additional locations) */}
            {isAdditionalLocation && point.locationName && (
              <div className="flex items-center gap-1.5 mt-1">
                <svg className="w-3.5 h-3.5 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span className="text-xs text-neutral-600 font-medium">
                  {point.locationName}
                </span>
              </div>
            )}

            {/* Tags and Location Count */}
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {/* Multiple Locations Badge */}
              {hasMultipleLocations && point.isPrimaryLocation && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {point.locationCount} locations
                </span>
              )}

              {/* Asset Type and Other Tags */}
              {point.tags && point.tags.length > 0 && point.tags.map((tag, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-azure/10 text-azure border border-azure/20"
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 p-1 rounded-md hover:bg-black/5 transition-colors"
            aria-label="Close"
          >
            <svg
              className="w-4 h-4 text-neutral-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Status and Date */}
        {(point.status || point.asOf) && (
          <div className="text-xs text-neutral-600 mt-2 flex items-center gap-2">
            {point.status && (
              <span className="inline-flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  point.status === 'Active' ? 'bg-green-500' :
                  point.status === 'Exited' ? 'bg-neutral-400' :
                  'bg-amber-500'
                }`} />
                {point.status}
              </span>
            )}
            {point.asOf && (
              <span className="text-neutral-500">
                • {new Date(point.asOf).toLocaleDateString()}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* KPIs Section */}
        {hasKpis && (
          <div>
            <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
              Key Performance Indicators
            </h4>
            <div className="space-y-2">
              {point.topKpis!.slice(0, 3).map((kpi, idx) => (
                <div
                  key={idx}
                  className="flex items-baseline justify-between gap-2 py-1.5 border-b border-black/5 last:border-0"
                >
                  <span className="text-sm text-neutral-700 flex-1 min-w-0 truncate">
                    {kpi.displayName}
                  </span>
                  <span className="text-sm font-semibold text-neutral-900 flex-shrink-0">
                    {kpi.value.toLocaleString()}
                    {kpi.unit && (
                      <span className="text-xs text-neutral-500 ml-0.5">{kpi.unit}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Financial Summary */}
        {hasFinancial && (
          <div>
            <h4 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">
              Financial Summary
            </h4>
            <div className="space-y-1.5">
              {point.amountUSD != null && (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-neutral-700">Funds Allocated</span>
                  <span className="text-sm font-semibold text-neutral-900">
                    ${point.amountUSD.toLocaleString()}
                  </span>
                </div>
              )}
              {point.totalContributions != null && point.totalContributions > 0 && (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-sm text-neutral-700">Total Contributions</span>
                  <span className="text-sm font-semibold text-neutral-900">
                    ${point.totalContributions.toLocaleString()}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* No data state */}
        {!hasKpis && !hasFinancial && (
          <div className="text-sm text-neutral-500 py-2">
            No performance data available for this holding.
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-3 bg-neutral-50 border-t border-black/5 flex justify-end">
        {point.holdingId ? (
          <button
            type="button"
            onClick={() => {
              onOpenDetails?.();
              onClose();
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-azure text-white text-sm font-medium hover:bg-azure/90 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
          >
            View Details
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        ) : (
          <span className="text-xs text-neutral-500">No linked holding</span>
        )}
      </div>
    </div>
  );
}
