'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MapPin, DollarSign, Star } from 'lucide-react';

interface CharityCardProps {
  charity: {
    id: string;
    ein: string;
    name: string;
    sector?: string;
    city?: string;
    state?: string;
    mission_statement?: string;
    annual_revenue?: number;
    charity_navigator_rating?: {
      score?: number;
      rating?: string;
    };
    portfolio_metadata?: {
      recommendation_id: string;
      interaction_status?: string;
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
  const rating = charity.charity_navigator_rating?.score;
  const ratingGrade = charity.charity_navigator_rating?.rating;

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
      className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-lg transition-shadow duration-200 cursor-pointer"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <Link href={`/charities/${charity.ein}`} className="block">
        {/* Header */}
        <div className="flex items-start justify-between mb-2">
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 line-clamp-2 hover:text-azure">
              {charity.name}
            </h3>
            {charity.sector && (
              <span className="inline-block mt-1 px-2 py-0.5 bg-azure/10 text-azure text-xs font-medium rounded">
                {charity.sector}
              </span>
            )}
          </div>
          {rating && (
            <div className="ml-2 flex items-center">
              <Star className="w-4 h-4 text-yellow-500 fill-yellow-500 mr-1" />
              <span className="text-sm font-semibold text-gray-900">{rating}</span>
              {ratingGrade && (
                <span className="ml-1 text-xs text-gray-500">({ratingGrade})</span>
              )}
            </div>
          )}
        </div>

        {/* Mission Statement (visible on hover) */}
        {isHovered && charity.mission_statement && (
          <p className="text-sm text-gray-600 line-clamp-2 mb-2 italic">
            {charity.mission_statement}
          </p>
        )}

        {/* Details */}
        <div className="flex items-center gap-4 text-sm text-gray-600 mt-3">
          {location && (
            <div className="flex items-center">
              <MapPin className="w-4 h-4 mr-1" />
              <span className="truncate">{location}</span>
            </div>
          )}
          {charity.annual_revenue && (
            <div className="flex items-center">
              <DollarSign className="w-4 h-4 mr-1" />
              <span>{formatRevenue(charity.annual_revenue)}</span>
            </div>
          )}
        </div>

        {/* Portfolio Status (My Portfolio view only) */}
        {view === 'portfolio' && charity.portfolio_metadata && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <span className="inline-block px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded">
              Status: {charity.portfolio_metadata.interaction_status || 'new'}
            </span>
          </div>
        )}
      </Link>

      {/* Actions */}
      <div className="mt-3 pt-3 border-t border-gray-100">
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
              if (charity.portfolio_metadata?.recommendation_id) {
                onEdit(charity.portfolio_metadata.recommendation_id);
              }
            }}
            className="w-full px-4 py-2 border border-gray-300 text-gray-700 text-sm font-medium rounded hover:bg-gray-50 transition-colors"
          >
            Edit Details
          </button>
        )}
      </div>

      {/* EIN (subtle, bottom right) */}
      <div className="mt-2 text-right">
        <span className="text-xs text-gray-400">EIN: {charity.ein}</span>
      </div>
    </div>
  );
}
