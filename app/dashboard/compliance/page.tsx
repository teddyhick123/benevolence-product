'use client';

import { useState, useEffect } from 'react';
import { pickActiveOrg } from '@/lib/org-cookie';

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
  waived:         'bg-neutral-100   text-neutral-500',
  not_applicable: 'bg-neutral-100   text-neutral-500',
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

  // Mark as Filed modal
  const [filingToMark, setFilingToMark] = useState<any | null>(null);
  const [markFiledFields, setMarkFiledFields] = useState({ filing_reference: '', completed_by: '', notes: '' });

  // Add Filing form
  const [showAddFiling, setShowAddFiling] = useState(false);
  const [addingFiling, setAddingFiling] = useState(false);
  const [newFiling, setNewFiling] = useState({ filing_type: 'form_990pf', title: '', due_date: '', description: '', jurisdiction: '' });

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
        const org = pickActiveOrg((d.organizations ?? []) as Array<{ id: string; modules?: Record<string, boolean> }>);
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

  async function handleMarkFiled() {
    if (!orgId || !filingToMark) return;
    setMarkingFiled(filingToMark.id);
    try {
      const body: Record<string, any> = {
        id: filingToMark.id,
        status: 'filed',
        completed_at: new Date().toISOString(),
      };
      if (markFiledFields.filing_reference.trim()) body.filing_reference = markFiledFields.filing_reference.trim();
      if (markFiledFields.completed_by.trim()) body.completed_by = markFiledFields.completed_by.trim();
      if (markFiledFields.notes.trim()) body.notes = markFiledFields.notes.trim();

      const res = await fetch(`/api/org/${orgId}/compliance/filing-calendar`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const d = await res.json();
        setFilings(prev => prev.map(f => f.id === filingToMark.id ? d.data : f));
      }
    } finally {
      setMarkingFiled(null);
      setFilingToMark(null);
      setMarkFiledFields({ filing_reference: '', completed_by: '', notes: '' });
    }
  }

  async function handleAddFiling() {
    if (!orgId || !newFiling.filing_type || !newFiling.title || !newFiling.due_date) return;
    setAddingFiling(true);
    try {
      const res = await fetch(`/api/org/${orgId}/compliance/filing-calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newFiling),
      });
      if (res.ok) {
        const d = await res.json();
        setFilings(prev => [...prev, d.data].sort((a, b) => a.due_date.localeCompare(b.due_date)));
        setShowAddFiling(false);
        setNewFiling({ filing_type: 'form_990pf', title: '', due_date: '', description: '', jurisdiction: '' });
      }
    } finally {
      setAddingFiling(false);
    }
  }

  function downloadPayoutCsv() {
    if (!payoutData) return;
    const rows = [
      ['Tax Year', payoutYear],
      ['Net Assets / FMV', payoutData.net_assets ?? ''],
      ['Required Payout (5%)', payoutData.required_payout ?? ''],
      ['Actual Distributions', payoutData.actual_distributions ?? ''],
      ['Surplus / (Deficit)', payoutData.surplus_or_deficit ?? ''],
      ['% of Requirement Met', payoutData.pct_distributed != null ? `${payoutData.pct_distributed}%` : ''],
    ];
    const csv = rows.map(r => r.map(v => JSON.stringify(v)).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = `payout-summary-${payoutYear}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
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
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center max-w-sm">
          <h2 className="mb-2 font-serif text-xl font-medium text-ink">Compliance not enabled</h2>
          <p className="text-sm text-neutral-500">The Compliance module is not enabled for your organization. Contact your administrator to enable it.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Page header */}
        <div>
          <h1 className="font-serif text-3xl font-medium text-ink">Compliance</h1>
          <p className="text-sm text-neutral-500 mt-1">Filing calendar, 990-PF export, and payout analysis</p>
        </div>

        {/* ─── Section 1: Filing Calendar ─── */}
        <section className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-soft">
          <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
            <div>
              <h2 className="font-semibold text-ink">Filing Calendar</h2>
              <p className="text-xs text-neutral-500 mt-0.5">Upcoming filings in the next 12 months</p>
            </div>
            <button
              onClick={() => setShowAddFiling(v => !v)}
              className="rounded-2xl bg-azure px-3 py-1.5 text-xs font-medium text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-azure/90"
            >
              + Add Filing
            </button>
          </div>

          {/* Add Filing Form */}
          {showAddFiling && (
            <div className="border-b border-black/5 bg-neutral-50 px-6 py-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Filing Type</label>
                  <select
                    value={newFiling.filing_type}
                    onChange={e => setNewFiling(f => ({ ...f, filing_type: e.target.value }))}
                    className="w-full rounded-2xl border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                  >
                    {Object.entries(FILING_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Title <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={newFiling.title}
                    onChange={e => setNewFiling(f => ({ ...f, title: e.target.value }))}
                    placeholder="e.g. Form 990-PF — FY 2025"
                    className="w-full rounded-2xl border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Due Date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={newFiling.due_date}
                    onChange={e => setNewFiling(f => ({ ...f, due_date: e.target.value }))}
                    className="w-full rounded-2xl border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Jurisdiction</label>
                  <input
                    type="text"
                    value={newFiling.jurisdiction}
                    onChange={e => setNewFiling(f => ({ ...f, jurisdiction: e.target.value }))}
                    placeholder="e.g. CA, Federal"
                    className="w-full rounded-2xl border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                  />
                </div>
              </div>
              <div className="mb-3">
                <label className="block text-xs font-medium text-neutral-700 mb-1">Description</label>
                <input
                  type="text"
                  value={newFiling.description}
                  onChange={e => setNewFiling(f => ({ ...f, description: e.target.value }))}
                  placeholder="Optional notes"
                  className="w-full rounded-2xl border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setShowAddFiling(false)}
                  className="px-3 py-1.5 text-xs text-neutral-600 hover:text-neutral-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAddFiling}
                  disabled={addingFiling || !newFiling.title || !newFiling.due_date}
                  className="rounded-2xl bg-azure px-4 py-1.5 text-xs font-medium text-white transition hover:bg-azure/90 disabled:opacity-50"
                >
                  {addingFiling ? 'Saving…' : 'Save Filing'}
                </button>
              </div>
            </div>
          )}

          {filingsLoading ? (
            <div className="p-8 text-center text-neutral-400">Loading filings…</div>
          ) : filings.length === 0 ? (
            <div className="p-8 text-center text-neutral-400 text-sm">No upcoming filings found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-neutral-50 border-b border-black/5">
                <tr>
                  <th className="text-left px-6 py-3 font-medium text-neutral-600">Filing</th>
                  <th className="text-left px-6 py-3 font-medium text-neutral-600">Tax Year</th>
                  <th className="text-left px-6 py-3 font-medium text-neutral-600">Due Date</th>
                  <th className="text-left px-6 py-3 font-medium text-neutral-600">Jurisdiction</th>
                  <th className="text-left px-6 py-3 font-medium text-neutral-600">Status</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {filings.map(filing => {
                  const daysUntilDue = Math.ceil((new Date(filing.due_date).getTime() - Date.now()) / 86_400_000);
                  const reminderDays: number[] = Array.isArray(filing.reminder_days) ? filing.reminder_days : [];
                  const nearestReminder = reminderDays.filter(d => d >= daysUntilDue).sort((a, b) => a - b)[0];
                  const showReminder = nearestReminder !== undefined && filing.status === 'upcoming';
                  return (
                  <tr key={filing.id} className="hover:bg-neutral-50">
                    <td className="px-6 py-3 font-medium text-ink">
                      {FILING_TYPE_LABELS[filing.filing_type] || filing.filing_type}
                      {filing.description && (
                        <div className="text-xs text-neutral-500 font-normal">{filing.description}</div>
                      )}
                    </td>
                    <td className="px-6 py-3 text-neutral-600">{filing.tax_year}</td>
                    <td className="px-6 py-3 text-neutral-700">
                      {new Date(filing.due_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                      {showReminder && (
                        <div className="mt-0.5 inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zm0 16a2 2 0 002-2H8a2 2 0 002 2z"/></svg>
                          {daysUntilDue <= 0 ? 'Past due' : `Reminder: ${daysUntilDue}d left`}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-3 text-neutral-600 uppercase text-xs">{filing.jurisdiction || 'Federal'}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[filing.status] || 'bg-neutral-100 text-neutral-500'}`}>
                        {filing.status.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-right">
                      {filing.status === 'upcoming' || filing.status === 'overdue' ? (
                        <button
                          onClick={() => { setFilingToMark(filing); setMarkFiledFields({ filing_reference: '', completed_by: '', notes: '' }); }}
                          className="rounded-full bg-green-600 px-3 py-1 text-xs text-white transition hover:bg-green-700"
                        >
                          Mark as Filed
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
          <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-soft">
            <h2 className="font-semibold text-ink mb-1">990-PF Export</h2>
            <p className="text-xs text-neutral-500 mb-4">Export structured 990-PF data including qualifying distributions</p>

            <div className="flex gap-3 mb-4">
              <select
                value={exportYear}
                onChange={e => setExportYear(parseInt(e.target.value))}
                className="flex-1 rounded-2xl border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
              >
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button
                onClick={handle990Export}
                disabled={exportLoading || !portfolioId}
                className="rounded-2xl bg-azure px-4 py-2 text-sm text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-azure/90 disabled:opacity-50"
              >
                {exportLoading ? 'Loading…' : 'Load Data'}
              </button>
            </div>

            {exportData && (
              <div className="space-y-3">
                <div className="rounded-2xl bg-neutral-50 p-4 text-sm space-y-2">
                  <div className="font-medium text-neutral-700 mb-2">Revenue Summary (Part I)</div>
                  <Row label="Net Investment Income" value={`$${Number(exportData.part_i?.net_investment_income || 0).toLocaleString()}`} />
                  <Row label="Excise Tax Rate" value={`${exportData.part_i?.excise_tax_rate || 1.39}%`} />
                  <Row label="Total Grants" value={`$${Number(exportData.part_i?.total_grants || 0).toLocaleString()}`} />
                </div>
                <div className="rounded-2xl bg-neutral-50 p-4 text-sm space-y-2">
                  <div className="font-medium text-neutral-700 mb-2">Qualifying Distributions (Part XII)</div>
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
                  className="w-full rounded-2xl border border-azure/30 py-2 text-sm text-azure transition hover:bg-azure/10"
                >
                  Download JSON
                </button>
              </div>
            )}
          </section>

          {/* Payout Calculator Card */}
          <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-soft">
            <h2 className="font-semibold text-ink mb-1">Payout Calculator</h2>
            <p className="text-xs text-neutral-500 mb-4">5% minimum distribution requirement analysis</p>

            <div className="flex gap-3 mb-4">
              <select
                value={payoutYear}
                onChange={e => setPayoutYear(parseInt(e.target.value))}
                className="flex-1 rounded-2xl border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
              >
                {yearOptions.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {payoutLoading ? (
              <div className="text-center text-neutral-400 py-8 text-sm">Loading payout data…</div>
            ) : payoutData ? (
              <div className="space-y-3">
                {payoutData.surplus_or_deficit !== null && payoutData.surplus_or_deficit < 0 && (
                  <div className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                    <span className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-red-100 text-xs font-semibold text-red-700">!</span>
                    <div>
                      <strong>At-Risk: Distribution below 5% threshold.</strong> Your foundation must distribute at least 5% of net assets annually under IRC §4942. The current shortfall of ${Math.abs(Number(payoutData.surplus_or_deficit)).toLocaleString()} must be made up before year-end to avoid excise taxes.
                    </div>
                  </div>
                )}
                <div className="rounded-2xl bg-neutral-50 p-4 text-sm space-y-2">
                  <Row
                    label={payoutData.avg_fmv_used ? 'Avg. FMV of Assets (Part XIII)' : 'Year-End FMV of Assets'}
                    value={payoutData.net_assets ? `$${Number(payoutData.net_assets).toLocaleString()}` : '—'}
                  />
                  <Row label="Required Payout (§4942)" value={payoutData.required_payout ? `$${Number(payoutData.required_payout).toLocaleString()}` : '—'} />
                  <Row label="Actual Distributions" value={`$${Number(payoutData.actual_distributions || 0).toLocaleString()}`} />
                </div>
                <div className={`rounded-2xl p-4 text-sm space-y-2 ${payoutData.surplus_or_deficit >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
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
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">
                    <strong>Self-Dealing Flag:</strong> {payoutData.self_dealing_notes || 'Self-dealing activity recorded for this year.'}
                  </div>
                )}
                <button
                  onClick={downloadPayoutCsv}
                  className="mt-1 text-xs text-azure hover:underline flex items-center gap-1"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  Download payout summary (.csv)
                </button>
              </div>
            ) : (
              <div className="text-center text-neutral-400 py-8 text-sm">Select a year to view payout analysis.</div>
            )}
          </section>
        </div>

        {/* ─── Section 4: State Registrations ─── */}
        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-soft">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-ink">State Registrations</h2>
              <p className="text-xs text-neutral-500 mt-0.5">Charitable solicitation registrations by state</p>
            </div>
            <button
              onClick={() => setShowAddReg(v => !v)}
              className="rounded-2xl bg-azure px-3 py-1.5 text-sm text-white shadow-soft transition hover:-translate-y-0.5 hover:bg-azure/90"
            >
              {showAddReg ? 'Cancel' : '+ Add Registration'}
            </button>
          </div>

          {showAddReg && (
            <div className="mb-4 space-y-3 rounded-2xl border border-black/5 bg-neutral-50 p-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">State *</label>
                  <input
                    type="text"
                    maxLength={2}
                    placeholder="CA"
                    value={newReg.state}
                    onChange={e => setNewReg(p => ({ ...p, state: e.target.value.toUpperCase() }))}
                    className="w-full rounded-2xl border border-black/10 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-azure/40"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Type</label>
                  <select
                    value={newReg.registration_type}
                    onChange={e => setNewReg(p => ({ ...p, registration_type: e.target.value }))}
                    className="w-full rounded-2xl border border-black/10 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-azure/40"
                  >
                    <option value="charitable_solicitation">Charitable Solicitation</option>
                    <option value="exemption">Exemption</option>
                    <option value="annual_report">Annual Report</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Status</label>
                  <select
                    value={newReg.status}
                    onChange={e => setNewReg(p => ({ ...p, status: e.target.value }))}
                    className="w-full rounded-2xl border border-black/10 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-azure/40"
                  >
                    <option value="active">Active</option>
                    <option value="pending">Pending</option>
                    <option value="expired">Expired</option>
                    <option value="exempt">Exempt</option>
                    <option value="not_required">Not Required</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-700 mb-1">Expiration Date</label>
                  <input
                    type="date"
                    value={newReg.expiration_date}
                    onChange={e => setNewReg(p => ({ ...p, expiration_date: e.target.value }))}
                    className="w-full rounded-2xl border border-black/10 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-azure/40"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={newReg.notes}
                  onChange={e => setNewReg(p => ({ ...p, notes: e.target.value }))}
                  className="w-full rounded-2xl border border-black/10 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-azure/40"
                  placeholder="Optional notes"
                />
              </div>
              <button
                onClick={handleAddReg}
                disabled={addingReg || !newReg.state}
                className="rounded-2xl bg-azure px-4 py-2 text-sm text-white transition hover:bg-azure/90 disabled:opacity-50"
              >
                {addingReg ? 'Saving…' : 'Save Registration'}
              </button>
            </div>
          )}

          {stateRegsLoading ? (
            <div className="text-center py-8 text-sm text-neutral-400">Loading state registrations…</div>
          ) : stateRegs.length === 0 ? (
            <div className="text-center py-8 text-sm text-neutral-400">No state registrations on file.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-black/5 text-left">
                    <th className="pb-2 pr-4 font-medium text-neutral-500 text-xs uppercase tracking-wide">State</th>
                    <th className="pb-2 pr-4 font-medium text-neutral-500 text-xs uppercase tracking-wide">Type</th>
                    <th className="pb-2 pr-4 font-medium text-neutral-500 text-xs uppercase tracking-wide">Status</th>
                    <th className="pb-2 pr-4 font-medium text-neutral-500 text-xs uppercase tracking-wide">Expires</th>
                    <th className="pb-2 font-medium text-neutral-500 text-xs uppercase tracking-wide">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {stateRegs.map((reg: any) => {
                    const expDate = reg.expiration_date ? new Date(reg.expiration_date) : null;
                    const isExpiringSoon = expDate && expDate.getTime() - Date.now() < 60 * 24 * 60 * 60 * 1000;
                    const isExpired = expDate && expDate < new Date();
                    return (
                      <tr key={reg.id} className="hover:bg-neutral-50">
                        <td className="py-2.5 pr-4 font-semibold text-ink">{reg.state}</td>
                        <td className="py-2.5 pr-4 text-neutral-600 capitalize">{(reg.registration_type || '').replace(/_/g, ' ')}</td>
                        <td className="py-2.5 pr-4">
                          <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            reg.status === 'active' ? 'bg-green-100 text-green-800' :
                            reg.status === 'expired' ? 'bg-red-100 text-red-800' :
                            reg.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-neutral-100 text-neutral-600'
                          }`}>
                            {reg.status || '—'}
                          </span>
                        </td>
                        <td className={`py-2.5 pr-4 ${isExpired ? 'text-red-600 font-medium' : isExpiringSoon ? 'text-amber-600 font-medium' : 'text-neutral-600'}`}>
                          {expDate ? expDate.toLocaleDateString() : '—'}
                        </td>
                        <td className="py-2.5 text-neutral-500 text-xs">{reg.notes || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ─── Annual Foundation Checklist ─── */}
        <section className="rounded-2xl border border-black/5 bg-white p-6 shadow-soft">
          <details>
            <summary className="cursor-pointer flex items-center justify-between">
              <div>
                <h2 className="font-semibold text-ink inline">Annual Foundation Checklist</h2>
                <p className="text-xs text-neutral-500 mt-0.5">Standard private foundation obligations — click to expand</p>
              </div>
            </summary>

            <div className="mt-5 space-y-4">
              {[
                {
                  category: 'Federal Tax Filings',
                  items: [
                    { label: 'Form 990-PF', detail: 'Annual return — due May 15 (or Nov 15 with extension)', required: true },
                    { label: 'Form 8868', detail: '6-month extension request — due May 15', required: false },
                    { label: 'Form 4720', detail: 'Excise tax return if any self-dealing, excess holdings, or taxable expenditures occurred', required: false },
                  ],
                },
                {
                  category: 'Distribution Requirements',
                  items: [
                    { label: '5% Minimum Distribution', detail: 'Must distribute at least 5% of net assets (IRC §4942) by year-end', required: true },
                    { label: 'Qualifying Distributions', detail: 'Grants, reasonable admin expenses, and program-related investments', required: true },
                  ],
                },
                {
                  category: 'Governance',
                  items: [
                    { label: 'Board Meeting Minutes', detail: 'Document all board actions, grant approvals, and investment decisions', required: true },
                    { label: 'Conflict of Interest Review', detail: 'Annual disclosure from all board members and officers', required: true },
                    { label: 'Investment Policy Statement', detail: 'Review and reaffirm annually', required: false },
                  ],
                },
                {
                  category: 'State Compliance',
                  items: [
                    { label: 'State Charitable Registration', detail: 'Renewal varies by state — check your jurisdiction', required: true },
                    { label: 'State Annual Report', detail: 'Corporate/nonprofit annual report with Secretary of State', required: true },
                  ],
                },
                {
                  category: 'Prohibited Activities (IRC §4941–4945)',
                  items: [
                    { label: 'Self-Dealing Prohibition', detail: 'No financial transactions between foundation and disqualified persons', required: true },
                    { label: 'Excess Business Holdings', detail: 'Foundation + disqualified persons cannot hold >20% of a business', required: true },
                    { label: 'Jeopardizing Investments', detail: 'Avoid speculative investments that jeopardize the charitable purpose', required: true },
                    { label: 'Taxable Expenditures', detail: 'Grants must include expenditure responsibility or be to public charities', required: true },
                  ],
                },
              ].map(({ category, items }) => (
                <div key={category}>
                  <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wide mb-2">{category}</h3>
                  <div className="space-y-1.5">
                    {items.map(({ label, detail, required }) => (
                      <div key={label} className="flex items-start gap-2.5">
                        <span className={`mt-0.5 shrink-0 text-xs font-medium px-1.5 py-0.5 rounded ${required ? 'bg-red-50 text-red-700' : 'bg-neutral-100 text-neutral-500'}`}>
                          {required ? 'Required' : 'Optional'}
                        </span>
                        <div>
                          <span className="text-sm font-medium text-neutral-800">{label}</span>
                          <span className="text-sm text-neutral-500"> — {detail}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              <p className="text-xs text-neutral-400 pt-2 border-t border-black/5">
                This checklist is a general reference. Consult your legal and tax advisors for requirements specific to your foundation.
              </p>
            </div>
          </details>
        </section>
      </div>

      {/* Mark as Filed modal */}
      {filingToMark && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="font-serif text-lg font-medium text-ink">Mark as Filed</h3>
            <p className="text-sm text-neutral-600">{filingToMark.title}</p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Confirmation / Reference Number</label>
                <input
                  type="text"
                  value={markFiledFields.filing_reference}
                  onChange={e => setMarkFiledFields(p => ({ ...p, filing_reference: e.target.value }))}
                  placeholder="e.g. IRS-2026-XXXXX"
                  className="w-full rounded-2xl border border-black/10 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-azure/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Filed by</label>
                <input
                  type="text"
                  value={markFiledFields.completed_by}
                  onChange={e => setMarkFiledFields(p => ({ ...p, completed_by: e.target.value }))}
                  placeholder="Name or role"
                  className="w-full rounded-2xl border border-black/10 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-azure/30"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-700 mb-1">Notes <span className="text-neutral-400">(optional)</span></label>
                <textarea
                  value={markFiledFields.notes}
                  onChange={e => setMarkFiledFields(p => ({ ...p, notes: e.target.value }))}
                  rows={2}
                  placeholder="Any additional notes"
                  className="w-full resize-none rounded-2xl border border-black/10 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-azure/30"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => { setFilingToMark(null); setMarkFiledFields({ filing_reference: '', completed_by: '', notes: '' }); }}
                className="rounded-2xl border border-black/10 px-4 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
              >
                Cancel
              </button>
              <button
                onClick={handleMarkFiled}
                disabled={markingFiled === filingToMark.id}
                className="rounded-2xl bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
              >
                {markingFiled === filingToMark.id ? 'Saving…' : 'Confirm Filed'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, highlight }: { label: string; value: any; highlight?: 'green' | 'red' }) {
  return (
    <div className="flex justify-between">
      <span className="text-neutral-600">{label}</span>
      <span className={`font-medium ${highlight === 'green' ? 'text-green-700' : highlight === 'red' ? 'text-red-700' : 'text-ink'}`}>
        {value}
      </span>
    </div>
  );
}
