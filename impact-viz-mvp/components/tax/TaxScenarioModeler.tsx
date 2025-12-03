'use client';

import * as React from 'react';

export interface TaxScenarioModelerProps {
  portfolioId: string;
  year?: number;
}

type DonationType = 'cash' | 'stock' | 'real_estate' | 'pe_vc' | 'other_property';

interface Scenario {
  id: string;
  name: string;
  donation_amount: number;
  donation_type: DonationType;
  cost_basis?: number;
}

const DONATION_TYPE_LABELS: Record<DonationType, string> = {
  cash: 'Cash',
  stock: 'Public Stock',
  real_estate: 'Real Estate',
  pe_vc: 'PE/VC Interest',
  other_property: 'Other Property',
};

export default function TaxScenarioModeler({
  portfolioId,
  year = new Date().getFullYear(),
}: TaxScenarioModelerProps) {
  const [mode, setMode] = React.useState<'single' | 'compare' | 'optimal' | 'bunching'>('single');
  const [scenarios, setScenarios] = React.useState<Scenario[]>([
    {
      id: '1',
      name: 'Scenario 1',
      donation_amount: 100000,
      donation_type: 'cash',
    },
  ]);

  const [results, setResults] = React.useState<any>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Bunching-specific state
  const [annualAmount, setAnnualAmount] = React.useState(50000);
  const [bunchingYears, setBunchingYears] = React.useState(4);
  const [bunchingType, setBunchingType] = React.useState<DonationType>('cash');

  async function runScenarios() {
    setLoading(true);
    setError(null);

    try {
      const body: any = {
        mode,
        year,
      };

      if (mode === 'single' || mode === 'compare') {
        body.scenarios = scenarios.map(s => ({
          donation_amount: s.donation_amount,
          donation_type: s.donation_type,
          cost_basis: s.cost_basis,
        }));
      } else if (mode === 'optimal') {
        body.donation_type = scenarios[0].donation_type;
      } else if (mode === 'bunching') {
        body.annual_amount = annualAmount;
        body.donation_type = bunchingType;
        body.years = bunchingYears;
      }

      const res = await fetch(`/api/portfolio/${portfolioId}/tax/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok) {
        throw new Error(json.error || json.message || 'Failed to calculate scenarios');
      }

      setResults(json.data);
    } catch (err: any) {
      setError(err.message || 'Failed to run scenarios');
    } finally {
      setLoading(false);
    }
  }

  function addScenario() {
    const newId = (scenarios.length + 1).toString();
    setScenarios([
      ...scenarios,
      {
        id: newId,
        name: `Scenario ${newId}`,
        donation_amount: 100000,
        donation_type: 'cash',
      },
    ]);
  }

  function removeScenario(id: string) {
    setScenarios(scenarios.filter(s => s.id !== id));
  }

  function updateScenario(id: string, updates: Partial<Scenario>) {
    setScenarios(scenarios.map(s => (s.id === id ? { ...s, ...updates } : s)));
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
      <div className="bg-white rounded-xl border border-neutral-200 p-6">
        <h2 className="text-2xl font-bold text-neutral-900">Tax Scenario Modeler</h2>
        <p className="text-sm text-neutral-600 mt-1">
          Explore "what-if" scenarios to optimize your charitable giving strategy
        </p>
      </div>

      {/* Mode Selector */}
      <div className="bg-white rounded-xl border border-neutral-200 p-6">
        <h3 className="font-semibold text-neutral-900 mb-4">Analysis Mode</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <button
            onClick={() => setMode('single')}
            className={`p-4 rounded-lg border-2 transition-all ${
              mode === 'single'
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-neutral-200 hover:border-neutral-300'
            }`}
          >
            <div className="text-2xl mb-2">🎯</div>
            <div className="font-medium text-neutral-900">Single Scenario</div>
            <div className="text-xs text-neutral-600 mt-1">
              Analyze one donation
            </div>
          </button>

          <button
            onClick={() => setMode('compare')}
            className={`p-4 rounded-lg border-2 transition-all ${
              mode === 'compare'
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-neutral-200 hover:border-neutral-300'
            }`}
          >
            <div className="text-2xl mb-2">⚖️</div>
            <div className="font-medium text-neutral-900">Compare</div>
            <div className="text-xs text-neutral-600 mt-1">
              Side-by-side comparison
            </div>
          </button>

          <button
            onClick={() => setMode('optimal')}
            className={`p-4 rounded-lg border-2 transition-all ${
              mode === 'optimal'
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-neutral-200 hover:border-neutral-300'
            }`}
          >
            <div className="text-2xl mb-2">🎲</div>
            <div className="font-medium text-neutral-900">Optimal Amount</div>
            <div className="text-xs text-neutral-600 mt-1">
              Max AGI utilization
            </div>
          </button>

          <button
            onClick={() => setMode('bunching')}
            className={`p-4 rounded-lg border-2 transition-all ${
              mode === 'bunching'
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-neutral-200 hover:border-neutral-300'
            }`}
          >
            <div className="text-2xl mb-2">📅</div>
            <div className="font-medium text-neutral-900">Bunching</div>
            <div className="text-xs text-neutral-600 mt-1">
              Spread vs. bunch
            </div>
          </button>
        </div>
      </div>

      {/* Input Forms */}
      {(mode === 'single' || mode === 'compare') && (
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-neutral-900">Scenarios</h3>
            {mode === 'compare' && (
              <button
                onClick={addScenario}
                className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
              >
                + Add Scenario
              </button>
            )}
          </div>

          <div className="space-y-4">
            {scenarios.map((scenario, index) => (
              <div key={scenario.id} className="p-4 bg-neutral-50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <input
                    type="text"
                    value={scenario.name}
                    onChange={(e) => updateScenario(scenario.id, { name: e.target.value })}
                    className="font-medium text-neutral-900 bg-transparent border-none focus:outline-none"
                  />
                  {mode === 'compare' && scenarios.length > 1 && (
                    <button
                      onClick={() => removeScenario(scenario.id)}
                      className="text-red-600 hover:text-red-700 text-sm"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Donation Amount
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-2 text-neutral-500">$</span>
                      <input
                        type="number"
                        value={scenario.donation_amount}
                        onChange={(e) =>
                          updateScenario(scenario.id, {
                            donation_amount: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-full pl-7 pr-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                      Asset Type
                    </label>
                    <select
                      value={scenario.donation_type}
                      onChange={(e) =>
                        updateScenario(scenario.id, {
                          donation_type: e.target.value as DonationType,
                        })
                      }
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    >
                      {Object.entries(DONATION_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {scenario.donation_type !== 'cash' && (
                    <div>
                      <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Cost Basis (Optional)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-2 text-neutral-500">$</span>
                        <input
                          type="number"
                          value={scenario.cost_basis || ''}
                          onChange={(e) =>
                            updateScenario(scenario.id, {
                              cost_basis: parseFloat(e.target.value) || undefined,
                            })
                          }
                          placeholder="0"
                          className="w-full pl-7 pr-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bunching Inputs */}
      {mode === 'bunching' && (
        <div className="bg-white rounded-xl border border-neutral-200 p-6">
          <h3 className="font-semibold text-neutral-900 mb-4">Bunching Strategy Parameters</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Annual Donation Amount
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-neutral-500">$</span>
                <input
                  type="number"
                  value={annualAmount}
                  onChange={(e) => setAnnualAmount(parseFloat(e.target.value) || 0)}
                  className="w-full pl-7 pr-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <p className="text-xs text-neutral-500 mt-1">
                How much you typically donate per year
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Asset Type
              </label>
              <select
                value={bunchingType}
                onChange={(e) => setBunchingType(e.target.value as DonationType)}
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                {Object.entries(DONATION_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-1">
                Years to Analyze
              </label>
              <input
                type="number"
                value={bunchingYears}
                onChange={(e) => setBunchingYears(parseInt(e.target.value) || 4)}
                min="2"
                max="10"
                className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
              <p className="text-xs text-neutral-500 mt-1">
                Projection period (2-10 years)
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Run Button */}
      <div className="flex justify-center">
        <button
          onClick={runScenarios}
          disabled={loading}
          className="px-8 py-3 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-lg hover:opacity-90 transition-opacity font-medium shadow-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Calculating...' : 'Run Analysis'}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="space-y-6">
          {mode === 'single' && <SingleScenarioResults results={results} />}
          {mode === 'compare' && <CompareScenarioResults results={results} />}
          {mode === 'optimal' && <OptimalResults results={results} />}
          {mode === 'bunching' && <BunchingResults results={results} />}
        </div>
      )}
    </div>
  );
}

// Results Components

function SingleScenarioResults({ results }: { results: any }) {
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
    <div className="bg-white rounded-xl border border-neutral-200 p-6">
      <h3 className="text-lg font-semibold text-neutral-900 mb-4">Analysis Results</h3>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-indigo-50 rounded-lg">
          <p className="text-sm text-indigo-700 mb-1">Deductible This Year</p>
          <p className="text-2xl font-bold text-indigo-900">
            {formatCurrency(results.deductible_this_year)}
          </p>
          <p className="text-xs text-indigo-600 mt-1">
            {results.agi_limit_category} AGI limit
          </p>
        </div>

        <div className="p-4 bg-green-50 rounded-lg">
          <p className="text-sm text-green-700 mb-1">Total Tax Savings</p>
          <p className="text-2xl font-bold text-green-900">
            {formatCurrency(results.total_tax_savings)}
          </p>
          {results.capital_gains_tax_saved && (
            <p className="text-xs text-green-600 mt-1">
              Includes {formatCurrency(results.capital_gains_tax_saved)} cap gains saved
            </p>
          )}
        </div>

        {results.excess_carryforward > 0 && (
          <div className="p-4 bg-amber-50 rounded-lg">
            <p className="text-sm text-amber-700 mb-1">Carryforward</p>
            <p className="text-2xl font-bold text-amber-900">
              {formatCurrency(results.excess_carryforward)}
            </p>
            <p className="text-xs text-amber-600 mt-1">
              {results.years_to_fully_deduct} years to fully deduct
            </p>
          </div>
        )}
      </div>

      {/* Recommendations */}
      {results.recommendations && results.recommendations.length > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="font-medium text-blue-900 mb-2">💡 Insights</p>
          <ul className="space-y-2">
            {results.recommendations.map((rec: string, idx: number) => (
              <li key={idx} className="text-sm text-blue-800">
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function CompareScenarioResults({ results }: { results: any }) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Comparison Summary */}
      <div className="bg-white rounded-xl border border-neutral-200 p-6">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">Comparison Results</h3>
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-4 mb-6">
          <p className="font-medium text-indigo-900 mb-2">🏆 Recommendation</p>
          <p className="text-sm text-indigo-800">{results.comparison.recommendation}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-green-50 rounded-lg">
            <p className="text-sm text-green-700 mb-1">Best Tax Savings</p>
            <p className="font-bold text-green-900">
              {results.comparison.best_tax_savings.scenario_name}
            </p>
            <p className="text-xl font-bold text-green-900 mt-2">
              {formatCurrency(results.comparison.best_tax_savings.savings)}
            </p>
          </div>

          <div className="p-4 bg-blue-50 rounded-lg">
            <p className="text-sm text-blue-700 mb-1">Best AGI Utilization</p>
            <p className="font-bold text-blue-900">
              {results.comparison.best_agi_utilization.scenario_name}
            </p>
            <p className="text-xl font-bold text-blue-900 mt-2">
              {Math.round(results.comparison.best_agi_utilization.utilization)}%
            </p>
          </div>

          <div className="p-4 bg-purple-50 rounded-lg">
            <p className="text-sm text-purple-700 mb-1">Fastest Full Deduction</p>
            <p className="font-bold text-purple-900">
              {results.comparison.fastest_full_deduction.scenario_name}
            </p>
            <p className="text-xl font-bold text-purple-900 mt-2">
              {results.comparison.fastest_full_deduction.years} year{results.comparison.fastest_full_deduction.years !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      </div>

      {/* Detailed Table */}
      <div className="bg-white rounded-xl border border-neutral-200 p-6 overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-neutral-200">
              <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">
                Scenario
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-neutral-700">
                Amount
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-neutral-700">
                Deductible
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-neutral-700">
                Tax Savings
              </th>
              <th className="text-right py-3 px-4 text-sm font-semibold text-neutral-700">
                AGI Use
              </th>
            </tr>
          </thead>
          <tbody>
            {results.scenarios.map((scenario: any, idx: number) => (
              <tr key={idx} className="border-b border-neutral-100">
                <td className="py-3 px-4 font-medium text-neutral-900">
                  {scenario.scenario_name}
                </td>
                <td className="py-3 px-4 text-right text-neutral-700">
                  {formatCurrency(scenario.donation_amount)}
                </td>
                <td className="py-3 px-4 text-right text-neutral-700">
                  {formatCurrency(scenario.deductible_this_year)}
                </td>
                <td className="py-3 px-4 text-right font-bold text-green-600">
                  {formatCurrency(scenario.total_tax_savings)}
                </td>
                <td className="py-3 px-4 text-right text-neutral-700">
                  {Math.round(scenario.utilization_percentage)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OptimalResults({ results }: { results: any }) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-6">
      <h3 className="text-lg font-semibold text-neutral-900 mb-4">Optimal Donation Amount</h3>
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg p-6">
        <div className="text-center mb-4">
          <p className="text-sm text-green-700 mb-2">Maximum Donation (No Carryforward)</p>
          <p className="text-5xl font-bold text-green-900">
            {formatCurrency(results.optimal_amount)}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 mt-6">
          <div className="text-center">
            <p className="text-sm text-green-700">AGI Limit</p>
            <p className="text-xl font-bold text-green-900">
              {formatCurrency(results.agi_limit)}
            </p>
          </div>
          <div className="text-center">
            <p className="text-sm text-green-700">Tax Savings</p>
            <p className="text-xl font-bold text-green-900">
              {formatCurrency(results.tax_savings_at_optimal)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function BunchingResults({ results }: { results: any }) {
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const recommended = results.recommendation;

  return (
    <div className="bg-white rounded-xl border border-neutral-200 p-6">
      <h3 className="text-lg font-semibold text-neutral-900 mb-4">Bunching Strategy Analysis</h3>

      <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-6">
        <p className="font-medium text-indigo-900 mb-2">🎯 Recommendation</p>
        <p className="text-lg font-bold text-indigo-900">
          {recommended === 'bunch' ? '📅 Bunching Strategy' : '📊 Spread Strategy'}
        </p>
        <p className="text-sm text-indigo-700 mt-2">
          Save an additional {formatCurrency(results.savings_difference)} with {recommended === 'bunch' ? 'bunching' : 'spreading'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className={`p-4 rounded-lg border-2 ${recommended === 'spread' ? 'border-indigo-500 bg-indigo-50' : 'border-neutral-200 bg-neutral-50'}`}>
          <p className="font-semibold text-neutral-900 mb-3">📊 Spread Strategy</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-600">Annual Deduction:</span>
              <span className="font-medium">{formatCurrency(results.spread_strategy.annual_deduction)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600">Total Over Years:</span>
              <span className="font-medium">{formatCurrency(results.spread_strategy.total_deduction_over_years)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600">Tax Savings:</span>
              <span className="font-bold text-green-600">{formatCurrency(results.spread_strategy.tax_savings)}</span>
            </div>
          </div>
        </div>

        <div className={`p-4 rounded-lg border-2 ${recommended === 'bunch' ? 'border-indigo-500 bg-indigo-50' : 'border-neutral-200 bg-neutral-50'}`}>
          <p className="font-semibold text-neutral-900 mb-3">📅 Bunching Strategy</p>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-neutral-600">Bunch Year:</span>
              <span className="font-medium">{formatCurrency(results.bunching_strategy.bunch_year_deduction)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600">Total Over Years:</span>
              <span className="font-medium">{formatCurrency(results.bunching_strategy.total_deduction_over_years)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-600">Tax Savings:</span>
              <span className="font-bold text-green-600">{formatCurrency(results.bunching_strategy.tax_savings)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
