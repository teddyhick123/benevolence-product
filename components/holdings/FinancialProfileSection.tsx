'use client';

import { useState, useEffect, useCallback } from 'react';
import CharityLinkSearch from './CharityLinkSearch';
import FinancialStatsGrid from './FinancialStatsGrid';
import CharityRatingDisplay from './CharityRatingDisplay';
import FilingHistory from './FilingHistory';
import FinancialAnalysisNarrative from './FinancialAnalysisNarrative';

interface LinkedCharity {
  id: string;
  ein: string;
  name: string;
  sector?: string;
  city?: string;
  state?: string;
}

interface FinancialProfileData {
  charity: {
    id: string;
    ein: string;
    name: string;
    legal_name?: string;
    sector?: string;
    ntee_code?: string;
    city?: string;
    state?: string;
    website?: string;
    mission_statement?: string;
    annual_revenue?: number | null;
    annual_expenses?: number | null;
    assets?: number | null;
    program_expense_ratio?: number | null;
    irs_deductibility_status?: string;
    last_form_990_date?: string;
  };
  filings: any[];
  charity_navigator_rating: any;
  cached_analysis: {
    content: string;
    generated_at: string;
    version: number;
  } | null;
}

export default function FinancialProfileSection({
  holdingId,
  charityId,
  linkedCharity,
}: {
  holdingId: string;
  charityId?: string | null;
  linkedCharity?: LinkedCharity | null;
}) {
  const [profile, setProfile] = useState<FinancialProfileData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentLinkedCharity, setCurrentLinkedCharity] = useState<LinkedCharity | null>(
    linkedCharity || null
  );

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/holdings/${holdingId}/financial-profile`);
      if (res.status === 404) {
        // No charity linked
        setProfile(null);
        setCurrentLinkedCharity(null);
        return;
      }
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load financial profile');
      }
      const data = await res.json();
      setProfile(data);
      if (data.charity) {
        setCurrentLinkedCharity({
          id: data.charity.id,
          ein: data.charity.ein,
          name: data.charity.name,
          sector: data.charity.sector,
          city: data.charity.city,
          state: data.charity.state,
        });
      }
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, [holdingId]);

  useEffect(() => {
    if (charityId) {
      fetchProfile();
    }
  }, [charityId, fetchProfile]);

  const handleLinked = () => {
    fetchProfile();
  };

  // Map Charity Navigator rating to display format
  const cnRating = profile?.charity_navigator_rating;
  const displayRating = cnRating?.currentRating
    ? {
        overall_score: cnRating.currentRating.score,
        financial_score: cnRating.currentRating.financialRating?.score ?? null,
        accountability_score: cnRating.currentRating.accountabilityRating?.score ?? null,
        letter_grade: null, // CN API uses star ratings, not letter grades
        rated: true,
      }
    : null;

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-neutral-700">Public Financial Profile</h3>
        {profile?.charity?.website && (
          <a
            href={profile.charity.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-azure hover:text-azure/80 transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Website
          </a>
        )}
      </div>

      {/* Charity Link Search */}
      <CharityLinkSearch
        holdingId={holdingId}
        linkedCharity={currentLinkedCharity}
        onLinked={handleLinked}
      />

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-azure/30 border-t-azure rounded-full animate-spin" />
          <span className="ml-3 text-sm text-neutral-500">Loading financial data...</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={fetchProfile}
            className="mt-2 text-xs text-red-600 hover:text-red-800 underline"
          >
            Try again
          </button>
        </div>
      )}

      {/* Profile content */}
      {profile && !loading && (
        <div className="space-y-4">
          {/* Mission statement */}
          {profile.charity.mission_statement && (
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <h4 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-2">Mission</h4>
              <p className="text-sm text-neutral-700 leading-relaxed">{profile.charity.mission_statement}</p>
            </div>
          )}

          {/* Financial stats grid */}
          <FinancialStatsGrid
            annualRevenue={profile.charity.annual_revenue}
            annualExpenses={profile.charity.annual_expenses}
            totalAssets={profile.charity.assets}
            programExpenseRatio={profile.charity.program_expense_ratio}
          />

          {/* Rating + Analysis side by side on larger screens */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <CharityRatingDisplay rating={displayRating} />
            </div>
            <div className="lg:col-span-2">
              <FinancialAnalysisNarrative
                holdingId={holdingId}
                cachedAnalysis={profile.cached_analysis}
              />
            </div>
          </div>

          {/* Filing history */}
          <FilingHistory filings={profile.filings} />

          {/* Metadata footer */}
          <div className="flex items-center gap-4 text-[11px] text-neutral-400">
            {profile.charity.ein && <span>EIN: {profile.charity.ein}</span>}
            {profile.charity.ntee_code && <span>NTEE: {profile.charity.ntee_code}</span>}
            {profile.charity.irs_deductibility_status && (
              <span>IRS: {profile.charity.irs_deductibility_status}</span>
            )}
            {profile.charity.last_form_990_date && (
              <span>Last 990: {profile.charity.last_form_990_date}</span>
            )}
          </div>
        </div>
      )}

      {/* Empty state when no charity linked and not loading */}
      {!profile && !loading && !error && !currentLinkedCharity && (
        <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50/50 p-6 text-center">
          <svg className="w-8 h-8 text-neutral-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <p className="text-sm text-neutral-500">
            Link a nonprofit above to view public financial data, ratings, and AI analysis.
          </p>
        </div>
      )}
    </section>
  );
}
