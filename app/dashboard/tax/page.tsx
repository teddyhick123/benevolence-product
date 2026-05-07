'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { TAX_DISCLAIMER_SHORT } from '@/lib/tax/constants';
import TaxProfileSetup from '@/components/tax/TaxProfileSetup';
import ContributionTaxWizard from '@/components/tax/ContributionTaxWizard';
import AGILimitVisualizer from '@/components/tax/AGILimitVisualizer';
import ContributionsList from '@/components/tax/ContributionsList';
import HoldingsImporter from '@/components/tax/HoldingsImporter';
import TaxExportPanel from '@/components/tax/TaxExportPanel';
import TaxScenarioModeler from '@/components/tax/TaxScenarioModeler';
import TaxOptimizationEngine from '@/components/tax/TaxOptimizationEngine';
import TaxStrategyCenter from '@/components/tax/TaxStrategyCenter';
import CPACollaborationPortal from '@/components/tax/CPACollaborationPortal';

// Feature flag for unified Tax Strategy Center
const USE_UNIFIED_TAX_TOOLS = true;
import { calculateAGILimits } from '@/lib/tax/agi-calculator';
import { pickActiveOrg } from '@/lib/org-cookie';
import type { AGILimits } from '@/lib/tax/agi-calculator';

function TaxDashboard() {
  const searchParams = useSearchParams();
  const currentYear = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(
    Number(searchParams.get('year')) || currentYear
  );
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [moduleEnabled, setModuleEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  // Tax overview data
  const [taxOverview, setTaxOverview] = useState<any>(null);
  const [agiLimits, setAgiLimits] = useState<AGILimits | null>(null);

  // Fetch user's portfolio ID and check module access
  useEffect(() => {
    async function fetchProfile() {
      try {
        const [meRes, orgRes] = await Promise.all([
          fetch('/api/me'),
          fetch('/api/org'),
        ]);
        if (meRes.ok) {
          const json = await meRes.json();
          setPortfolioId(json.portfolio_id || json.recommended_portfolio_id);
        }
        if (orgRes.ok) {
          const json = await orgRes.json();
          const activeOrg = pickActiveOrg(json.organizations ?? []);
          setModuleEnabled(activeOrg ? !!activeOrg.modules?.tax : true);
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, []);

  // Fetch tax overview when portfolio/year changes
  useEffect(() => {
    if (!portfolioId) return;

    async function fetchTaxOverview() {
      try {
        const res = await fetch(`/api/portfolio/${portfolioId}/tax/overview?year=${selectedYear}`);
        if (res.ok) {
          const json = await res.json();
          setTaxOverview(json.data);

          // Set AGI limits if available
          if (json.data?.agiLimits) {
            setAgiLimits(json.data.agiLimits);
          }
        }
      } catch (err) {
        console.error('Error fetching tax overview:', err);
      }
    }

    fetchTaxOverview();
  }, [portfolioId, selectedYear, refreshKey]);

  function handleWizardSuccess() {
    setShowWizard(false);
    setRefreshKey((k) => k + 1); // Trigger refresh
  }

  function handleProfileSave() {
    setRefreshKey((k) => k + 1); // Trigger refresh
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2 mb-8"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2].map((i) => (
              <div key={i} className="h-64 bg-gray-200 rounded-lg"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (moduleEnabled === false) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 flex items-center justify-center min-h-[60vh]">
        <div className="text-center max-w-sm">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Tax Optimization not enabled</h2>
          <p className="text-sm text-gray-500">The Tax Optimization module is not enabled for your organization. Contact your administrator to enable it.</p>
        </div>
      </div>
    );
  }

  if (!portfolioId) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-yellow-900 mb-2">
            No Portfolio Found
          </h3>
          <p className="text-sm text-yellow-700">
            You need to create a portfolio before accessing tax features.
          </p>
        </div>
      </div>
    );
  }

  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Tax Center</h1>
            <p className="text-sm text-gray-600 mt-1">
              Track charitable contributions and simplify tax preparation
            </p>
          </div>

          {/* Year Selector */}
          <div className="flex items-center gap-3">
            <label htmlFor="tax-year" className="text-sm font-medium text-gray-700">
              Tax Year:
            </label>
            <select
              id="tax-year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-azure focus:border-azure"
            >
              {yearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="bg-azure/10 border border-azure/20 rounded-lg p-4 text-sm text-azure">
          <span className="font-medium">Note:</span> {TAX_DISCLAIMER_SHORT}
        </div>
      </div>

      {/* Main Content */}
      <div className="space-y-8">
        {/* Tax Profile Section */}
        <TaxProfileSetup
          portfolioId={portfolioId}
          taxYear={selectedYear}
          onSave={handleProfileSave}
        />

        {/* AGI Limits Visualization — shown early so users understand deduction headroom before entering contributions */}
        {agiLimits && <AGILimitVisualizer limits={agiLimits} />}

        {/* Holdings Importer */}
        <HoldingsImporter
          portfolioId={portfolioId}
          taxYear={selectedYear}
          onImport={() => setRefreshKey((k) => k + 1)}
        />

        {/* Add Contribution Button */}
        {!showWizard && (
          <div>
            <button
              onClick={() => setShowWizard(true)}
              className="w-full md:w-auto px-6 py-3 bg-azure text-white rounded-lg hover:opacity-90 font-medium shadow-sm hover:shadow transition-all"
            >
              + Add Contribution Manually
            </button>
          </div>
        )}

        {/* Contribution Wizard Modal */}
        {showWizard && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <ContributionTaxWizard
                portfolioId={portfolioId}
                taxYear={selectedYear}
                onSuccess={handleWizardSuccess}
                onCancel={() => setShowWizard(false)}
              />
            </div>
          </div>
        )}

        {/* Contributions List */}
        <ContributionsList
          portfolioId={portfolioId}
          taxYear={selectedYear}
          onRefresh={refreshKey}
        />

        {/* Export Panel */}
        <TaxExportPanel
          portfolioId={portfolioId}
          taxYear={selectedYear}
        />

        {/* Phase 2: Advanced Tax Features */}

        {USE_UNIFIED_TAX_TOOLS ? (
          /* Unified Tax Strategy Center (NEW) */
          <TaxStrategyCenter
            portfolioId={portfolioId}
            year={selectedYear}
          />
        ) : (
          /* Legacy separate tools */
          <>
            {/* AI-Powered Optimization Engine */}
            <TaxOptimizationEngine
              portfolioId={portfolioId}
              year={selectedYear}
            />

            {/* Tax Scenario Modeler */}
            <TaxScenarioModeler
              portfolioId={portfolioId}
              year={selectedYear}
            />
          </>
        )}

        {/* CPA Collaboration Portal */}
        {portfolioId && (
          <CPACollaborationPortal
            portfolioId={portfolioId}
          />
        )}

        {/* Carryforward Summary */}
        {taxOverview !== null && (
          taxOverview?.carryforwardSummary && taxOverview.carryforwardSummary.totalAvailable > 0 ? (
            <div className="border border-gray-200 rounded-lg p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Carryforwards</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="text-sm text-gray-600 mb-1">Total Available</div>
                  <div className="text-2xl font-bold text-gray-900">
                    ${taxOverview.carryforwardSummary.totalAvailable.toLocaleString()}
                  </div>
                </div>
                {taxOverview.carryforwardSummary.expiringSoon.length > 0 && (
                  <div>
                    <div className="text-sm text-gray-600 mb-1">Expiring Soon</div>
                    <div className="text-2xl font-bold text-red-600">
                      {taxOverview.carryforwardSummary.expiringSoon.length}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Within 2 years
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg p-6 bg-gray-50">
              <h2 className="text-xl font-bold text-gray-900 mb-2">Carryforwards</h2>
              <p className="text-sm text-gray-600">
                No carryforward deductions yet. When your charitable contributions exceed your AGI
                limits in a given year, the unused deduction carries forward for up to 5 years — and
                will appear here automatically.
              </p>
            </div>
          )
        )}

        {/* Alerts */}
        {taxOverview?.carryforwardAlerts && taxOverview.carryforwardAlerts.length > 0 && (
          <div className="space-y-3">
            {taxOverview.carryforwardAlerts.map((alert: any, idx: number) => (
              <div
                key={idx}
                className={`border rounded-lg p-4 ${
                  alert.severity === 'critical'
                    ? 'bg-red-50 border-red-200'
                    : alert.severity === 'warning'
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-azure/10 border-azure/20'
                }`}
              >
                <h3
                  className={`font-semibold mb-2 ${
                    alert.severity === 'critical'
                      ? 'text-red-900'
                      : alert.severity === 'warning'
                      ? 'text-yellow-900'
                      : 'text-ink'
                  }`}
                >
                  {alert.title}
                </h3>
                <p
                  className={`text-sm mb-2 ${
                    alert.severity === 'critical'
                      ? 'text-red-800'
                      : alert.severity === 'warning'
                      ? 'text-yellow-800'
                      : 'text-azure'
                  }`}
                >
                  {alert.message}
                </p>
                <p
                  className={`text-xs ${
                    alert.severity === 'critical'
                      ? 'text-red-700'
                      : alert.severity === 'warning'
                      ? 'text-yellow-700'
                      : 'text-azure/90'
                  }`}
                >
                  <strong>Action:</strong> {alert.actionRequired}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Quick Stats */}
        {taxOverview?.summary && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="border border-gray-200 rounded-lg p-6">
              <div className="text-sm text-gray-600 mb-2">Total Contributions</div>
              <div className="text-3xl font-bold text-gray-900">
                ${taxOverview.summary.totalContributions.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 mt-2">
                {taxOverview.summary.contributionCount}{' '}
                {taxOverview.summary.contributionCount === 1 ? 'contribution' : 'contributions'}
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-6">
              <div className="text-sm text-gray-600 mb-2">Deductible Amount</div>
              <div className="text-3xl font-bold text-gray-900">
                ${taxOverview.summary.totalDeductible.toLocaleString()}
              </div>
              {taxOverview.summary.totalDeductible < taxOverview.summary.totalContributions && (
                <div className="text-xs text-amber-600 mt-2">
                  ${(taxOverview.summary.totalContributions - taxOverview.summary.totalDeductible).toLocaleString()}{' '}
                  carryforward
                </div>
              )}
            </div>

            <div className="border border-gray-200 rounded-lg p-6">
              <div className="text-sm text-gray-600 mb-2">Compliance Score</div>
              {taxOverview.summary.complianceScore !== null ? (
                <>
                  <div className="text-3xl font-bold text-gray-900">
                    {taxOverview.summary.complianceScore.toFixed(0)}%
                  </div>
                  <div
                    className={`text-xs mt-2 ${
                      taxOverview.summary.complianceScore >= 80
                        ? 'text-green-600'
                        : taxOverview.summary.complianceScore >= 50
                        ? 'text-yellow-600'
                        : 'text-red-600'
                    }`}
                  >
                    {taxOverview.summary.missingDocumentation > 0 &&
                      `${taxOverview.summary.missingDocumentation} missing docs`}
                  </div>
                </>
              ) : (
                <div className="text-lg text-gray-500">No data</div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TaxPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <TaxDashboard />
    </Suspense>
  );
}
