'use client';

import { useState, useEffect } from 'react';

const FILING_TYPE_LABELS: Record<string, string> = {
  form_990pf: 'Form 990-PF',
  form_990: 'Form 990',
  form_990ez: 'Form 990-EZ',
  state_registration: 'State Registration',
  state_filing: 'State Filing',
  form_8283: 'Form 8283',
  other: 'Other',
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  filed: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  n_a: 'bg-gray-100 text-gray-500',
  extension_filed: 'bg-blue-100 text-blue-800',
};

const currentYear = new Date().getFullYear();

export default function CompliancePage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [portfolioId, setPortfolioId] = useState<string | null>(null);

  // Filing calendar
  const [filings, setFilings] = useState<any[]>([]);
  const [filingsLoading, setFilingsLoading] = useState(true);
  const [markingFiled, setMarkingFiled] = useState<string | null>(null);

  // 990-PF export
  const [exportYear, setExportYear] = useState(currentYear - 1);
  const [exportLoading, setExportLoading] = useState(false);
  const [exportData, setExportData] = useState<any>(null);

  // Payout calculator
  const [payoutYear, setPayoutYear] = useState(currentYear - 1);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [payoutData, setPayoutData] = useState<any>(null);

  // Load org + portfolio
  useEffect(() => {
    async function fetchContext() {
      const [orgRes, meRes] = await Promise.all([
        fetch('/api/org'),
        fetch('/api/me'),
      ]);
      if (orgRes.ok) {
        const d = await orgRes.json();
        setOrgId(d.organizations?.[0]?.id || null);
      }
      if (meRes.ok) {
        const d = await meRes.json();
        setPortfolioId(d.portfolio_id || d.recommended_portfolio_id || null);
      }
    }
    fetchContext();
  }, []);

  // Load filing calendar
  useEffect(() => {
    if (!orgId) return;
    async function fetchFilings() {
      setFilingsLoading(true);
      try {
        const res = await fetch(`/api/org/${orgId}/compliance/filing-calendar?days=365`);
        if (res.ok) {
          const d = await res.json();
          setFilings(d.data || []);
        }
      } finally {
        setFilingsLoading(false);
      }
    }
    fetchFilings();
  }, [orgId]);

  // Load payout data on year change
  useEffect(() => {
    if (!portfolioId) return;
    async function fetchPayout() {
      setPayoutLoading(true);
      setPayoutData(null);
      try {
        const res = await fetch(`/api/portfolio/${portfolioId}/compliance/payout?year=${payoutYear}`);
        if (res.ok) setPayoutData(await res.json());
      } finally {
        setPayoutLoading(false);
      }
    }
    fetchPayout();
  }, [portfolioId, payoutYear]);

  async function handleMarkFiled(filingId: string) {
    if (!orgId) return;
    setMarkingFiled(filingId);
    try {
      const res = await fetch(`/api/org/${orgId}/compliance/filing-calendar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: filingId, status: 'filed', filed_date: new Date().toISOString().split('T')[0] }),
      });
      if (res.ok) {
        const d = await res.json();
        setFilings(prev => prev.map(f => f.id === filingId ? d.data : f));
      }
    } finally {
      setMarkingFiled(null);
    }
  }

  async function handle990Export() {
    if (!portfolioId) return;
    setExportLoading(true);
    setExportData(null);
    try {
      const res = await fetch(`/api/portfolio/${portfolioId}/compliance/990pf-export?year=${exportYear}`);
      if (res.ok) setExportData(await res.json());
    } finally {
      setExportLoading(false);
    }
  }

  const yearOptions = Array.from({ length: 6 }, (_, i) => currentYear - 1 - i);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Page header */}
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Compliance</h1>
          <p className="text-sm text-gray-500 mt-1">Filing calendar, 990-PF export, and payout analysis</p>
        </div>

        {/* ─── Section 1: Filing Calendar ─── */}
        <section className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="font-semibold text-gray-900">Filing Calendar</h2>
            <p className="text-xs text-gray-500 mt-0.5">Upcoming filings in the next 12 months</p>
          </div>
          {filingsLoading ? (
            <div className="p-8 text-center text-gray-400">Loading filings…</div>
          ) : filings.length === 0 ? (
            <div className="p-8 text-center text-gray-400 text-sm">No upcoming filings found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Filing</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Tax Year</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Due Date</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Jurisdiction</th>
                  <th className="text-left px-6 py-3 font-medium text-gray-600">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filings.map(filing => (
                  <tr key={filing.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-medium text-gray-900">
                      {FILING_TYPE_LABELS[filing.filing_type] || filing.filing_type}
                      {filing.description && (
                        <div className="text-xs text-gray-500 font-normal">{filing.description}</div>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-600">{filing.tax_year}</td>
                    <td className="px-6 py-3 text-gray-700">
                      {new Date(filing.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-6 py-3 text-gray-600 uppercase text-xs">{filing.filing_jurisdiction || 'Federal'}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[filing.status] || STATUS_STYLES.pending}`}>
                        {filing.status === 'n_a' ? 'N/A' : filing.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      {filing.status === 'pending' || filing.status === 'overdue' ? (
                        <button
                          onClick={() => handleMarkFiled(filing.id)}
                          disabled={markingFiled === filing.id}
                          className="text-xs px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 transition-colors"
                        >
                          {markingFiled === filing.id ? 'Saving…' : 'Mark as Filed'}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {/* ─── Section 2 & 3: Side-by-side cards ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* 990-PF Export Card */}
          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-1">990-PF Export</h2>
            <p className="text-xs text-gray-500 mb-4">Export structured 990-PF data including qualifying distributions</p>

            <div className="flex gap-3 mb-4">
              <select
                value={exportYear}
                onChange={e => setExportYear(parseInt(e.target.value))}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button
                onClick={handle990Export}
                disabled={exportLoading || !portfolioId}
                className="px-4 py-2 bg-indigo-600 text-white text-sm rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {exportLoading ? 'Loading…' : 'Load Data'}
              </button>
            </div>

            {exportData && (
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-md p-4 text-sm space-y-2">
                  <div className="font-medium text-gray-700 mb-2">Revenue Summary (Part I)</div>
                  <Row label="Net Investment Income" value={`$${Number(exportData.part_i?.net_investment_income || 0).toLocaleString()}`} />
                  <Row label="Excise Tax Rate" value={`${exportData.part_i?.excise_tax_rate || 1.39}%`} />
                  <Row label="Total Grants" value={`$${Number(exportData.part_i?.total_grants || 0).toLocaleString()}`} />
                </div>
                <div className="bg-gray-50 rounded-md p-4 text-sm space-y-2">
                  <div className="font-medium text-gray-700 mb-2">Qualifying Distributions (Part XII)</div>
                  <Row label="Grants Count" value={exportData.part_xii?.grants_count || 0} />
                  <Row label="Grants Total" value={`$${Number(exportData.part_xii?.grants_total || 0).toLocaleString()}`} />
                  <Row label="Qualifying Distributions Total" value={`$${Number(exportData.part_xii?.qualifying_distributions_total || 0).toLocaleString()}`} />
                </div>
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `990pf-${exportYear}.json`;
                    a.click();
                  }}
                  className="w-full text-sm py-2 border border-indigo-300 text-indigo-600 rounded-md hover:bg-indigo-50 transition-colors"
                >
                  Download JSON
                </button>
              </div>
            )}
          </section>

          {/* Payout Calculator Card */}
          <section className="bg-white rounded-lg border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-1">Payout Calculator</h2>
            <p className="text-xs text-gray-500 mb-4">5% minimum distribution requirement analysis</p>

            <div className="flex gap-3 mb-4">
              <select
                value={payoutYear}
                onChange={e => setPayoutYear(parseInt(e.target.value))}
                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {payoutLoading ? (
              <div className="text-center text-gray-400 py-8 text-sm">Loading payout data…</div>
            ) : payoutData ? (
              <div className="space-y-3">
                <div className="bg-gray-50 rounded-md p-4 text-sm space-y-2">
                  <Row label="Net Assets (FMV)" value={payoutData.net_assets ? `$${Number(payoutData.net_assets).toLocaleString()}` : '—'} />
                  <Row label="Required Payout (5%)" value={payoutData.required_payout ? `$${Number(payoutData.required_payout).toLocaleString()}` : '—'} />
                  <Row label="Actual Distributions" value={`$${Number(payoutData.actual_distributions || 0).toLocaleString()}`} />
                </div>
                <div className={`rounded-md p-4 text-sm space-y-2 ${payoutData.surplus_or_deficit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                  <Row
                    label="Surplus / (Deficit)"
                    value={payoutData.surplus_or_deficit !== null
                      ? `${payoutData.surplus_or_deficit >= 0 ? '+' : ''}$${Number(payoutData.surplus_or_deficit).toLocaleString()}`
                      : '—'}
                    highlight={payoutData.surplus_or_deficit !== null
                      ? (payoutData.surplus_or_deficit >= 0 ? 'green' : 'red')
                      : undefined}
                  />
                  <Row
                    label="% of Requirement Met"
                    value={payoutData.pct_distributed !== null ? `${payoutData.pct_distributed}%` : '—'}
                  />
                </div>
                {payoutData.has_self_dealing && (
                  <div className="bg-red-50 border border-red-200 rounded-md p-3 text-xs text-red-700">
                    <strong>Self-Dealing Flag:</strong> {payoutData.self_dealing_notes || 'Self-dealing activity recorded for this year.'}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-gray-400 py-8 text-sm">Select a year to view payout analysis.</div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: any; highlight?: 'green' | 'red' }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span className={`font-medium ${highlight === 'green' ? 'text-green-700' : highlight === 'red' ? 'text-red-700' : 'text-gray-900'}`}>
        {value}
      </span>
    </div>
  );
}
