'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import AnalyticsDashboard from '@/components/analytics/AnalyticsDashboard';
import ProjectionChart from '@/components/analytics/ProjectionChart';
import BenchmarkComparison from '@/components/analytics/BenchmarkComparison';
import RiskAnalysis from '@/components/analytics/RiskAnalysis';
import InsightsPanel from '@/components/analytics/InsightsPanel';

type TabId = 'overview' | 'projections' | 'benchmarks' | 'risk' | 'insights';

export default function AnalyticsPage() {
  const searchParams = useSearchParams();
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  // Fetch user's portfolio ID
  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await fetch('/api/me');
        if (res.ok) {
          const json = await res.json();
          setPortfolioId(json.portfolio_id || json.recommended_portfolio_id);
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchProfile();
  }, []);

  // Check URL params for tab
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['overview', 'projections', 'benchmarks', 'risk', 'insights'].includes(tab)) {
      setActiveTab(tab as TabId);
    }
  }, [searchParams]);

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    {
      id: 'overview',
      label: 'Overview',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      id: 'projections',
      label: 'Projections',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
        </svg>
      ),
    },
    {
      id: 'benchmarks',
      label: 'Benchmarks',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
        </svg>
      ),
    },
    {
      id: 'risk',
      label: 'Risk',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      ),
    },
    {
      id: 'insights',
      label: 'Insights',
      icon: (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      ),
    },
  ];

  const handleNavigate = (tab: TabId) => {
    setActiveTab(tab);
    // Update URL without full navigation
    window.history.pushState({}, '', `/dashboard/analytics?tab=${tab}`);
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-gray-200 rounded"></div>
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
          <div className="h-64 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (!portfolioId) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900">No portfolio found</h1>
        <p className="text-gray-500 mt-2">Please create a portfolio first.</p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-500 mt-1">
          Portfolio insights, projections, benchmarks, and risk analysis
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-6 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleNavigate(tab.id)}
              className={`flex items-center gap-2 pb-4 border-b-2 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-azure text-azure'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <AnalyticsDashboard
          portfolioId={portfolioId}
          onViewProjections={() => handleNavigate('projections')}
          onViewBenchmarks={() => handleNavigate('benchmarks')}
          onViewRisk={() => handleNavigate('risk')}
          onViewInsights={() => handleNavigate('insights')}
        />
      )}

      {activeTab === 'projections' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Metric Projections</h2>
              <p className="text-sm text-gray-500 mt-1">
                Forecast future metrics using historical data and trend analysis
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ProjectionChart
              portfolioId={portfolioId}
              metricCode="TOTAL_IMPACT"
              showControls={true}
            />
            <ProjectionChart
              portfolioId={portfolioId}
              metricCode="PROGRAM_EXPENSE_RATIO"
              showControls={true}
            />
          </div>

          <ProjectionChart
            portfolioId={portfolioId}
            metricCode="FUNDS_ALLOCATED"
            showControls={true}
            height={350}
          />
        </div>
      )}

      {activeTab === 'benchmarks' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Benchmark Comparison</h2>
            <p className="text-sm text-gray-500 mt-1">
              Compare holdings and portfolio metrics against sector and industry benchmarks
            </p>
          </div>
          <BenchmarkComparison portfolioId={portfolioId} />
        </div>
      )}

      {activeTab === 'risk' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Risk Analysis</h2>
            <p className="text-sm text-gray-500 mt-1">
              Analyze portfolio concentration, sector distribution, and geographic exposure
            </p>
          </div>
          <RiskAnalysis portfolioId={portfolioId} showHistory={true} />
        </div>
      )}

      {activeTab === 'insights' && (
        <div className="space-y-6">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Insights & Recommendations</h2>
            <p className="text-sm text-gray-500 mt-1">
              AI-generated insights and actionable recommendations for your portfolio
            </p>
          </div>
          <InsightsPanel portfolioId={portfolioId} limit={50} />
        </div>
      )}
    </div>
  );
}
