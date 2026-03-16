'use client';

import { useState, useEffect } from 'react';
import { useModules } from '@/contexts/ModuleContext';
import ComplianceDashboard from '@/components/compliance/ComplianceDashboard';

export default function CompliancePage() {
  const { isModuleEnabled: hasModule } = useModules();
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchIds() {
      try {
        const res = await fetch('/api/me');
        if (res.ok) {
          const json = await res.json();
          setPortfolioId(json.portfolio_id || json.recommended_portfolio_id || null);
          setOrgId(json.organization_id || null);
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchIds();
  }, []);

  if (!hasModule('compliance_regulatory')) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center">
        <div className="w-16 h-16 bg-azure/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-azure" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">Compliance & Regulatory</h1>
        <p className="text-gray-500 mb-6">
          IRC §4942 payout tracking, self-dealing pre-screening, filing calendar, and 990-PF data assembly. Contact your administrator to enable this module.
        </p>
        <div className="grid grid-cols-1 gap-3 text-left text-sm">
          {[
            'Real-time §4942 payout shortfall forecasting',
            '§4941 self-dealing pre-screening against §4946 registry',
            '§4945 expenditure responsibility tracking',
            'Federal + state filing calendar with reminders',
            '990-PF data export by Part',
            'Multi-state charitable registration tracking',
          ].map(feature => (
            <div key={feature} className="flex items-center gap-2 text-gray-600">
              <svg className="w-4 h-4 text-azure flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              {feature}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 bg-gray-200 rounded" />
          <div className="grid grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-200 rounded-xl" />)}
          </div>
          <div className="h-64 bg-gray-200 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!portfolioId || !orgId) {
    return (
      <div className="p-8 text-center">
        <h1 className="text-xl font-semibold text-gray-900">No portfolio found</h1>
        <p className="text-gray-500 mt-2">Please create a portfolio first.</p>
      </div>
    );
  }

  return (
    <div className="p-6 lg:p-8">
      <ComplianceDashboard orgId={orgId} portfolioId={portfolioId} />
    </div>
  );
}
