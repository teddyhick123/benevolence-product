'use client';

import { useState } from 'react';

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
};

type Props = {
  recommendation: Recommendation;
  isManager?: boolean;
  onEdit?: (rec: Recommendation) => void;
  onArchive?: (id: string) => void;
};

export default function RecommendationCard({ recommendation, isManager, onEdit, onArchive }: Props) {
  const [showContact, setShowContact] = useState(false);

  const hasAccreditation = recommendation.accreditation &&
    (recommendation.accreditation.charity_navigator_rating ||
     recommendation.accreditation.guidestar_rating);

  const formatInvestmentRange = () => {
    if (!recommendation.min_investment && !recommendation.max_investment) return null;

    const format = (num: number) => {
      if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
      if (num >= 1000) return `$${(num / 1000).toFixed(0)}K`;
      return `$${num.toLocaleString()}`;
    };

    if (recommendation.min_investment && recommendation.max_investment) {
      return `${format(recommendation.min_investment)} - ${format(recommendation.max_investment)}`;
    } else if (recommendation.min_investment) {
      return `${format(recommendation.min_investment)}+`;
    } else if (recommendation.max_investment) {
      return `Up to ${format(recommendation.max_investment)}`;
    }
  };

  return (
    <div className="card p-6 space-y-4 transition-all duration-200 hover:-translate-y-1 hover:shadow-lg will-change-transform rm:transition-none rm:transform-none relative">
      {/* Header with accreditation badge and actions */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1">
          {hasAccreditation && (
            <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium mb-2">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Accredited
            </div>
          )}
        </div>

        {isManager && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => onEdit?.(recommendation)}
              className="p-2 rounded-lg hover:bg-neutral-100 transition-colors text-neutral-600 hover:text-neutral-900"
              title="Edit recommendation"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={() => {
                if (confirm(`Archive "${recommendation.organization_name}"?`)) {
                  onArchive?.(recommendation.id);
                }
              }}
              className="p-2 rounded-lg hover:bg-red-50 transition-colors text-neutral-600 hover:text-red-600"
              title="Archive recommendation"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Organization name */}
      <div>
        <h3 className="text-xl font-semibold text-neutral-900 mb-1">
          {recommendation.organization_name}
        </h3>
        <div className="w-12 h-0.5 bg-gradient-to-r from-azure via-azure/90 to-azure/70 rounded-full"></div>
      </div>

      {/* Tags: Sector and Impact Focus */}
      {(recommendation.sector || (recommendation.impact_focus && recommendation.impact_focus.length > 0)) && (
        <div className="flex flex-wrap gap-2">
          {recommendation.sector && (
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-azure/10 text-azure border border-azure/20">
              {recommendation.sector}
            </span>
          )}
          {recommendation.impact_focus?.slice(0, 3).map((focus, idx) => (
            <span key={idx} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-neutral-100 text-neutral-700 border border-neutral-200">
              {focus}
            </span>
          ))}
        </div>
      )}

      {/* Description */}
      {recommendation.description && (
        <p className="text-sm text-neutral-700 leading-relaxed line-clamp-3">
          {recommendation.description}
        </p>
      )}

      {/* Location and Investment Range */}
      <div className="space-y-2 pt-2 border-t border-neutral-100">
        {recommendation.location && (
          <div className="flex items-center gap-2 text-sm text-neutral-600">
            <svg className="w-4 h-4 text-neutral-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            {recommendation.location}
          </div>
        )}
        {formatInvestmentRange() && (
          <div className="flex items-center gap-2 text-sm text-neutral-600">
            <svg className="w-4 h-4 text-neutral-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="font-medium">{formatInvestmentRange()}</span>
            <span className="text-neutral-500">suggested range</span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 pt-2">
        {recommendation.website && (
          <a
            href={recommendation.website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-soft"
          >
            Learn More
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        )}

        {recommendation.contact_info && (
          <button
            onClick={() => setShowContact(!showContact)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-neutral-300 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
          >
            Contact Info
            <svg className={`w-4 h-4 transition-transform ${showContact ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>

      {/* Contact Info Expansion */}
      {showContact && recommendation.contact_info && (
        <div className="pt-3 border-t border-neutral-100 space-y-2 text-sm">
          {recommendation.contact_info.email && (
            <div className="flex items-center gap-2 text-neutral-700">
              <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
              <a href={`mailto:${recommendation.contact_info.email}`} className="text-azure hover:underline">
                {recommendation.contact_info.email}
              </a>
            </div>
          )}
          {recommendation.contact_info.phone && (
            <div className="flex items-center gap-2 text-neutral-700">
              <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
              </svg>
              {recommendation.contact_info.phone}
            </div>
          )}
          {recommendation.contact_info.contact_name && (
            <div className="flex items-center gap-2 text-neutral-700">
              <svg className="w-4 h-4 text-neutral-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              {recommendation.contact_info.contact_name}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
