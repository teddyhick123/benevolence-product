'use client';

import { useState, useEffect } from 'react';

interface PayoutStatus {
  tax_year: number;
  data_missing?: boolean;
  warning?: string | null;
  distributable_amount: number | null;
  distributions_to_date: number | null;
  pipeline_total: number | null;
  shortfall_after_pipeline: number | null;
  on_track: boolean | null;
  days_remaining: number;
  pct_complete: number | null;
}

interface QualifyingDistribution {
  id: string;
  category: string;
  description: string;
  qualifying_amount: number;
  distribution_date: string;
}

interface Props {
  portfolioId: string;
  taxYear?: number;
}

const CATEGORY_LABELS: Record<string, string> = {
  grants_paid: 'Grants Paid',
  grants_paid_er: 'Grants (ER)',
  program_expenses: 'Program Expenses',
  admin_expenses: 'Admin Expenses (Qualifying)',
  set_aside: 'Set-Asides',
  program_related_investment: 'Program-Related Investments',
  operating_foundation_expenditure: 'Operating Foundation Expenditures',
};

export default function PayoutTracker({ portfolioId, taxYear }: Props) {
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(taxYear || currentYear);
  const [forecast, setForecast] = useState<PayoutStatus | null>(null);
  const [distributions, setDistributions] = useState<QualifyingDistribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [forecastRes, payoutRes] = await Promise.all([
          fetch(`/api/portfolio/${portfolioId}/compliance/payout-forecast?year=${selectedYear}`),
          fetch(`/api/portfolio/${portfolioId}/compliance/payout?year=${selectedYear}`),
        ]);
        if (!forecastRes.ok) throw new Error('Failed to load forecast');
        const forecastData = await forecastRes.json();
        const payoutData = await payoutRes.json();
        setForecast(forecastData);
        setDistributions(payoutData.qualifying_distributions || []);
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [portfolioId, selectedYear]);

  const fmt = (n: number | null) =>
    n == null
      ? 'Not set'
      : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  const pct = forecast?.pct_complete ?? 0;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDash = (pct / 100) * circumference;

  // Category totals
  const byCategory = distributions.reduce<Record<string, number>>((acc, d) => {
    acc[d.category] = (acc[d.category] || 0) + d.qualifying_amount;
    return acc;
  }, {});

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);

  return (
    <div className="space-y-6">
      {/* Header + year selector */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">§4942 Payout Tracker</h2>
          <p className="text-sm text-gray-500 mt-0.5">Minimum distribution requirement progress</p>
        </div>
        <select
          value={selectedYear}
          onChange={e => setSelectedYear(parseInt(e.target.value))}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white"
        >
          {years.map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {loading && (
        <div className="animate-pulse space-y-4">
          <div className="h-48 bg-gray-200 rounded-xl"></div>
          <div className="h-32 bg-gray-200 rounded-xl"></div>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">{error}</div>
      )}

      {!loading && !error && forecast && (
        <>
          {/* Alert banners */}
          {forecast.data_missing && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M4.93 19h14.14c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.2 16c-.77 1.33.19 3 1.73 3z" />
              </svg>
              <div>
                <p className="font-semibold text-amber-900">Payout Setup Required</p>
                <p className="text-sm text-amber-800 mt-0.5">
                  {forecast.warning ?? 'Payout history is missing for this tax year.'}
                </p>
              </div>
            </div>
          )}

          {forecast.shortfall_after_pipeline != null && forecast.shortfall_after_pipeline > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div>
                <p className="font-semibold text-red-800">Payout Shortfall</p>
                <p className="text-sm text-red-700 mt-0.5">
                  {fmt(forecast.shortfall_after_pipeline)} still needed by Dec 31 ({forecast.days_remaining} days remaining).
                  Even with {fmt(forecast.pipeline_total)} in approved/scheduled grants.
                </p>
              </div>
            </div>
          )}

          {forecast.on_track === true && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
              <svg className="w-5 h-5 text-green-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <p className="font-semibold text-green-800">On Track</p>
                <p className="text-sm text-green-700 mt-0.5">
                  Payout requirement is covered with {fmt(forecast.pipeline_total)} in the pipeline.
                </p>
              </div>
            </div>
          )}

          {/* Progress ring + summary */}
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <div className="flex items-center gap-8">
              {/* SVG circular progress */}
              <div className="relative flex-shrink-0">
                <svg width="128" height="128" className="transform -rotate-90">
                  <circle
                    cx="64" cy="64" r={radius}
                    strokeWidth="12"
                    stroke="#e5e7eb"
                    fill="none"
                  />
                  <circle
                    cx="64" cy="64" r={radius}
                    strokeWidth="12"
                    stroke={pct >= 100 ? '#16a34a' : pct >= 75 ? '#2563eb' : pct >= 50 ? '#f59e0b' : '#dc2626'}
                    fill="none"
                    strokeDasharray={`${strokeDash} ${circumference}`}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dasharray 0.6s ease' }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-2xl font-bold text-gray-900">{pct}%</span>
                  <span className="text-xs text-gray-500">complete</span>
                </div>
              </div>

              {/* Stats */}
              <div className="flex-1 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Required distributable amount</span>
                  <span className="font-semibold text-gray-900">{fmt(forecast.distributable_amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Qualifying distributions to date</span>
                  <span className="font-semibold text-green-700">{fmt(forecast.distributions_to_date)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Pipeline (approved/scheduled grants)</span>
                  <span className="font-semibold text-blue-700">{fmt(forecast.pipeline_total)}</span>
                </div>
                <div className="border-t border-gray-100 pt-3 flex justify-between text-sm">
                  <span className="text-gray-700 font-medium">Remaining shortfall</span>
                  <span className={`font-bold ${(forecast.shortfall_after_pipeline ?? 0) > 0 ? 'text-red-600' : 'text-green-600'}`}>
                    {forecast.shortfall_after_pipeline == null
                      ? 'Payout setup required'
                      : forecast.shortfall_after_pipeline > 0
                        ? fmt(forecast.shortfall_after_pipeline)
                        : 'None — on track'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Breakdown by category */}
          {Object.keys(byCategory).length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Breakdown by Category</h3>
              <div className="space-y-3">
                {Object.entries(byCategory).map(([cat, amount]) => {
                  const distributableAmount = forecast.distributable_amount ?? 0;
                  const catPct = distributableAmount > 0
                    ? Math.min(100, Math.round((amount / distributableAmount) * 100))
                    : 0;
                  return (
                    <div key={cat}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-600">{CATEGORY_LABELS[cat] || cat}</span>
                        <span className="text-gray-900 font-medium">{fmt(amount)}</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full">
                        <div
                          className="h-1.5 bg-azure rounded-full"
                          style={{ width: `${catPct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!distributions.length && (
            <div className="text-center py-8 text-gray-400 text-sm">
              No qualifying distributions recorded for {selectedYear}. Use the AI assistant to log distributions.
            </div>
          )}
        </>
      )}
    </div>
  );
}
