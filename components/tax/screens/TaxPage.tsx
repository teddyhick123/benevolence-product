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
    const controller = new AbortController();

    async function fetchProfile() {
      try {
        const [meRes, orgRes] = await Promise.all([
          fetch('/api/me', { signal: controller.signal }),
          fetch('/api/org', { signal: controller.signal }),
        ]);
        if (meRes.ok) {
          const json = await meRes.json();
          setPortfolioId(json.portfolio_id || json.recommended_portfolio_id);
        }
        if (orgRes.ok) {
          const json = await orgRes.json();
          const activeOrg = pickActiveOrg((json.organizations ?? []) as Array<{ id: string; modules?: Record<string, boolean> }>);
          setModuleEnabled(activeOrg ? !!activeOrg.modules?.tax : true);
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.error('Error fetching profile:', err);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    fetchProfile();
    return () => controller.abort();
  }, []);

  // Fetch tax overview when portfolio/year changes
  useEffect(() => {
    if (!portfolioId) return;
    const controller = new AbortController();

    async function fetchTaxOverview() {
      try {
        const res = await fetch(`/api/portfolio/${portfolioId}/tax/overview?year=${selectedYear}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const json = await res.json();
          if (controller.signal.aborted) return;
          setTaxOverview(json.data);

          // Set AGI limits if available
          if (json.data?.agiLimits) {
            setAgiLimits(json.data.agiLimits);
          }
        }
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn('Tax overview unavailable:', err);
      }
    }

    fetchTaxOverview();
    return () => controller.abort();
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
          <div className="mb-4 h-8 w-1/4 rounded-2xl bg-neutral-200"></div>
          <div className="mb-8 h-4 w-1/2 rounded-2xl bg-neutral-200"></div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2].map((i) => (
              <div key={i} className="h-64 rounded-2xl bg-neutral-200"></div>
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
          <h2 className="mb-2 font-serif text-xl font-medium text-ink">Tax Optimization not enabled</h2>
          <p className="text-sm text-neutral-600">The Tax Optimization module is not enabled for your organization. Contact your administrator to enable it.</p>
        </div>
      </div>
    );
  }

  if (!portfolioId) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="rounded-2xl border border-sunset/30 bg-sunset/10 p-6">
          <h3 className="mb-2 font-serif text-lg font-medium text-ink">
            No Portfolio Found
          </h3>
          <p className="text-sm text-neutral-700">
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
        <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-serif text-3xl font-medium text-ink">Tax Center</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Track charitable contributions and simplify tax preparation
            </p>
          </div>

          {/* Year Selector */}
          <div className="flex items-center gap-3">
            <label htmlFor="tax-year" className="text-sm font-medium text-neutral-700">
              Tax Year:
            </label>
            <select
              id="tax-year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
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
        <div className="rounded-2xl border border-azure/20 bg-azure/10 p-4 text-sm text-azure-deep">
          <span className="font-medium">Note:</span> {TAX_DISCLAIMER_SHORT}
        </div>

        {/* OBBB 2026 universal deduction notice */}
        {selectedYear >= 2026 && (
          <div className="mt-3 rounded-2xl border border-coral/25 bg-coral/10 p-4 text-sm text-ink">
            <span className="font-medium">New for {selectedYear} (OBBB Act):</span> Non-itemizers may deduct up to <span className="font-semibold">$1,000 single / $2,000 married filing jointly</span> in charitable contributions above the 0.5% AGI floor — even when taking the standard deduction. Does not apply to DAFs or private foundations. Consult your CPA to confirm eligibility.
          </div>
        )}

        {/* Year-end giving deadline */}
        {selectedYear === currentYear && (() => {
          const dec31 = new Date(currentYear, 11, 31);
          const daysLeft = Math.ceil((dec31.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
          if (daysLeft <= 0) return null;
          const urgent = daysLeft <= 30;
          return (
            <div className={`mt-3 flex items-center gap-3 rounded-2xl border p-4 text-sm ${urgent ? 'border-coral/30 bg-coral/10 text-ink' : 'border-azure/20 bg-azure/10 text-azure-deep'}`}>
              <span className={`rounded-full px-2 py-1 text-xs font-semibold ${urgent ? 'bg-coral text-white' : 'bg-azure text-white'}`}>Dec 31</span>
              <span>
                <span className="font-medium">{daysLeft} {daysLeft === 1 ? 'day' : 'days'} left</span> to make tax-deductible contributions before December 31, {currentYear}.
              </span>
            </div>
          );
        })()}
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
              className="w-full rounded-2xl bg-azure px-6 py-3 font-medium text-white shadow-soft transition-all hover:-translate-y-0.5 hover:shadow md:w-auto will-change-transform rm:transition-none rm:transform-none"
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
            <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-soft">
              <h2 className="mb-4 font-serif text-xl font-medium text-ink">Carryforwards</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="mb-1 text-sm text-neutral-600">Total Available</div>
                  <div className="text-2xl font-semibold text-ink">
                    ${taxOverview.carryforwardSummary.totalAvailable.toLocaleString()}
                  </div>
                </div>
                {taxOverview.carryforwardSummary.expiringSoon.length > 0 && (
                  <div>
                    <div className="mb-1 text-sm text-neutral-600">Expiring Soon</div>
                    <div className="text-2xl font-semibold text-coral">
                      {taxOverview.carryforwardSummary.expiringSoon.length}
                    </div>
                    <div className="mt-1 text-xs text-neutral-500">
                      Within 2 years
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-soft">
              <h2 className="mb-2 font-serif text-xl font-medium text-ink">Carryforwards</h2>
              <p className="text-sm text-neutral-600">
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
                className={`rounded-2xl border p-4 ${
                  alert.severity === 'critical'
                    ? 'bg-red-50 border-red-200'
                    : alert.severity === 'warning'
                    ? 'bg-sunset/10 border-sunset/30'
                    : 'bg-azure/10 border-azure/20'
                }`}
              >
                <h3
                  className={`font-semibold mb-2 ${
                    alert.severity === 'critical'
                      ? 'text-red-900'
                      : alert.severity === 'warning'
                      ? 'text-ink'
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
                      ? 'text-neutral-700'
                      : 'text-azure-deep'
                  }`}
                >
                  {alert.message}
                </p>
                <p
                  className={`text-xs ${
                    alert.severity === 'critical'
                      ? 'text-red-700'
                      : alert.severity === 'warning'
                      ? 'text-neutral-600'
                      : 'text-azure-deep/90'
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
            <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-soft">
              <div className="mb-2 text-sm text-neutral-600">Total Contributions</div>
              <div className="text-3xl font-semibold text-ink">
                ${taxOverview.summary.totalContributions.toLocaleString()}
              </div>
              <div className="mt-2 text-xs text-neutral-500">
                {taxOverview.summary.contributionCount}{' '}
                {taxOverview.summary.contributionCount === 1 ? 'contribution' : 'contributions'}
              </div>
            </div>

            <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-soft">
              <div className="mb-2 text-sm text-neutral-600">Deductible Amount</div>
              <div className="text-3xl font-semibold text-ink">
                ${taxOverview.summary.totalDeductible.toLocaleString()}
              </div>
              {taxOverview.summary.totalDeductible < taxOverview.summary.totalContributions && (
                <div className="mt-2 text-xs text-coral">
                  ${(taxOverview.summary.totalContributions - taxOverview.summary.totalDeductible).toLocaleString()}{' '}
                  carryforward
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-black/5 bg-white p-6 shadow-soft">
              <div className="mb-2 text-sm text-neutral-600">Compliance Score</div>
              {taxOverview.summary.complianceScore !== null ? (
                <>
                  <div className="text-3xl font-semibold text-ink">
                    {taxOverview.summary.complianceScore.toFixed(0)}%
                  </div>
                  <div
                    className={`text-xs mt-2 ${
                      taxOverview.summary.complianceScore >= 80
                        ? 'text-azure-deep'
                        : taxOverview.summary.complianceScore >= 50
                        ? 'text-sunset'
                        : 'text-red-600'
                    }`}
                  >
                    {taxOverview.summary.missingDocumentation > 0 &&
                      `${taxOverview.summary.missingDocumentation} missing docs`}
                  </div>
                </>
              ) : (
                <div className="text-lg text-neutral-500">No data</div>
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
    <Suspense fallback={<div className="flex items-center justify-center min-h-[400px] text-sm text-neutral-400">Loading…</div>}>
      <TaxDashboard />
    </Suspense>
  );
}
