'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import RiskAnalysis from '@/components/analytics/RiskAnalysis';

export default function RiskPage() {
  const router = useRouter();
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch user's portfolio ID
  useEffect(() => {
    async function fetchProfile() {
      try {
        const res = await apiRequest('/api/me');
        if (res.ok) {
          const json = await readJson(res);
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
          <div className="h-32 bg-gray-200 rounded-lg"></div>
          <div className="grid grid-cols-3 gap-4">
            <div className="h-64 bg-gray-200 rounded-lg"></div>
            <div className="h-64 bg-gray-200 rounded-lg"></div>
            <div className="h-64 bg-gray-200 rounded-lg"></div>
          </div>
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
        <h1 className="text-2xl font-bold text-gray-900">Risk Analysis</h1>
        <p className="text-gray-500 mt-1">
          Analyze portfolio concentration, sector distribution, and geographic exposure
        </p>
      </div>

      {/* Risk Component */}
      <RiskAnalysis portfolioId={portfolioId} showHistory={true} />

      {/* Help Section */}
      <div className="mt-8 bg-gray-50 rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Understanding Risk Metrics</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Concentration Risk</h4>
            <p className="text-gray-600 mb-2">
              Measures how much of your portfolio is allocated to a small number of holdings.
            </p>
            <ul className="text-gray-500 space-y-1">
              <li><span className="text-red-600">Critical:</span> Top 3 &gt; 60%</li>
              <li><span className="text-orange-600">High:</span> Top 3 &gt; 50%</li>
              <li><span className="text-yellow-600">Medium:</span> Top 3 &gt; 30%</li>
              <li><span className="text-green-600">Low:</span> Top 3 ≤ 30%</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Sector Risk</h4>
            <p className="text-gray-600 mb-2">
              Measures diversity across different cause areas and sectors.
            </p>
            <ul className="text-gray-500 space-y-1">
              <li><span className="text-orange-600">High:</span> Largest &gt; 70%</li>
              <li><span className="text-yellow-600">Medium:</span> Largest &gt; 50%</li>
              <li><span className="text-green-600">Low:</span> Largest ≤ 50%</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Geographic Risk</h4>
            <p className="text-gray-600 mb-2">
              Measures distribution of holdings across different regions.
            </p>
            <ul className="text-gray-500 space-y-1">
              <li><span className="text-orange-600">High:</span> Largest &gt; 80%</li>
              <li><span className="text-yellow-600">Medium:</span> Largest &gt; 60%</li>
              <li><span className="text-green-600">Low:</span> Largest ≤ 60%</li>
            </ul>
          </div>
        </div>

        <div className="mt-6 pt-6 border-t border-gray-200">
          <h4 className="font-medium text-gray-900 mb-2">Herfindahl-Hirschman Index (HHI)</h4>
          <p className="text-gray-600 text-sm">
            The HHI is a measure of market concentration. It&apos;s calculated by summing the squared percentage shares
            of each holding. Lower values indicate better diversification.
          </p>
          <ul className="text-gray-500 text-sm mt-2 space-y-1">
            <li><strong>0-1,500:</strong> Well diversified portfolio</li>
            <li><strong>1,500-2,500:</strong> Moderately concentrated</li>
            <li><strong>2,500+:</strong> Highly concentrated</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
