'use client';

import * as React from 'react';

export interface TaxOptimizationEngineProps {
  portfolioId: string;
  year?: number;
}

export default function TaxOptimizationEngine({
  portfolioId,
  year = new Date().getFullYear(),
}: TaxOptimizationEngineProps) {
  const [donationGoal, setDonationGoal] = React.useState<number>(500000);
  const [timeHorizon, setTimeHorizon] = React.useState<number>(1);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<any>(null);

  async function runOptimization() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/portfolio/${portfolioId}/tax/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          year,
          donation_goal: donationGoal,
          time_horizon: timeHorizon,
        }),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || json.message || 'Failed to run optimization');
      }

      setResults(json.data);
    } catch (err: any) {
      setError(err.message || 'Failed to run optimization');
    } finally {
      setLoading(false);
    }
  }

  const formatCurrency = (amount: number | undefined) => {
    if (amount === undefined || amount === null) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-6">
        <h2 className="text-2xl font-bold text-neutral-900">Tax Optimization Engine</h2>
        <p className="text-sm text-neutral-600 mt-1">
          AI-powered advisor that analyzes your holdings and recommends optimal donation strategies
        </p>
      </div>

      {/* Input Parameters */}
      <div className="bg-white rounded-2xl border border-neutral-200 p-6">
        <h3 className="font-semibold text-neutral-900 mb-4">Optimization Parameters</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Donation Goal (Optional)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-neutral-500">$</span>
              <input
                type="number"
                value={donationGoal}
                onChange={(e) => setDonationGoal(parseFloat(e.target.value) || 0)}
                placeholder="500000"
                className="w-full pl-7 pr-3 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
              />
            </div>
            <p className="text-xs text-neutral-500 mt-1">
              Total amount you want to donate (leave blank for max AGI utilization)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Time Horizon
            </label>
            <select
              value={timeHorizon}
              onChange={(e) => setTimeHorizon(parseInt(e.target.value))}
              className="w-full px-3 py-2 border border-neutral-300 rounded-2xl focus:ring-2 focus:ring-azure/30 focus:border-azure"
            >
              <option value="1">This year only</option>
              <option value="2">2 years</option>
              <option value="3">3 years</option>
              <option value="4">4 years</option>
              <option value="5">5 years</option>
            </select>
            <p className="text-xs text-neutral-500 mt-1">
              Optimize over multiple years for bunching and spreading strategies
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <button
            onClick={runOptimization}
            disabled={loading}
            className="px-8 py-3 bg-gradient-to-r from-azure to-azure/80 text-white rounded-2xl hover:opacity-90 transition-opacity font-medium shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Analyzing...' : 'Optimize My Strategy'}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-6">
          {/* Executive Summary */}
          <div className="bg-gradient-to-br from-coral/10 to-azure/10 border border-coral/25 rounded-2xl p-6">
            <div className="flex items-start gap-3">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-ink mb-3">
                  Optimization Summary
                </h3>
                <pre className="text-sm text-coral whitespace-pre-wrap font-sans">
                  {results.summary}
                </pre>
              </div>
            </div>
          </div>

          {/* Tax Situation Summary */}
          {results.tax_situation && (
            <div className="bg-white rounded-2xl border border-neutral-200 p-6">
              <h3 className="font-semibold text-neutral-900 mb-4">Your Tax Situation</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-neutral-600">AGI</p>
                  <p className="text-xl font-bold text-neutral-900">
                    {formatCurrency(results.tax_situation.agi)}
                  </p>
                </div>
                {results.tax_situation.age && (
                  <div>
                    <p className="text-sm text-neutral-600">Age</p>
                    <p className="text-xl font-bold text-neutral-900">
                      {results.tax_situation.age}
                      {results.tax_situation.age >= 70.5 && (
                        <span className="ml-2 text-sm text-green-600">✓ QCD</span>
                      )}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-sm text-neutral-600">Holdings Analyzed</p>
                  <p className="text-xl font-bold text-neutral-900">
                    {results.holdings_analyzed}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-neutral-600">Strategies Found</p>
                  <p className="text-xl font-bold text-neutral-900">
                    {results.strategies.length}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Strategy Cards */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-neutral-900">
              Recommended Strategies (Ranked by Tax Savings)
            </h3>

            {results.strategies.map((strategy: any) => (
              <StrategyCard key={strategy.rank} strategy={strategy} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Strategy Card Component

function StrategyCard({ strategy }: { strategy: any }) {
  const [expanded, setExpanded] = React.useState(false);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const getRankBadge = (rank: number) => {
    switch (rank) {
      case 1:
        return { emoji: '#1', class: 'bg-sunset/15 text-ink' };
      case 2:
        return { emoji: '#2', class: 'bg-neutral-100 text-neutral-800' };
      case 3:
        return { emoji: '#3', class: 'bg-coral/10 text-coral border border-coral/25' };
      default:
        return { emoji: `#${rank}`, class: 'bg-neutral-100 text-neutral-800' };
    }
  };

  const badge = getRankBadge(strategy.rank);

  return (
    <div className="bg-white rounded-2xl border-2 border-neutral-200 hover:border-azure/30 transition-colors">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-6 text-left"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4 flex-1">
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${badge.class}`}
            >
              {badge.emoji}
            </span>
            <div className="flex-1">
              <h4 className="text-lg font-semibold text-neutral-900 mb-1">
                {strategy.strategy_name}
              </h4>
              <p className="text-sm text-neutral-600">{strategy.description}</p>
            </div>
          </div>
          <div className="text-right ml-4">
            <p className="text-sm text-neutral-600">Tax Savings</p>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(strategy.tax_savings)}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-16 h-2 bg-neutral-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-azure"
                  style={{ width: `${strategy.confidence_score}%` }}
                />
              </div>
              <span className="text-xs text-neutral-600">
                {strategy.confidence_score}%
              </span>
            </div>
          </div>
        </div>

        <div className="mt-4 text-sm text-azure">
          {expanded ? '▼ Hide Details' : '▶ Show Details'}
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-6 border-t border-neutral-200 pt-4">
          {/* Rationale */}
          <div className="mb-4">
            <h5 className="font-semibold text-neutral-900 mb-2">Why This Works</h5>
            <ul className="space-y-1">
              {strategy.rationale.map((reason: string, idx: number) => (
                <li key={idx} className="text-sm text-neutral-700 flex items-start gap-2">
                  <span className="text-azure mt-0.5">•</span>
                  <span>{reason}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Warnings */}
          {strategy.warnings && strategy.warnings.length > 0 && (
            <div className="mb-4 bg-sunset/15 border border-sunset/30 rounded-2xl p-3">
              <h5 className="font-semibold text-ink mb-2 flex items-center gap-2">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <span>Considerations</span>
              </h5>
              <ul className="space-y-1">
                {strategy.warnings.map((warning: string, idx: number) => (
                  <li key={idx} className="text-sm text-ink">
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendations */}
          <div>
            <h5 className="font-semibold text-neutral-900 mb-3">Recommended Actions</h5>
            <div className="space-y-3">
              {strategy.recommendations.map((rec: any, idx: number) => (
                <div
                  key={idx}
                  className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1">
                      <p className="font-medium text-neutral-900">{rec.holding_name}</p>
                      <p className="text-sm text-neutral-600">{rec.reason}</p>
                    </div>
                    <div className="text-right ml-4">
                      <p className="font-bold text-neutral-900">
                        {formatCurrency(rec.amount)}
                      </p>
                      <p className="text-xs text-neutral-600 capitalize">
                        {rec.timing.replace('_', ' ')}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 pt-3 border-t border-neutral-200">
                    <div>
                      <p className="text-xs text-neutral-600">Deductible</p>
                      <p className="text-sm font-medium text-neutral-900">
                        {formatCurrency(rec.tax_impact.deductible)}
                      </p>
                    </div>
                    {rec.tax_impact.carryforward > 0 && (
                      <div>
                        <p className="text-xs text-neutral-600">Carryforward</p>
                        <p className="text-sm font-medium text-coral">
                          {formatCurrency(rec.tax_impact.carryforward)}
                        </p>
                      </div>
                    )}
                    {rec.tax_impact.capital_gains_avoided > 0 && (
                      <div>
                        <p className="text-xs text-neutral-600">Cap Gains Avoided</p>
                        <p className="text-sm font-medium text-green-600">
                          {formatCurrency(rec.tax_impact.capital_gains_avoided)}
                        </p>
                      </div>
                    )}
                    <div>
                      <p className="text-xs text-neutral-600">Tax Savings</p>
                      <p className="text-sm font-bold text-green-600">
                        {formatCurrency(rec.tax_impact.total_tax_savings)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Multi-Year Projection */}
          {strategy.multi_year_projection && (
            <div className="mt-4 pt-4 border-t border-neutral-200">
              <h5 className="font-semibold text-neutral-900 mb-3">Multi-Year Projection</h5>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-200">
                      <th className="text-left py-2 px-3 font-semibold text-neutral-700">
                        Year
                      </th>
                      <th className="text-right py-2 px-3 font-semibold text-neutral-700">
                        Donations
                      </th>
                      <th className="text-right py-2 px-3 font-semibold text-neutral-700">
                        Deductible
                      </th>
                      <th className="text-right py-2 px-3 font-semibold text-neutral-700">
                        Tax Savings
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(strategy.multi_year_projection).map(([key, proj]: [string, any]) => (
                      <tr key={key} className="border-b border-neutral-100">
                        <td className="py-2 px-3 text-neutral-700">{proj.year}</td>
                        <td className="py-2 px-3 text-right text-neutral-700">
                          {formatCurrency(proj.donations)}
                        </td>
                        <td className="py-2 px-3 text-right text-neutral-700">
                          {formatCurrency(proj.deductible)}
                        </td>
                        <td className="py-2 px-3 text-right font-medium text-green-600">
                          {formatCurrency(proj.tax_savings)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
