'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import InsightsPanel from '@/components/analytics/InsightsPanel';

export default function InsightsPage() {
  const router = useRouter();
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

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

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 bg-gray-200 rounded"></div>
          <div className="h-96 bg-gray-200 rounded-lg"></div>
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
      <div className="mb-6">
        <button
          onClick={() => router.push('/dashboard/analytics')}
          className="text-sm text-azure hover:underline mb-2 inline-flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Analytics
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Insights & Recommendations</h1>
        <p className="text-gray-500 mt-1">
          AI-generated insights and actionable recommendations for your portfolio
        </p>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 mb-6">
        <div className="flex gap-3">
          <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div>
            <h4 className="text-sm font-medium text-blue-900">How Insights Work</h4>
            <p className="text-sm text-blue-700 mt-1">
              Insights are generated automatically based on your portfolio data, trends, and benchmarks.
              Mark insights as &quot;Action Taken&quot; when you&apos;ve addressed them, or dismiss insights that aren&apos;t relevant.
            </p>
          </div>
        </div>
      </div>

      {/* Insights Panel */}
      <InsightsPanel
        portfolioId={portfolioId}
        limit={100}
        onInsightAction={(insightId, action) => {
          console.log(`Insight ${insightId} action: ${action}`);
        }}
      />

      {/* Severity Legend */}
      <div className="mt-8 bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Severity Levels</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500"></span>
            <div>
              <p className="text-sm font-medium text-gray-900">Critical</p>
              <p className="text-xs text-gray-500">Requires immediate attention</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-orange-500"></span>
            <div>
              <p className="text-sm font-medium text-gray-900">High</p>
              <p className="text-xs text-gray-500">Important to address soon</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
            <div>
              <p className="text-sm font-medium text-gray-900">Medium</p>
              <p className="text-xs text-gray-500">Should be reviewed</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-500"></span>
            <div>
              <p className="text-sm font-medium text-gray-900">Low</p>
              <p className="text-xs text-gray-500">Opportunity for improvement</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-gray-400"></span>
            <div>
              <p className="text-sm font-medium text-gray-900">Info</p>
              <p className="text-xs text-gray-500">General information</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
