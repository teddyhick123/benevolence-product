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
  upcoming:       'bg-yellow-100 text-yellow-800',
  in_progress:    'bg-amber-100  text-amber-800',
  filed:          'bg-green-100  text-green-800',
  extended:       'bg-blue-100   text-blue-800',
  overdue:        'bg-red-100    text-red-800',
  waived:         'bg-gray-100   text-gray-500',
  not_applicable: 'bg-gray-100   text-gray-500',
};

const currentYear = new Date().getFullYear();

export default function CompliancePage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [portfolioId, setPortfolioId] = useState<string | null>(null);
  const [moduleEnabled, setModuleEnabled] = useState<boolean | null>(null);

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

  // State registrations
  const [stateRegs, setStateRegs] = useState<any[]>([]);
  const [stateRegsLoading, setStateRegsLoading] = useState(false);
  const [showAddReg, setShowAddReg] = useState(false);
  const [addingReg, setAddingReg] = useState(false);
  const [newReg, setNewReg] = useState({ state: '', registration_type: 'charitable_solicitation', status: 'active', expiration_date: '', notes: '' });

  // Load org + portfolio
  useEffect(() => {
    async function fetchContext() {
      const [orgRes, meRes] = await Promise.all([
        fetch('/api/org'),
        fetch('/api/me'),
      ]);
      if (orgRes.ok) {
        const d = await orgRes.json();
        const org = d.organizations?.[0];
        setOrgId(org?.id || null);
        setModuleEnabled(!!org?.modules?.compliance);
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

  // Load state registrations when org loads
  useEffect(() => {
    if (!orgId) return;
    setStateRegsLoading(true);
    fetch(`/api/org/${orgId}/compliance/state-registrations`)
      .then(r => r.ok ? r.json() : { data: [] })
      .then(d => setStateRegs(d.data || []))
      .finally(() => setStateRegsLoading(false));
  }, [orgId]);

  async function handleAddReg() {
    if (!orgId || !newReg.state) return;
    setAddingReg(true);
    try {
      const res = await fetch(`/api/org/${orgId}/compliance/state-registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newReg),
      });
      if (res.ok) {
        const d = await res.json();
        setStateRegs(prev => {
          const idx = prev.findIndex(r => r.id === d.data.id);
          return idx >= 0 ? prev.map((r, i) => i === idx ? d.data : r) : [...prev, d.data];
        });
        setShowAddReg(false);
        setNewReg({ state: '', registration_type: 'charitable_solicitation', status: 'active', expiration_date: '', notes: '' });
      }
    } finally {
      setAddingReg(false);
    }
  }

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

  if (moduleEnabled === false) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Compliance not enabled</h2>
          <p className="text-sm text-gray-500">The Compliance module is not enabled for your organization. Contact your administrator to enable it.</p>
        </div>
      </div>
    );
  }

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
                {filings.map(filing => {
                  const daysUntilDue = Math.ceil((new Date(filing.due_date).getTime() - Date.now()) / 86_400_000);
                  const reminderDays: number[] = Array.isArray(filing.reminder_days) ? filing.reminder_days : [];
                  const nearestReminder = reminderDays.filter(d => d >= daysUntilDue).sort((a, b) => a - b)[0];
                  const showReminder = nearestReminder !== undefined && filing.status === 'upcoming';
                  return (
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
                      {showReminder && (
                        <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zm0 16a2 2 0 002-2H8a2 2 0 002 2z"/></svg>
                          {daysUntilDue <= 0 ? 'Past due' : `Reminder: ${daysUntilDue}d left`}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-600 uppercase text-xs">{filing.jurisdiction || 'Federal'}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[filing.status] || 'bg-gray-100 text-gray-500'}`}>
                        {filing.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      {filing.status === 'upcoming' || filing.status === 'overdue' ? (
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
                  );
                })}
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
                  <Row
                    label={payoutData.avg_fmv_used ? 'Avg. FMV of Assets (Part XIII)' : 'Year-End FMV of Assets'}
                    value={payoutData.net_assets ? `$${Number(payoutData.net_assets).toLocaleString()}` : '—'}
                  />
                  <Row label="Required Payout (§4942)" value={payoutData.required_payout ? `$${Number(payoutData.required_payout).toLocaleString()}` : '—'} />
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

        {/* ─── Section 4: State Registrations ─── */}
        <section className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-gray-900">State Registrations</h2>
              <p className="text-xs text-gray-500 mt-0.5">Charitable solicitation registrations by state</p>
            </div>
            <button
              onClick={() => setShowAddReg(v => !v)}
              className="px-3 py-1.5 text-sm bg-azure text-white rounded-md hover:bg-azure/90 transition-colors"
            >
              {showAddReg ? 'Cancel' : '+ Add Registration'}
            </button>
          </div>

          {showAddReg && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">State *</label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="CA"
                    value={newReg.state}
                    onChange={e => setNewReg(p => ({ ...p, state: e.target.value.toUpperCase() }))}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={newReg.registration_type}
                    onChange={e => setNewReg(p => ({ ...p, registration_type: e.target.value }))}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure/40"
                  >
                    <option value="charitable_solicitation">Charitable Solicitation</option>
                    <option value="exemption">Exemption</option>
                    <option value="annual_report">Annual Report</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                  <select
                    value={newReg.status}
                    onChange={e => setNewReg(p => ({ ...p, status: e.target.value }))}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure/40"
                  >
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="expired">Expired</option>
                    <option value="exempt">Exempt</option>
                    <option value="not_required">Not Required</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Expiration Date</label>
                  <input
                    type="date"
                    value={newReg.expiration_date}
                    onChange={e => setNewReg(p => ({ ...p, expiration_date: e.target.value }))}
                    className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure/40"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={newReg.notes}
                  onChange={e => setNewReg(p => ({ ...p, notes: e.target.value }))}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-azure/40"
                  placeholder="Optional notes"
                />
              </div>
              <button
                onClick={handleAddReg}
                disabled={addingReg || !newReg.state}
                className="px-4 py-2 text-sm bg-azure text-white rounded-md hover:bg-azure/90 disabled:opacity-50 transition-colors"
              >
                {addingReg ? 'Saving…' : 'Save Registration'}
              </button>
            </div>
          )}

          {stateRegsLoading ? (
            <div className="text-center py-8 text-sm text-gray-400">Loading state registrations…</div>
          ) : stateRegs.length === 0 ? (
            <div className="text-center py-8 text-sm text-gray-400">No state registrations on file.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left">
                    <th className="pb-2 pr-4 font-medium text-gray-500 text-xs uppercase tracking-wide">State</th>
                    <th className="pb-2 pr-4 font-medium text-gray-500 text-xs uppercase tracking-wide">Type</th>
                    <th className="pb-2 pr-4 font-medium text-gray-500 text-xs uppercase tracking-wide">Status</th>
                    <th className="pb-2 pr-4 font-medium text-gray-500 text-xs uppercase tracking-wide">Expires</th>
                    <th className="pb-2 font-medium text-gray-500 text-xs uppercase tracking-wide">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {stateRegs.map((reg: any) => {
                    const expDate = reg.expiration_date ? new Date(reg.expiration_date) : null;
                    const isExpiringSoon = expDate && expDate.getTime() - Date.now() < 60 * 24 * 60 * 60 * 1000;
                    const isExpired = expDate && expDate < new Date();
                    return (
                      <tr key={reg.id} className="hover:bg-gray-50">
                        <td className="py-2.5 pr-4 font-semibold text-gray-900">{reg.state}</td>
                        <td className="py-2.5 pr-4 text-gray-600 capitalize">{(reg.registration_type || '').replace(/_/g, ' ')}</td>
                        <td className="py-2.5 pr-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            reg.status === 'active' ? 'bg-green-100 text-green-800' :
                            reg.status === 'expired' ? 'bg-red-100 text-red-800' :
                            reg.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {reg.status || '—'}
                          </span>
                        </td>
                        <td className={`py-2.5 pr-4 ${isExpired ? 'text-red-600 font-medium' : isExpiringSoon ? 'text-amber-600 font-medium' : 'text-gray-600'}`}>
                          {expDate ? expDate.toLocaleDateString() : '—'}
                        </td>
                        <td className="py-2.5 text-gray-500 text-xs">{reg.notes || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
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
