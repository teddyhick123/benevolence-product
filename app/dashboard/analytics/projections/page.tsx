'use client';

import { apiRequest, readJson } from "@/lib/api/client";
import { useAnalyticsData } from "@/lib/analytics/hooks";

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import ProjectionChart from '@/components/analytics/ProjectionChart';

type Holding = {
  id: string;
  name: string;
  sector: string | null;
};


const METRIC_OPTIONS = [
  { code: 'TOTAL_IMPACT', label: 'Total Impact', description: 'Overall impact score' },
  { code: 'PROGRAM_EXPENSE_RATIO', label: 'Program Expense Ratio', description: 'Program spending efficiency' },
  { code: 'ADMIN_EXPENSE_RATIO', label: 'Admin Expense Ratio', description: 'Administrative overhead' },
  { code: 'FUNDS_ALLOCATED', label: 'Funds Allocated', description: 'Total funds deployed' },
  { code: 'BENEFICIARIES_SERVED', label: 'Beneficiaries Served', description: 'People impacted' },
];

export default function ProjectionsPage() {
  const router = useRouter();
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(['TOTAL_IMPACT', 'PROGRAM_EXPENSE_RATIO']);
  const [selectedHolding, setSelectedHolding] = useState<string | null>(null);
  const [method, setMethod] = useState<'linear' | 'moving_average'>('linear');
  const [periodsAhead, setPeriodsAhead] = useState(4);

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

  // Fetch holdings for dropdown
  const { data: holdingsData } = useAnalyticsData<{ data: Holding[] }>(
    portfolioId ? `/api/portfolio/${portfolioId}/holdings?select=id,name,sector` : null);
  const holdings = holdingsData?.data ?? [];

  const toggleMetric = (code: string) => {
    setSelectedMetrics(prev =>
      prev.includes(code)
        ? prev.filter(m => m !== code)
        : [...prev, code]
    );
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 bg-gray-200 rounded"></div>
          <div className="h-12 bg-gray-200 rounded"></div>
          <div className="grid grid-cols-2 gap-6">
            <div className="h-96 bg-gray-200 rounded-lg"></div>
            <div className="h-96 bg-gray-200 rounded-lg"></div>
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
        <h1 className="text-2xl font-bold text-gray-900">Metric Projections</h1>
        <p className="text-gray-500 mt-1">
          Forecast future metrics using historical data and trend analysis
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Holding Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scope</label>
            <select
              value={selectedHolding || ''}
              onChange={(e) => setSelectedHolding(e.target.value || null)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">Entire Portfolio</option>
              {holdings.map(h => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>

          {/* Method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Method</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as 'linear' | 'moving_average')}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value="linear">Linear Regression</option>
              <option value="moving_average">Moving Average</option>
            </select>
          </div>

          {/* Periods */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Forecast Periods</label>
            <select
              value={periodsAhead}
              onChange={(e) => setPeriodsAhead(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
            >
              <option value={2}>2 quarters</option>
              <option value={4}>4 quarters</option>
              <option value={6}>6 quarters</option>
              <option value={8}>8 quarters</option>
            </select>
          </div>

          {/* Metrics */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Metrics</label>
            <div className="flex flex-wrap gap-1">
              {METRIC_OPTIONS.slice(0, 3).map(m => (
                <button
                  key={m.code}
                  onClick={() => toggleMetric(m.code)}
                  className={`px-2 py-1 rounded text-xs ${
                    selectedMetrics.includes(m.code)
                      ? 'bg-azure text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {m.label.split(' ')[0]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      {selectedMetrics.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500">
          <p>Select at least one metric to display projections</p>
        </div>
      ) : (
        <div className={`grid gap-6 ${selectedMetrics.length === 1 ? 'grid-cols-1' : 'grid-cols-1 xl:grid-cols-2'}`}>
          {selectedMetrics.map(metricCode => (
            <ProjectionChart
              key={metricCode}
              portfolioId={portfolioId}
              metricCode={metricCode}
              holdingId={selectedHolding || undefined}
              method={method}
              periodsAhead={periodsAhead}
              showControls={false}
              height={selectedMetrics.length === 1 ? 400 : 300}
            />
          ))}
        </div>
      )}

      {/* Metric Reference */}
      <div className="mt-8 bg-gray-50 rounded-lg border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">Available Metrics</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {METRIC_OPTIONS.map(m => (
            <div
              key={m.code}
              className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedMetrics.includes(m.code)
                  ? 'border-azure bg-azure/5'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
              onClick={() => toggleMetric(m.code)}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-900">{m.label}</p>
                {selectedMetrics.includes(m.code) && (
                  <svg className="w-4 h-4 text-azure" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">{m.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
