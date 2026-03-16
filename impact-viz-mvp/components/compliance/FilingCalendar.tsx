'use client';

import { useState, useEffect } from 'react';

interface Filing {
  id: string;
  filing_type: string;
  tax_year: number;
  jurisdiction: string;
  description: string | null;
  due_date: string;
  extended_due_date: string | null;
  status: string;
  filed_date: string | null;
  confirmation_number: string | null;
  urgency?: string;
  days_until_due?: number;
}

interface Props {
  orgId: string;
}

const STATUS_COLORS: Record<string, string> = {
  filed: 'bg-green-100 text-green-800',
  filed_late: 'bg-yellow-100 text-yellow-800',
  extended: 'bg-blue-100 text-blue-800',
  in_progress: 'bg-indigo-100 text-indigo-800',
  pending: 'bg-gray-100 text-gray-700',
  overdue: 'bg-red-100 text-red-800',
  not_required: 'bg-gray-50 text-gray-400',
};

const URGENCY_COLORS: Record<string, string> = {
  critical: 'border-l-4 border-red-500',
  high: 'border-l-4 border-orange-500',
  medium: 'border-l-4 border-yellow-500',
  low: 'border-l-4 border-gray-300',
  overdue: 'border-l-4 border-red-700 bg-red-50',
};

const FILING_TYPE_LABELS: Record<string, string> = {
  '990_pf': 'Form 990-PF',
  '990': 'Form 990',
  '990_ez': 'Form 990-EZ',
  '990_n': 'Form 990-N',
  '990_t': 'Form 990-T',
  'state_annual_report': 'State Annual Report',
  'state_registration': 'State Registration',
  'state_renewal': 'State Renewal',
  'state_990_copy': 'State 990 Copy',
  'form_4720': 'Form 4720',
  'form_5227': 'Form 5227',
  'form_8868': 'Form 8868 (Extension)',
  'other': 'Other Filing',
};

