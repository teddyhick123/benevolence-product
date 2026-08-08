'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useState, useEffect, useRef } from 'react';

interface DisqualifiedPerson {
  id: string;
  full_name: string;
  relationship_type: string;
  title_or_role: string | null;
  ein: string | null;
  ssn_last4: string | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
  notes: string | null;
}

interface Props {
  orgId: string;
}

const RELATIONSHIP_LABELS: Record<string, string> = {
  founder: 'Founder',
  substantial_contributor: 'Substantial Contributor',
  foundation_manager: 'Foundation Manager',
  twenty_pct_owner: '20%+ Owner',
  family_member: 'Family Member',
  thirty_five_pct_owned_entity: '35%+ Owned Entity',
  government_official: 'Government Official',
};

const RELATIONSHIP_COLORS: Record<string, string> = {
  founder: 'bg-purple-100 text-purple-800',
  substantial_contributor: 'bg-blue-100 text-blue-800',
  foundation_manager: 'bg-indigo-100 text-indigo-800',
  twenty_pct_owner: 'bg-cyan-100 text-cyan-800',
  family_member: 'bg-teal-100 text-teal-800',
  thirty_five_pct_owned_entity: 'bg-orange-100 text-orange-800',
  government_official: 'bg-gray-100 text-gray-800',
};

export default function DisqualifiedPersonsRegistry({ orgId }: Props) {
  const [persons, setPersons] = useState<DisqualifiedPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [screenName, setScreenName] = useState('');
  const [screenResult, setScreenResult] = useState<any>(null);
  const [screening, setScreening] = useState(false);
  const [adding, setAdding] = useState(false);
  const [terminating, setTerminating] = useState<string | null>(null);
  const [form, setForm] = useState({
    full_name: '', relationship_type: 'foundation_manager', title_or_role: '',
    ein: '', ssn_last4: '', start_date: new Date().toISOString().split('T')[0], notes: '',
  });

  async function load() {
    setLoading(true);
    try {
      const url = `/api/org/${orgId}/compliance/disqualified-persons?active_only=${!showInactive}${search ? `&q=${encodeURIComponent(search)}` : ''}`;
      const res = await apiRequest(url);
      const json = await readJson(res);
      setPersons(json.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [orgId, showInactive, search]);

  async function handleAdd() {
    setAdding(true);
    try {
      const res = await apiRequest(`/api/org/${orgId}/compliance/disqualified-persons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await readJson(res)).error);
      setShowAddModal(false);
      setForm({ full_name: '', relationship_type: 'foundation_manager', title_or_role: '', ein: '', ssn_last4: '', start_date: new Date().toISOString().split('T')[0], notes: '' });
      await load();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleTerminate(id: string) {
    if (!confirm('Soft-terminate this person? (Sets end date to today — record is retained for audit purposes.)')) return;
    setTerminating(id);
    try {
      await apiRequest(`/api/org/${orgId}/compliance/disqualified-persons?id=${id}`, { method: 'DELETE' });
      await load();
    } finally {
      setTerminating(null);
    }
  }

  async function handleScreen() {
    if (!screenName.trim()) return;
    setScreening(true);
    setScreenResult(null);
    try {
      const res = await apiRequest(`/api/org/${orgId}/compliance/disqualified-persons?q=${encodeURIComponent(screenName)}&active_only=true`);
      const json = await readJson(res);
      const persons = json.data || [];
      const matches = persons.filter((p: DisqualifiedPerson) =>
        p.full_name.toLowerCase().includes(screenName.toLowerCase())
      );
      setScreenResult({
        risk_level: matches.length === 0 ? 'none' : 'flagged',
        matches,
      });
    } finally {
      setScreening(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <svg className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} className="rounded" />
          Show terminated
        </label>
        <button
          onClick={() => setShowAddModal(true)}
          className="ml-auto px-4 py-2 bg-azure text-white rounded-lg text-sm font-medium hover:bg-azure/90 transition-colors"
        >
          + Add Person
        </button>
      </div>

      {/* Quick Screen */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm font-medium text-amber-900 mb-2">Quick Transaction Screen</p>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Enter counterparty name to screen..."
            value={screenName}
            onChange={e => setScreenName(e.target.value)}
            className="flex-1 px-3 py-2 border border-amber-300 rounded-lg text-sm bg-white"
            onKeyDown={e => e.key === 'Enter' && handleScreen()}
          />
          <button
            onClick={handleScreen}
            disabled={screening}
            className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
          >
            {screening ? 'Screening...' : 'Screen'}
          </button>
        </div>
        {screenResult && (
          <div className={`mt-3 p-3 rounded-lg text-sm ${screenResult.risk_level === 'none' ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
            {screenResult.risk_level === 'none'
              ? '✓ No disqualified person match found.'
              : `⚠ ${screenResult.matches.length} potential match(es): ${screenResult.matches.map((m: DisqualifiedPerson) => m.full_name).join(', ')}. Review before proceeding.`}
          </div>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="animate-pulse space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 rounded" />)}
        </div>
      ) : persons.length === 0 ? (
        <div className="text-center py-10 text-gray-400 text-sm">
          No disqualified persons registered.
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Name</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Relationship</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">EIN / SSN</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Since</th>
                <th className="text-left px-4 py-3 text-gray-600 font-medium">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {persons.map(p => (
                <tr key={p.id} className={`hover:bg-gray-50 ${!p.is_active ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{p.full_name}</div>
                    {p.title_or_role && <div className="text-xs text-gray-500">{p.title_or_role}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${RELATIONSHIP_COLORS[p.relationship_type] || 'bg-gray-100 text-gray-800'}`}>
                      {RELATIONSHIP_LABELS[p.relationship_type] || p.relationship_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 font-mono text-xs">
                    {p.ein ? `EIN: ${p.ein}` : p.ssn_last4 ? `SSN: ***-**-${p.ssn_last4}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-600">{p.start_date}</td>
                  <td className="px-4 py-3">
                    {p.is_active
                      ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800 font-medium"><span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />Active</span>
                      : <span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-600">Terminated {p.end_date}</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {p.is_active && (
                      <button
                        onClick={() => handleTerminate(p.id)}
                        disabled={terminating === p.id}
                        className="text-xs text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        Terminate
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Person Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Register Disqualified Person</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Full Legal Name *</label>
                <input value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Jane Smith" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Relationship Type *</label>
                <select value={form.relationship_type} onChange={e => setForm(f => ({ ...f, relationship_type: e.target.value }))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  {Object.entries(RELATIONSHIP_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title / Role</label>
                  <input value={form.title_or_role} onChange={e => setForm(f => ({ ...f, title_or_role: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" placeholder="Trustee" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">EIN (entities)</label>
                  <input value={form.ein} onChange={e => setForm(f => ({ ...f, ein: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" placeholder="12-3456789" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">SSN Last 4 (individuals)</label>
                  <input value={form.ssn_last4} onChange={e => setForm(f => ({ ...f, ssn_last4: e.target.value.slice(0, 4) }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono" placeholder="1234" maxLength={4} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 justify-end pt-2">
              <button onClick={() => setShowAddModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50">Cancel</button>
              <button onClick={handleAdd} disabled={adding || !form.full_name}
                className="px-4 py-2 bg-azure text-white rounded-lg text-sm font-medium hover:bg-azure/90 disabled:opacity-50">
                {adding ? 'Adding...' : 'Add to Registry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
