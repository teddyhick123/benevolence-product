'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import BenchmarkComparison from '@/components/analytics/BenchmarkComparison';

export default function BenchmarksPage() {
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
          <div className="h-12 bg-gray-200 rounded"></div>
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
        <h1 className="text-2xl font-bold text-gray-900">Benchmark Comparison</h1>
        <p className="text-gray-500 mt-1">
          Compare your holdings and portfolio metrics against sector and industry benchmarks
        </p>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-blue-900">Sector Benchmarks</h4>
          <p className="text-xs text-blue-700 mt-1">
            Compare holdings against peer organizations in the same sector
          </p>
        </div>
        <div className="bg-green-50 border border-green-100 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-green-900">Size Benchmarks</h4>
          <p className="text-xs text-green-700 mt-1">
            Compare against organizations of similar budget size
          </p>
        </div>
        <div className="bg-purple-50 border border-purple-100 rounded-lg p-4">
          <h4 className="text-sm font-semibold text-purple-900">Geographic Benchmarks</h4>
          <p className="text-xs text-purple-700 mt-1">
            Compare against organizations in the same region
          </p>
        </div>
      </div>

      {/* Benchmark Component */}
      <BenchmarkComparison portfolioId={portfolioId} />

      {/* Help Section */}
      <div className="mt-8 bg-gray-50 rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Understanding Benchmarks</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-gray-600">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Percentile Rankings</h4>
            <ul className="space-y-1">
              <li><span className="text-green-600 font-medium">75th+</span> — Top quartile performance</li>
              <li><span className="text-blue-600 font-medium">50th-75th</span> — Above average</li>
              <li><span className="text-yellow-600 font-medium">25th-50th</span> — Below average</li>
              <li><span className="text-red-600 font-medium">Below 25th</span> — Bottom quartile</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-900 mb-2">Key Metrics</h4>
            <ul className="space-y-1">
              <li><strong>Program Expense Ratio</strong> — % spent on programs vs overhead</li>
              <li><strong>Admin Expense Ratio</strong> — Administrative cost efficiency</li>
              <li><strong>Funds Allocated</strong> — Total funds deployed to holding</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
