'use client';

import { apiRequest, readJson } from "@/lib/api/client";

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
import { Button, Card, EmptyState, FormField, PageHeader, Select } from '@/components/ui';

// Feature flag for unified Tax Strategy Center
const USE_UNIFIED_TAX_TOOLS = true;
import { pickActiveOrg } from '@/lib/organizations/active-org';
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
          apiRequest('/api/me', { signal: controller.signal }),
          apiRequest('/api/org', { signal: controller.signal }),
        ]);
        if (meRes.ok) {
          const json = await readJson(meRes);
          setPortfolioId(json.portfolio_id || json.recommended_portfolio_id);
        }
        if (orgRes.ok) {
          const json = await readJson(orgRes);
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
        const res = await apiRequest(`/api/portfolio/${portfolioId}/tax/overview?year=${selectedYear}`, {
          signal: controller.signal,
        });
        if (res.ok) {
          const json = await readJson(res);
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
          <div className="mb-4 h-9 w-40 rounded-xl bg-neutral-200"></div>
          <div className="mb-8 h-5 w-full max-w-md rounded-xl bg-neutral-200"></div>
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
      <div className="mx-auto flex min-h-[60vh] max-w-7xl items-center justify-center px-4 py-8 sm:px-6 lg:px-8">
        <EmptyState
          title="Tax Optimization is not enabled"
          description="The Tax Optimization module is not enabled for your organization. Contact your administrator to enable it."
          className="w-full max-w-lg"
        />
      </div>
    );
  }

  if (!portfolioId) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <Card className="border-sunset/30 bg-sunset/10" padding="lg">
          <h2 className="font-serif text-xl text-ink">No portfolio found</h2>
          <p className="mt-2 text-sm leading-6 text-ink/70">
            Create a portfolio before accessing tax features.
          </p>
        </Card>
      </div>
    );
  }

  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - i);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <PageHeader
        eyebrow="Portfolio tax planning"
        title="Tax Center"
        description="Track charitable contributions, understand deduction headroom, and prepare for tax time."
        actions={
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
            <FormField label="Tax year" htmlFor="tax-year" className="w-full sm:w-28">
              <Select
                id="tax-year"
                value={selectedYear}
                onChange={(event) => setSelectedYear(Number(event.target.value))}
              >
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </Select>
            </FormField>
            <Button onClick={() => setShowWizard(true)} className="w-full sm:w-auto">
              <PlusIcon />
              Add contribution
            </Button>
          </div>
        }
      />

      <section className="mt-5 space-y-3" aria-label="Tax notices">
        <div className="rounded-2xl border border-azure/20 bg-azure/10 px-4 py-3 text-sm leading-6 text-azure-deep">
          <span className="font-medium">Note:</span> {TAX_DISCLAIMER_SHORT}
        </div>

        {selectedYear >= 2026 && (
          <div className="rounded-2xl border border-coral/25 bg-coral/10 px-4 py-3 text-sm leading-6 text-ink">
            <span className="font-medium">New for {selectedYear} (OBBB Act):</span> Non-itemizers may deduct up to <span className="font-semibold">$1,000 single / $2,000 married filing jointly</span> in charitable contributions above the 0.5% AGI floor — even when taking the standard deduction. Does not apply to DAFs or private foundations. Consult your CPA to confirm eligibility.
          </div>
        )}

        {selectedYear === currentYear && (() => {
          const dec31 = new Date(currentYear, 11, 31);
          const daysLeft = Math.ceil((dec31.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
          if (daysLeft <= 0) return null;
          const urgent = daysLeft <= 30;
          return (
            <div className={`flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-6 ${urgent ? 'border-coral/30 bg-coral/10 text-ink' : 'border-azure/20 bg-azure/10 text-azure-deep'}`}>
              <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${urgent ? 'bg-coral text-white' : 'bg-azure text-white'}`}>Dec 31</span>
              <span>
                <span className="font-medium">{daysLeft} {daysLeft === 1 ? 'day' : 'days'} left</span> to make tax-deductible contributions before December 31, {currentYear}.
              </span>
            </div>
          );
        })()}
      </section>

      {/* Main Content */}
      <div className="mt-6 space-y-6 sm:mt-8 sm:space-y-8">
        {/* Tax Profile Section */}
        <TaxProfileSetup
          portfolioId={portfolioId}
          taxYear={selectedYear}
          onSave={handleProfileSave}
        />

        {/* Quick Stats */}
        {taxOverview?.summary && (
          <section aria-label={`${selectedYear} tax summary`} className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-6">
            <Card>
              <div className="text-sm text-ink/60">Total contributions</div>
              <div className="mt-2 font-serif text-3xl text-ink">
                ${taxOverview.summary.totalContributions.toLocaleString()}
              </div>
              <div className="mt-2 text-xs text-ink/50">
                {taxOverview.summary.contributionCount}{' '}
                {taxOverview.summary.contributionCount === 1 ? 'contribution' : 'contributions'}
              </div>
            </Card>

            <Card>
              <div className="text-sm text-ink/60">Deductible amount</div>
              <div className="mt-2 font-serif text-3xl text-ink">
                ${taxOverview.summary.totalDeductible.toLocaleString()}
              </div>
              {taxOverview.summary.totalDeductible < taxOverview.summary.totalContributions && (
                <div className="mt-2 text-xs font-medium text-coral">
                  ${(taxOverview.summary.totalContributions - taxOverview.summary.totalDeductible).toLocaleString()}{' '}
                  carryforward
                </div>
              )}
            </Card>

            <Card>
              <div className="text-sm text-ink/60">Documentation score</div>
              {taxOverview.summary.complianceScore !== null ? (
                <>
                  <div className="mt-2 font-serif text-3xl text-ink">
                    {taxOverview.summary.complianceScore.toFixed(0)}%
                  </div>
                  <div
                    className={`mt-2 text-xs font-medium ${
                      taxOverview.summary.complianceScore >= 80
                        ? 'text-azure-deep'
                        : taxOverview.summary.complianceScore >= 50
                          ? 'text-sunset'
                          : 'text-red-600'
                    }`}
                  >
                    {taxOverview.summary.missingDocumentation > 0
                      ? `${taxOverview.summary.missingDocumentation} missing docs`
                      : 'Documentation is complete'}
                  </div>
                </>
              ) : (
                <div className="mt-2 text-lg text-ink/50">No data</div>
              )}
            </Card>
          </section>
        )}

        {/* AGI Limits Visualization — shown early so users understand deduction headroom before entering contributions */}
        {agiLimits && <AGILimitVisualizer limits={agiLimits} />}

        {/* Holdings Importer */}
        <HoldingsImporter
          portfolioId={portfolioId}
          taxYear={selectedYear}
          onImport={() => setRefreshKey((k) => k + 1)}
        />

        {/* Contribution Wizard Modal */}
        {showWizard && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-label="Add tax contribution">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto">
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
            <Card>
              <h2 className="font-serif text-xl text-ink">Carryforwards</h2>
              <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <div className="mb-1 text-sm text-ink/60">Total available</div>
                  <div className="font-serif text-2xl text-ink">
                    ${taxOverview.carryforwardSummary.totalAvailable.toLocaleString()}
                  </div>
                </div>
                {taxOverview.carryforwardSummary.expiringSoon.length > 0 && (
                  <div>
                    <div className="mb-1 text-sm text-ink/60">Expiring soon</div>
                    <div className="font-serif text-2xl text-coral">
                      {taxOverview.carryforwardSummary.expiringSoon.length}
                    </div>
                    <div className="mt-1 text-xs text-ink/50">
                      Within 2 years
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <Card>
              <h2 className="font-serif text-xl text-ink">Carryforwards</h2>
              <p className="mt-2 text-sm leading-6 text-ink/60">
                No carryforward deductions yet. When your charitable contributions exceed your AGI
                limits in a given year, the unused deduction carries forward for up to 5 years — and
                will appear here automatically.
              </p>
            </Card>
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

      </div>
    </div>
  );
}

function PlusIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  );
}

export default function TaxPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-[400px] text-sm text-neutral-400">Loading…</div>}>
      <TaxDashboard />
    </Suspense>
  );
}
