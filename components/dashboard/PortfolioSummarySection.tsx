'use client';

import React, { useState, useEffect } from 'react';
import AssetTypeTabs, { AssetTypeTab } from '../holdings/AssetTypeTabs';
import PortfolioInvestmentSummaryCard from './PortfolioInvestmentSummary';
import PortfolioGrantSummaryCard from './PortfolioGrantSummary';
import PortfolioDonationSummaryCard from './PortfolioDonationSummary';
import AllAssetsOverview from './AllAssetsOverview';
import { PortfolioInvestmentSummary } from '@/lib/schemas/investment';
import { PortfolioGrantSummary } from '@/lib/schemas/grant';
import { PortfolioDonationSummary } from '@/lib/schemas/donation';
import { useEntityVocabulary } from '@/lib/hooks/use-entity-vocabulary';

type Props = {
  portfolioId: string;
  orgId?: string | null;
};

export default function PortfolioSummarySection({ portfolioId, orgId }: Props) {
  const vocabulary = useEntityVocabulary(orgId);
  const grantPlural = vocabulary.grant.plural;
  const [activeTab, setActiveTab] = useState<AssetTypeTab>('all');
  const [loading, setLoading] = useState(true);

  // State for summary data
  const [investmentSummary, setInvestmentSummary] = useState<PortfolioInvestmentSummary | null>(null);
  const [grantSummary, setGrantSummary] = useState<PortfolioGrantSummary | null>(null);
  const [donationSummary, setDonationSummary] = useState<PortfolioDonationSummary | null>(null);

  // Tab counts
  const [tabCounts, setTabCounts] = useState({
    all: 0,
    investments: 0,
    grants: 0,
    donations: 0,
  });

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();

    const fetchSummary = (url: string) =>
      fetch(url, { cache: 'no-store', signal: controller.signal }).catch((error) => {
        if (controller.signal.aborted) return null;
        throw error;
      });

    async function fetchData() {
      try {
        setLoading(true);

        // Fetch all summaries in parallel
        const [investmentRes, grantRes, donationRes] = await Promise.all([
          fetchSummary(`/api/portfolio/${portfolioId}/performance`),
          fetchSummary(`/api/portfolio/${portfolioId}/grants`),
          fetchSummary(`/api/portfolio/${portfolioId}/donations`),
        ]);

        if (!mounted || controller.signal.aborted) return;

        // Parse investment summary
        let investmentData = null;
        if (investmentRes?.ok) {
          investmentData = await investmentRes.json();
          if (!mounted || controller.signal.aborted) return;
          setInvestmentSummary(investmentData.summary || null);
        }

        // Parse grant summary
        let grantData = null;
        if (grantRes?.ok) {
          grantData = await grantRes.json();
          if (!mounted || controller.signal.aborted) return;
          setGrantSummary(grantData.summary || null);
        }

        // Parse donation summary
        let donationData = null;
        if (donationRes?.ok) {
          donationData = await donationRes.json();
          if (!mounted || controller.signal.aborted) return;
          setDonationSummary(donationData.summary || null);
        }

        // Calculate tab counts from already-parsed data
        const invCount = investmentData?.summary?.total_investments || 0;
        const grantCount = grantData?.summary?.total_grants || 0;
        const donCount = donationData?.summary?.total_donations || 0;

        setTabCounts({
          all: invCount + grantCount + donCount,
          investments: invCount,
          grants: grantCount,
          donations: donCount,
        });
      } catch (error) {
        if (!controller.signal.aborted && mounted) {
          console.warn('Portfolio summaries unavailable:', error);
        }
      } finally {
        if (mounted && !controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchData();

    return () => {
      mounted = false;
      controller.abort();
    };
  }, [portfolioId]);

  return (
    <div className="space-y-6">
      {/* Tabs */}
      <AssetTypeTabs
        activeTab={activeTab}
        onChange={setActiveTab}
        counts={tabCounts}
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-6">
        {/* All Assets View - Show comprehensive overview */}
        {activeTab === 'all' && (
          <>
            {(investmentSummary || grantSummary || donationSummary) && !loading ? (
              <AllAssetsOverview
                portfolioId={portfolioId}
                investmentSummary={investmentSummary}
                grantSummary={grantSummary}
                donationSummary={donationSummary}
              />
            ) : loading ? (
              <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-12 text-center text-neutral-500">
                Loading portfolio overview...
              </div>
            ) : (
              <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-12 text-center">
                <div className="text-neutral-400 mb-2">
                  <svg className="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-neutral-900 mb-1">No Holdings Yet</h3>
                <p className="text-sm text-neutral-600">Add your first holding to see portfolio summaries</p>
              </div>
            )}
          </>
        )}

        {/* Investments View */}
        {activeTab === 'investments' && investmentSummary && (
          <PortfolioInvestmentSummaryCard
            summary={investmentSummary}
            loading={loading}
          />
        )}

        {/* Grants View */}
        {activeTab === 'grants' && grantSummary && (
          <PortfolioGrantSummaryCard
            summary={grantSummary}
            loading={loading}
          />
        )}

        {/* Donations View */}
        {activeTab === 'donations' && donationSummary && (
          <PortfolioDonationSummaryCard
            summary={donationSummary}
            loading={loading}
          />
        )}

        {/* Empty States for specific tabs */}
        {activeTab === 'investments' && !investmentSummary && !loading && (
          <EmptyState
            icon={(
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            )}
            title="No Investments"
            description="Add investments (equity, debt, PRIs, or MRIs) to track performance"
          />
        )}

        {activeTab === 'grants' && !grantSummary && !loading && (
          <EmptyState
            icon={(
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            title={`No ${grantPlural}`}
            description={`Add foundation or DAF ${grantPlural.toLowerCase()} to track milestones and reporting`}
          />
        )}

        {activeTab === 'donations' && !donationSummary && !loading && (
          <EmptyState
            icon={(
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
              </svg>
            )}
            title="No Donations"
            description="Add charitable donations to track tax benefits and carryforwards"
          />
        )}
      </div>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl bg-white border border-black/5 shadow-soft p-12 text-center">
      <div className="text-neutral-300 mb-3 flex justify-center">{icon}</div>
      <h3 className="text-lg font-semibold text-neutral-900 mb-1">{title}</h3>
      <p className="text-sm text-neutral-600">{description}</p>
    </div>
  );
}
