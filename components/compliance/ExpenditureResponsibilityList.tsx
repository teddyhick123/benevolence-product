'use client';

import { useState, useEffect } from 'react';

interface ERGrant {
  id: string;
  grant_id: string;
  grantee_name: string | null;
  grant_amount: number | null;
  grantee_is_public_charity: boolean;
  grantee_ein: string | null;
  grantee_501c3_verified: boolean;
  er_agreement_required: boolean;
  er_agreement_signed_date: string | null;
  er_reports_required_count: number;
  er_reports_received_count: number;
  terminal_report_required: boolean;
  terminal_report_received: boolean;
  terminal_report_date: string | null;
  er_status: string;
  agreement_missing: boolean;
  reports_deficient: boolean;
  terminal_report_overdue: boolean;
}

interface Props {
  portfolioId: string;
}

const STATUS_STYLES: Record<string, string> = {
  compliant: 'bg-green-100 text-green-800',
  deficient: 'bg-red-100 text-red-800',
  pending: 'bg-amber-100 text-amber-800',
  waived: 'bg-gray-100 text-gray-500',
};

export default function ExpenditureResponsibilityList({ portfolioId }: Props) {
  const [grants, setGrants] = useState<ERGrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [recordingReport, setRecordingReport] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      let url = `/api/portfolio/${portfolioId}/compliance/er-grants`;
      if (statusFilter) url += `?status=${statusFilter}`;
      const res = await fetch(url);
      const json = await res.json();
      setGrants(json.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [portfolioId, statusFilter]);

  async function handleRecordReport(erGrantId: string, currentCount: number) {
    setRecordingReport(erGrantId);
    try {
      await fetch(`/api/portfolio/${portfolioId}/compliance/er-grants?id=${erGrantId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ er_reports_received_count: currentCount + 1 }),
      });
      await load();
    } finally {
      setRecordingReport(null);
    }
  }

  const deficientCount = grants.filter(g => g.er_status === 'deficient' || g.agreement_missing || g.reports_deficient || g.terminal_report_overdue).length;
  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

  return (
    <div className="space-y-4">
      {deficientCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 flex items-center gap-2 text-sm text-red-800">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <span><strong>{deficientCount} grant{deficientCount !== 1 ? 's' : ''}</strong> deficient in expenditure responsibility compliance.</span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-700">
          <option value="">All statuses</option>
          <option value="deficient">Deficient</option>
          <option value="pending">Pending</option>
          <option value="compliant">Compliant</option>
          <option value="waived">Waived</option>
        </select>
        <span className="text-sm text-gray-500 ml-auto">{grants.length} grant{grants.length !== 1 ? 's' : ''}</span>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-16 bg-gray-100 rounded-lg" />)}
        </div>
      ) : grants.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">No ER grants tracked yet.</div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Grantee</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">ER Agreement</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Reports</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Terminal</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {grants.map(g => (
                <tr key={g.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{g.grantee_name || 'Unknown Grantee'}</div>
                    <div className="text-xs text-gray-500">
                      {g.grant_amount ? fmt(g.grant_amount) : ''}
                      {g.grantee_ein ? ` · EIN: ${g.grantee_ein}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    {!g.er_agreement_required ? (
                      <span className="text-xs text-gray-400">Not required (public charity)</span>
                    ) : g.er_agreement_signed_date ? (
                      <span className="text-xs text-green-700">✓ Signed {g.er_agreement_signed_date}</span>
                    ) : (
                      <span className="text-xs text-red-600 font-medium">⚠ Missing</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {g.er_reports_required_count > 0 ? (
                      <div>
                        <span className={`text-xs font-medium ${g.reports_deficient ? 'text-red-600' : 'text-green-700'}`}>
                          {g.er_reports_received_count}/{g.er_reports_required_count}
                        </span>
                        {g.reports_deficient && <span className="text-xs text-red-500 ml-1">deficient</span>}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Not required</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {!g.terminal_report_required ? (
                      <span className="text-xs text-gray-400">N/A</span>
                    ) : g.terminal_report_received ? (
                      <span className="text-xs text-green-700">✓ Received</span>
                    ) : g.terminal_report_overdue ? (
                      <span className="text-xs text-red-600 font-medium">Overdue</span>
                    ) : (
                      <span className="text-xs text-amber-600">Pending</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[g.er_status] || 'bg-gray-100 text-gray-700'}`}>
                      {g.er_status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {g.er_reports_received_count < g.er_reports_required_count && (
                      <button
                        onClick={() => handleRecordReport(g.id, g.er_reports_received_count)}
                        disabled={recordingReport === g.id}
                        className="text-xs text-azure hover:text-azure/80 font-medium whitespace-nowrap disabled:opacity-50"
                      >
                        {recordingReport === g.id ? 'Saving...' : '+ Record Report'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
