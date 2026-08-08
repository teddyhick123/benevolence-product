'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useState, useEffect } from 'react';

interface StateRegistration {
  id: string;
  state_code: string;
  state_name: string;
  registration_number: string | null;
  status: string;
  registration_date: string | null;
  expiration_date: string | null;
  annual_report_due: string | null;
  annual_report_filed: string | null;
  solicits_in_state: boolean;
}

interface Props {
  orgId: string;
}

const STATUS_COLORS: Record<string, string> = {
  registered: 'bg-green-100 text-green-800',
  renewal_pending: 'bg-amber-100 text-amber-800',
  renewal_overdue: 'bg-red-100 text-red-800',
  exempt: 'bg-blue-100 text-blue-800',
  not_registered: 'bg-gray-100 text-gray-500',
  lapsed: 'bg-red-50 text-red-600',
  rejected: 'bg-red-200 text-red-900',
};

const STATUS_LABELS: Record<string, string> = {
  registered: 'Registered',
  renewal_pending: 'Renewal Pending',
  renewal_overdue: 'Renewal Overdue',
  exempt: 'Exempt',
  not_registered: 'Not Registered',
  lapsed: 'Lapsed',
  rejected: 'Rejected',
};

export default function StateRegistrationTracker({ orgId }: Props) {
  const [registrations, setRegistrations] = useState<StateRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDrawer, setShowDrawer] = useState(false);
  const [editReg, setEditReg] = useState<StateRegistration | null>(null);
  const [form, setForm] = useState({
    state_code: '', state_name: '', registration_number: '',
    status: 'registered', registration_date: '', expiration_date: '',
    annual_report_due: '', solicits_in_state: true,
  });
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await apiRequest(`/api/org/${orgId}/compliance/state-registrations`);
      const json = await readJson(res);
      setRegistrations(json.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [orgId]);

  function openAdd() {
    setEditReg(null);
    setForm({ state_code: '', state_name: '', registration_number: '', status: 'registered', registration_date: '', expiration_date: '', annual_report_due: '', solicits_in_state: true });
    setShowDrawer(true);
  }

  function openEdit(reg: StateRegistration) {
    setEditReg(reg);
    setForm({
      state_code: reg.state_code,
      state_name: reg.state_name,
      registration_number: reg.registration_number || '',
      status: reg.status,
      registration_date: reg.registration_date || '',
      expiration_date: reg.expiration_date || '',
      annual_report_due: reg.annual_report_due || '',
      solicits_in_state: reg.solicits_in_state,
    });
    setShowDrawer(true);
  }

  async function handleSave() {
    setSaving(true);
    try {
      await apiRequest(`/api/org/${orgId}/compliance/state-registrations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          state_code: form.state_code.toUpperCase(),
        }),
      });
      setShowDrawer(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  const today = new Date();
  const getDaysUntilExpiry = (expDate: string | null) => {
    if (!expDate) return null;
    const diff = Math.floor((new Date(expDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const renewalOverdue = registrations.filter(r => r.status === 'renewal_overdue' || r.status === 'lapsed').length;
  const renewalPending = registrations.filter(r => r.status === 'renewal_pending').length;

  return (
    <div className="space-y-4">
      {(renewalOverdue > 0 || renewalPending > 0) && (
        <div className="flex flex-wrap gap-3">
          {renewalOverdue > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-2 text-sm text-red-800">
              <strong>{renewalOverdue}</strong> state registration{renewalOverdue !== 1 ? 's' : ''} overdue or lapsed
            </div>
          )}
          {renewalPending > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
              <strong>{renewalPending}</strong> renewal{renewalPending !== 1 ? 's' : ''} pending
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">{registrations.length} state{registrations.length !== 1 ? 's' : ''} tracked</p>
        <button onClick={openAdd}
          className="px-4 py-2 bg-azure text-white rounded-lg text-sm font-medium hover:bg-azure/90">
          + Add State
        </button>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-14 bg-gray-100 rounded-lg" />)}
        </div>
      ) : registrations.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          No state registrations tracked. Add states where you solicit or operate.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">State</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Reg #</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Expires</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Annual Report</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {registrations.map(r => {
                const daysLeft = getDaysUntilExpiry(r.expiration_date);
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-700 font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{r.state_code}</span>
                        <span className="text-gray-900 font-medium">{r.state_name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-xs">{r.registration_number || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] || 'bg-gray-100 text-gray-700'}`}>
                        {STATUS_LABELS[r.status] || r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {r.expiration_date ? (
                        <div>
                          <div className="text-gray-700">{r.expiration_date}</div>
                          {daysLeft !== null && (
                            <div className={`text-xs ${daysLeft < 0 ? 'text-red-600 font-semibold' : daysLeft <= 30 ? 'text-amber-600' : 'text-gray-400'}`}>
                              {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d remaining`}
                            </div>
                          )}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {r.annual_report_due ? (
                        <div>
                          <div>Due: {r.annual_report_due}</div>
                          {r.annual_report_filed && <div className="text-green-600">Filed: {r.annual_report_filed}</div>}
                        </div>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openEdit(r)} className="text-xs text-azure hover:text-azure/80 font-medium">Edit</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit Drawer */}
      {showDrawer && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">{editReg ? 'Edit Registration' : 'Add State Registration'}</h3>
              <button onClick={() => setShowDrawer(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State Code *</label>
                  <input value={form.state_code} onChange={e => setForm(f => ({ ...f, state_code: e.target.value.toUpperCase().slice(0, 2) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono uppercase" placeholder="CA" maxLength={2} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State Name *</label>
                  <input value={form.state_name} onChange={e => setForm(f => ({ ...f, state_name: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="California" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {Object.entries(STATUS_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number</label>
                <input value={form.registration_number} onChange={e => setForm(f => ({ ...f, registration_number: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Registration Date</label>
                  <input type="date" value={form.registration_date} onChange={e => setForm(f => ({ ...f, registration_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Expiration Date</label>
                  <input type="date" value={form.expiration_date} onChange={e => setForm(f => ({ ...f, expiration_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Annual Report Due Date</label>
                <input type="date" value={form.annual_report_due} onChange={e => setForm(f => ({ ...f, annual_report_due: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowDrawer(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700">Cancel</button>
              <button onClick={handleSave} disabled={saving || !form.state_code || !form.state_name}
                className="px-4 py-2 bg-azure text-white rounded-lg text-sm font-medium hover:bg-azure/90 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