export default function FilingCalendar({ orgId }: Props) {
  const [filings, setFilings] = useState<Filing[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [statusFilter, setStatusFilter] = useState('');
  const [showMarkFiledModal, setShowMarkFiledModal] = useState<Filing | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [filedForm, setFiledForm] = useState({ filed_date: new Date().toISOString().split('T')[0], confirmation_number: '' });
  const [newFilingForm, setNewFilingForm] = useState({
    filing_type: '990_pf', tax_year: new Date().getFullYear(), jurisdiction: 'federal',
    due_date: '', description: '',
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      let url = `/api/org/${orgId}/compliance/filing-calendar?days=365`;
      if (statusFilter) url += `&status=${statusFilter}`;
      const res = await fetch(url);
      const json = await res.json();
      setFilings(json.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [orgId, statusFilter]);

  async function handleMarkFiled(filing: Filing) {
    setSaving(true);
    try {
      await fetch(`/api/org/${orgId}/compliance/filing-calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: filing.id,
          status: 'filed',
          filed_date: filedForm.filed_date,
          confirmation_number: filedForm.confirmation_number || null,
        }),
      });
      setShowMarkFiledModal(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleAddFiling() {
    setSaving(true);
    try {
      await fetch(`/api/org/${orgId}/compliance/filing-calendar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newFilingForm),
      });
      setShowAddModal(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  const getUrgencyBadge = (days: number | undefined, status: string) => {
    if (status === 'filed' || status === 'not_required') return null;
    if (status === 'overdue' || (days !== undefined && days < 0)) return <span className="text-xs font-semibold text-red-700 bg-red-100 px-2 py-0.5 rounded-full">OVERDUE</span>;
    if (days !== undefined && days <= 7) return <span className="text-xs font-semibold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{days}d</span>;
    if (days !== undefined && days <= 14) return <span className="text-xs font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full">{days}d</span>;
    if (days !== undefined && days <= 30) return <span className="text-xs font-semibold text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">{days}d</span>;
    return <span className="text-xs text-gray-500">{days}d</span>;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border border-gray-300 overflow-hidden">
          <button onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-sm ${viewMode === 'list' ? 'bg-azure text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
            List
          </button>
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white text-gray-700">
          <option value="">All statuses</option>
          <option value="pending">Pending</option>
          <option value="overdue">Overdue</option>
          <option value="in_progress">In Progress</option>
          <option value="extended">Extended</option>
          <option value="filed">Filed</option>
        </select>
        <button onClick={() => setShowAddModal(true)}
          className="ml-auto px-4 py-2 bg-azure text-white rounded-lg text-sm font-medium hover:bg-azure/90">
          + Add Filing
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2">
          {[1,2,3,4].map(i => <div key={i} className="h-14 bg-gray-100 rounded-lg" />)}
        </div>
      ) : filings.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">No filings found.</div>
      ) : (
        <div className="space-y-2">
          {filings.map(f => (
            <div key={f.id} className={`bg-white border border-gray-200 rounded-lg px-4 py-3 flex items-center gap-4 ${URGENCY_COLORS[f.urgency || 'low'] || ''}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-gray-900 text-sm">{FILING_TYPE_LABELS[f.filing_type] || f.filing_type}</span>
                  <span className="text-xs text-gray-500">TY {f.tax_year}</span>
                  {f.jurisdiction !== 'federal' && (
                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{f.jurisdiction.toUpperCase()}</span>
                  )}
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[f.status] || 'bg-gray-100 text-gray-700'}`}>
                    {f.status.replace(/_/g, ' ')}
                  </span>
                  {getUrgencyBadge(f.days_until_due, f.status)}
                </div>
                {f.description && <p className="text-xs text-gray-500 mt-0.5">{f.description}</p>}
                <div className="text-xs text-gray-400 mt-0.5">
                  Due: {f.extended_due_date || f.due_date}
                  {f.filed_date && ` · Filed: ${f.filed_date}`}
                  {f.confirmation_number && ` · Conf: ${f.confirmation_number}`}
                </div>
              </div>
              <div className="flex-shrink-0">
                {f.status !== 'filed' && f.status !== 'not_required' && (
                  <button
                    onClick={() => { setShowMarkFiledModal(f); setFiledForm({ filed_date: new Date().toISOString().split('T')[0], confirmation_number: '' }); }}
                    className="text-xs text-azure hover:text-azure/80 font-medium whitespace-nowrap"
                  >
                    Mark Filed
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Mark Filed Modal */}
      {showMarkFiledModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Mark as Filed</h3>
            <p className="text-sm text-gray-600">{FILING_TYPE_LABELS[showMarkFiledModal.filing_type]} — TY {showMarkFiledModal.tax_year}</p>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Filed Date</label>
                <input type="date" value={filedForm.filed_date} onChange={e => setFiledForm(f => ({ ...f, filed_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirmation Number</label>
                <input value={filedForm.confirmation_number} onChange={e => setFiledForm(f => ({ ...f, confirmation_number: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Optional" />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowMarkFiledModal(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700">Cancel</button>
              <button onClick={() => handleMarkFiled(showMarkFiledModal)} disabled={saving}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Mark Filed'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Filing Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-semibold text-gray-900">Add Filing Deadline</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Filing Type</label>
                <select value={newFilingForm.filing_type} onChange={e => setNewFilingForm(f => ({ ...f, filing_type: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {Object.entries(FILING_TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tax Year</label>
                  <input type="number" value={newFilingForm.tax_year} onChange={e => setNewFilingForm(f => ({ ...f, tax_year: parseInt(e.target.value) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Jurisdiction</label>
                  <input value={newFilingForm.jurisdiction} onChange={e => setNewFilingForm(f => ({ ...f, jurisdiction: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="federal or CA, NY..." />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date *</label>
                <input type="date" value={newFilingForm.due_date} onChange={e => setNewFilingForm(f => ({ ...f, due_date: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <input value={newFilingForm.description} onChange={e => setNewFilingForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Optional notes" />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700">Cancel</button>
              <button onClick={handleAddFiling} disabled={saving || !newFilingForm.due_date}
                className="px-4 py-2 bg-azure text-white rounded-lg text-sm font-medium hover:bg-azure/90 disabled:opacity-50">
                {saving ? 'Adding...' : 'Add Filing'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
