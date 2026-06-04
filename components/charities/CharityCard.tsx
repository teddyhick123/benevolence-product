'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MapPin, DollarSign, Star } from 'lucide-react';

interface CharityCardProps {
  charity: {
    id: string;
    ein: string;
    name: string;
    ntee_code?: string;
    city?: string;
    state?: string;
    mission?: string;
    total_revenue?: number;
    charity_navigator_score?: number;
    portfolio_metadata?: {
      entry_id: string;
      status?: string;
    };
  };
  view?: 'discovery' | 'portfolio';
  onAddToPortfolio?: (ein: string) => void;
  onEdit?: (recommendationId: string) => void;
}

export default function CharityCard({
  charity,
  view = 'discovery',
  onAddToPortfolio,
  onEdit,
}: CharityCardProps) {
  const [isHovered, setIsHovered] = useState(false);

  const location = [charity.city, charity.state].filter(Boolean).join(', ');
  const rating = charity.charity_navigator_score;

  const formatRevenue = (revenue?: number) => {
    if (!revenue) return 'N/A';
    if (revenue >= 1000000) {
      return `$${(revenue / 1000000).toFixed(1)}M`;
    }
    if (revenue >= 1000) {
      return `$${(revenue / 1000).toFixed(0)}K`;
    }
    return `$${revenue}`;
  };

  return (
    <div
      className="rounded-2xl border border-black/5 bg-white shadow-soft p-4 hover:shadow-lg transition-shadow duration-200 cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Link href={`/charities/${charity.ein}`} className="block">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-ink line-clamp-2 hover:text-azure">
              {charity.name}
            </h3>
            {charity.ntee_code && (
              <span className="inline-block mt-1 px-2 py-0.5 bg-azure/10 text-azure text-xs font-medium rounded">
                {charity.ntee_code}
              </span>
            )}
          </div>
          {rating != null && (
            <div className="ml-2 flex items-center">
              <Star className="w-4 h-4 text-sunset fill-sunset mr-1" />
              <span className="text-sm font-semibold text-ink">{rating}</span>
            </div>
          )}
        </div>

        {/* Mission */}
        {charity.mission && (
          <p className="text-sm text-neutral-600 line-clamp-2 mb-2 italic">
            {charity.mission}
          </p>
        )}

        {/* Details */}
        <div className="flex items-center gap-4 text-sm text-neutral-600 mt-3">
          {location && (
            <div className="flex items-center">
              <MapPin className="w-4 h-4 mr-1" />
              <span className="truncate">{location}</span>
            </div>
          )}
          {charity.total_revenue && (
            <div className="flex items-center">
              <DollarSign className="w-4 h-4 mr-1" />
              <span>{formatRevenue(charity.total_revenue)}</span>
            </div>
          )}
        </div>

        {/* Portfolio Status (My Portfolio view only) */}
        {view === 'portfolio' && charity.portfolio_metadata && (
          <div className="mt-3 pt-3 border-t border-black/5">
            <span className="inline-block px-2 py-1 bg-neutral-100 text-neutral-700 text-xs rounded">
              Status: {charity.portfolio_metadata.status || 'active'}
            </span>
          </div>
        )}
      </Link>

      {/* Actions */}
      <div className="mt-3 pt-3 border-t border-black/5">
        {view === 'discovery' && onAddToPortfolio && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onAddToPortfolio(charity.ein);
            }}
            className="w-full px-4 py-2 bg-azure text-white text-sm font-medium rounded hover:bg-azure/90 transition-colors"
          >
            Add to Portfolio
          </button>
        )}

        {view === 'portfolio' && charity.portfolio_metadata && onEdit && (
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (charity.portfolio_metadata?.entry_id) {
                onEdit(charity.portfolio_metadata.entry_id);
              }
            }}
            className="w-full px-4 py-2 border border-black/10 text-neutral-700 text-sm font-medium rounded hover:bg-neutral-50 transition-colors"
          >
            Edit Details
          </button>
        )}
      </div>

      {/* EIN (subtle, bottom right) */}
      <div className="mt-2 text-right">
        <span className="text-xs text-neutral-400">EIN: {charity.ein}</span>
      </div>
    </div>
  );
}
