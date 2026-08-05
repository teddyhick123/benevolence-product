'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import PledgeCreateModal from '@/components/pledges/PledgeCreateModal';
import PledgeDetailPanel from '@/components/pledges/PledgeDetailPanel';
import { pledgeStatusBadgeClass, pledgeStatusLabel } from '@/components/pledges/pledgePalette';
import CustomFieldsPanel from '@/components/custom-fields/CustomFieldsPanel';

const LETTER_TYPE_LABELS: Record<string, string> = {
  year_end: 'Year-End',
  receipt: 'Receipt',
  qcd: 'QCD',
  non_cash: 'Non-Cash',
  general: 'General',
};

const STATUS_COLORS: Record<string, string> = {
  draft: 'border border-neutral-200 bg-neutral-100 text-neutral-700',
  sent: 'border border-green-200 bg-green-100 text-green-700',
  archived: 'border border-neutral-200 bg-neutral-100 text-neutral-500',
};

export default function DonorProfilePage() {
  const { donorId } = useParams<{ donorId: string }>();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [donor, setDonor] = useState<any>(null);
  const [contributions, setContributions] = useState<any[]>([]);
  const [letters, setLetters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generatingPdf, setGeneratingPdf] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editFields, setEditFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [showGiftForm, setShowGiftForm] = useState(false);
  const [giftFields, setGiftFields] = useState({ amount: '', date: new Date().toISOString().split('T')[0], type: 'cash', notes: '' });
  const [giftSaving, setGiftSaving] = useState(false);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [pledges, setPledges]                   = useState<any[]>([]);
  const [pledgesEnabled, setPledgesEnabled]     = useState(false);
  const [showPledgeCreate, setShowPledgeCreate] = useState(false);
  const [selectedPledgeId, setSelectedPledgeId] = useState<string | null>(null);
  const [pledgesLoading, setPledgesLoading]     = useState(false);

  useEffect(() => {
    async function fetchOrg() {
      const res = await fetch('/api/org');
      if (res.ok) {
        const data = await res.json();
        const oid = data.organizations?.[0]?.id || null;
        setOrgId(oid);
        const pledgesOn = !!(data.organizations?.[0]?.modules?.pledges);
        setPledgesEnabled(pledgesOn);
        if (pledgesOn && oid && donorId) {
          setPledgesLoading(true);
          fetch(`/api/org/${oid}/pledges?donor_id=${donorId}&status=all`)
            .then(r => r.json())
            .then(d => setPledges(d.pledges ?? []))
            .catch(() => {})
            .finally(() => setPledgesLoading(false));
        }
      }
    }
    fetchOrg();
  }, []);

  useEffect(() => {
    if (!orgId || !donorId) return;

    async function fetchDonor() {
      setLoading(true);
      try {
        const res = await fetch(`/api/org/${orgId}/donors/${donorId}`);
        if (!res.ok) throw new Error('Donor not found');
        const data = await res.json();
        setDonor(data.donor);
        setContributions(data.contributions || []);
        setLetters(data.letters || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchDonor();
  }, [orgId, donorId]);

  function startEdit() {
    setEditFields({
      first_name: donor.first_name || '',
      last_name: donor.last_name || '',
      email: donor.email || '',
      phone: donor.phone || '',
      notes: donor.notes || '',
    });
    setIsEditing(true);
  }

  async function handleSave() {
    if (!orgId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/org/${orgId}/donors/${donorId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFields),
      });
      if (!res.ok) throw new Error('Failed to save');
      const data = await res.json();
      setDonor((prev: any) => ({ ...prev, ...data.donor }));
      setIsEditing(false);
    } catch {
      // leave form open so user can retry
    } finally {
      setSaving(false);
    }
  }

  async function handleGeneratePdf(letterId: string) {
    if (!orgId) return;
    setGeneratingPdf(letterId);
    try {
      const res = await fetch(`/api/org/${orgId}/acknowledgments/${letterId}/generate-pdf`, { method: 'POST' });
      const data = await res.json();
      if (data.pdf_url) {
        setLetters(prev => prev.map(l => l.id === letterId ? { ...l, pdf_url: data.pdf_url } : l));
        window.open(data.pdf_url, '_blank');
      }
    } catch {
      // silently fail
    } finally {
      setGeneratingPdf(null);
    }
  }

  async function handleLogGift() {
    if (!orgId || !giftFields.amount) return;
    setGiftSaving(true);
    setGiftError(null);
    try {
      const res = await fetch(`/api/org/${orgId}/contributions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donor_id: donorId,
          amount: parseFloat(giftFields.amount),
          contribution_date: giftFields.date,
          gift_type: giftFields.type,
          notes: giftFields.notes || undefined,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to log gift');
      }
      // Refetch donor to update lifetime giving stats
      const donorRes = await fetch(`/api/org/${orgId}/donors/${donorId}`);
      if (donorRes.ok) {
        const data = await donorRes.json();
        setDonor(data.donor);
        setContributions(data.contributions || []);
      }
      setShowGiftForm(false);
      setGiftFields({ amount: '', date: new Date().toISOString().split('T')[0], type: 'cash', notes: '' });
    } catch (err: any) {
      setGiftError(err.message);
    } finally {
      setGiftSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-creme flex items-center justify-center">
        <p className="text-neutral-400">Loading donor profile…</p>
      </div>
    );
  }

  if (error || !donor) {
    return (
      <div className="min-h-screen bg-creme flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error || 'Donor not found'}</p>
          <Link href="/dashboard/donors" className="text-azure hover:underline">← Back to Donors</Link>
        </div>
      </div>
    );
  }

  const displayName = donor.is_anonymous
    ? 'Anonymous'
    : donor.display_name || [donor.first_name, donor.last_name].filter(Boolean).join(' ') || donor.organization_name || '—';

  return (
    <div className="min-h-screen bg-creme">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back */}
        <Link href="/dashboard/donors" className="text-sm text-azure hover:underline mb-6 block">
          ← Back to Donors
        </Link>

        {/* Donor Header */}
        <div className="rounded-2xl border border-black/5 bg-white shadow-soft p-6 mb-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-2xl font-bold text-ink">{displayName}</h1>
              <p className="text-sm text-neutral-500 mt-1 capitalize">{donor.is_organization ? 'Organization' : 'Individual'}</p>
              {!isEditing && donor.email && <p className="text-sm text-neutral-600 mt-1">{donor.email}</p>}
              {!isEditing && donor.phone && <p className="text-sm text-neutral-600">{donor.phone}</p>}
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="text-right">
                <div className="text-2xl font-bold text-azure">
                  ${Number(donor.total_lifetime_giving || 0).toLocaleString()}
                </div>
                <div className="text-xs text-neutral-500">Lifetime Giving</div>
                <div className="text-sm text-neutral-600 mt-1">{donor.total_gift_count || 0} gifts</div>
              </div>
              {!isEditing && (
                <button onClick={startEdit}
                  className="px-3 py-1.5 text-xs font-medium border border-black/10 rounded-2xl text-neutral-600 hover:bg-creme transition-colors">
                  Edit
                </button>
              )}
            </div>
          </div>

          {isEditing && (
            <div className="mt-4 pt-4 border-t border-black/5 grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { key: 'first_name', label: 'First Name' },
                { key: 'last_name', label: 'Last Name' },
                { key: 'email', label: 'Email', type: 'email' },
                { key: 'phone', label: 'Phone', type: 'tel' },
              ].map(({ key, label, type = 'text' }) => (
                <div key={key}>
                  <label className="block text-xs text-neutral-500 mb-1">{label}</label>
                  <input
                    type={type}
                    value={editFields[key] || ''}
                    onChange={e => setEditFields(f => ({ ...f, [key]: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-black/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-azure/30"
                  />
                </div>
              ))}
              <div className="sm:col-span-2">
                <label className="block text-xs text-neutral-500 mb-1">Notes</label>
                <textarea
                  rows={2}
                  value={editFields.notes || ''}
                  onChange={e => setEditFields(f => ({ ...f, notes: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-black/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-azure/30 resize-none"
                />
              </div>
              <div className="sm:col-span-2 flex gap-2 justify-end">
                <button onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 text-xs text-neutral-600 border border-black/10 rounded-2xl hover:bg-creme">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="px-3 py-1.5 text-xs font-medium bg-azure text-white rounded-2xl hover:bg-azure/90 disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-black/5">
            <div>
              <div className="text-xs text-neutral-500">Tier</div>
              <div className="text-sm font-medium text-neutral-800 capitalize">{donor.computed_tier || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Recency</div>
              <div className="text-sm font-medium text-neutral-800 capitalize">{donor.recency_status || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">First Gift</div>
              <div className="text-sm text-neutral-700">
                {donor.first_gift_date ? new Date(donor.first_gift_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-neutral-500">Last Gift</div>
              <div className="text-sm text-neutral-700">
                {donor.last_gift_date ? new Date(donor.last_gift_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
              </div>
            </div>
          </div>
        </div>

        {orgId && (
          <div className="mb-6">
            <CustomFieldsPanel orgId={orgId} entityType="donor" entityId={donorId} />
          </div>
        )}

        {/* Contribution History */}
        <div className="rounded-2xl border border-black/5 bg-white shadow-soft mb-6">
          <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
            <h2 className="font-semibold text-ink">Contribution History</h2>
            <button
              onClick={() => { setShowGiftForm(v => !v); setGiftError(null); }}
              className="px-3 py-1.5 text-xs font-medium bg-azure text-white rounded-2xl hover:bg-azure/90 transition-colors"
            >
              {showGiftForm ? 'Cancel' : '+ Log Gift'}
            </button>
          </div>
          {showGiftForm && (
            <div className="px-6 py-4 border-b border-black/5 bg-creme">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Amount ($) *</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={giftFields.amount}
                    onChange={e => setGiftFields(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00"
                    className="w-full px-3 py-2 text-sm border border-black/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-azure/30"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Date</label>
                  <input
                    type="date"
                    value={giftFields.date}
                    onChange={e => setGiftFields(f => ({ ...f, date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-black/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-azure/30"
                  />
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Type</label>
                  <select
                    value={giftFields.type}
                    onChange={e => setGiftFields(f => ({ ...f, type: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-black/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-azure/30"
                  >
                    <option value="cash">Cash</option>
                    <option value="non_cash">Non-Cash</option>
                    <option value="securities">Securities</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-neutral-500 mb-1">Notes</label>
                  <textarea
                    rows={2}
                    value={giftFields.notes}
                    onChange={e => setGiftFields(f => ({ ...f, notes: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-black/10 rounded-2xl focus:outline-none focus:ring-2 focus:ring-azure/30 resize-none"
                  />
                </div>
              </div>
              {giftError && <p className="text-xs text-red-600 mt-2">{giftError}</p>}
              <div className="flex gap-2 justify-end mt-3">
                <button
                  onClick={() => { setShowGiftForm(false); setGiftError(null); }}
                  className="px-3 py-1.5 text-xs text-neutral-600 border border-black/10 rounded-2xl hover:bg-creme"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLogGift}
                  disabled={giftSaving || !giftFields.amount}
                  className="px-3 py-1.5 text-xs font-medium bg-azure text-white rounded-2xl hover:bg-azure/90 disabled:opacity-50"
                >
                  {giftSaving ? 'Saving…' : 'Log Gift'}
                </button>
              </div>
            </div>
          )}
          {contributions.length === 0 ? (
            <div className="px-6 py-8 text-center text-neutral-400 text-sm">No contributions recorded.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-creme">
                <tr>
                  <th className="text-left px-6 py-3 font-medium text-neutral-600">Date</th>
                  <th className="text-left px-6 py-3 font-medium text-neutral-600">Type</th>
                  <th className="text-right px-6 py-3 font-medium text-neutral-600">Amount</th>
                  <th className="text-left px-6 py-3 font-medium text-neutral-600">Acknowledgment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {contributions.map(c => (
                  <tr key={c.id} className="hover:bg-creme">
                    <td className="px-6 py-3 text-neutral-700">
                      {new Date(c.contribution_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-6 py-3 text-neutral-600 capitalize">{c.gift_type}</td>
                    <td className="px-6 py-3 text-right font-medium text-ink">
                      ${Number(c.amount).toLocaleString()}
                    </td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs ${
                        c.acknowledgment_status === 'sent' ? 'border border-green-200 bg-green-100 text-green-700' :
                        c.acknowledgment_status === 'draft' ? 'border border-azure/20 bg-azure/10 text-azure-deep' :
                        'border border-sunset/30 bg-sunset/10 text-ink'
                      }`}>
                        {c.acknowledgment_status || 'pending'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Pledges */}
        {pledgesEnabled && (
          <div className="rounded-2xl border border-black/5 bg-white shadow-soft mb-6">
            <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
              <h2 className="font-semibold text-ink">Pledges</h2>
              <button
                onClick={() => setShowPledgeCreate(true)}
                className="px-3 py-1.5 text-xs font-medium bg-azure text-white rounded-2xl hover:bg-azure/90 transition-colors">
                + New Pledge
              </button>
            </div>
            {pledgesLoading ? (
              <div className="px-6 py-6 text-center text-neutral-400 text-sm">Loading…</div>
            ) : pledges.length === 0 ? (
              <div className="px-6 py-6 text-center text-neutral-400 text-sm">No pledges recorded.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-creme">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium text-neutral-600">Total</th>
                    <th className="text-left px-6 py-3 font-medium text-neutral-600">Received</th>
                    <th className="text-left px-6 py-3 font-medium text-neutral-600">Next Due</th>
                    <th className="text-left px-6 py-3 font-medium text-neutral-600">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-black/5">
                  {pledges.map((p: any) => (
                    <tr key={p.id} className="hover:bg-creme cursor-pointer" onClick={() => setSelectedPledgeId(p.id)}>
                      <td className="px-6 py-3 font-medium text-ink">${Number(p.total_amount).toLocaleString()}</td>
                      <td className="px-6 py-3 text-green-700">${Number(p.received).toLocaleString()}</td>
                      <td className="px-6 py-3 text-neutral-600">{p.next_due_date ?? '—'}</td>
                      <td className="px-6 py-3">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${pledgeStatusBadgeClass(p.pipeline_status)}`}>
                          {pledgeStatusLabel(p.pipeline_status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {showPledgeCreate && orgId && (
          <PledgeCreateModal
            orgId={orgId}
            prefillDonorId={donorId}
            prefillDonorName={displayName}
            onClose={() => setShowPledgeCreate(false)}
            onCreated={() => {
              setShowPledgeCreate(false);
              fetch(`/api/org/${orgId}/pledges?donor_id=${donorId}&status=all`)
                .then(r => r.json()).then(d => setPledges(d.pledges ?? [])).catch(() => {});
            }}
          />
        )}
        {selectedPledgeId && orgId && (
          <PledgeDetailPanel
            orgId={orgId}
            pledgeId={selectedPledgeId}
            onClose={() => setSelectedPledgeId(null)}
            onChanged={() => {
              fetch(`/api/org/${orgId}/pledges?donor_id=${donorId}&status=all`)
                .then(r => r.json()).then(d => setPledges(d.pledges ?? [])).catch(() => {});
            }}
          />
        )}

        {/* Acknowledgment Letters */}
        <div className="rounded-2xl border border-black/5 bg-white shadow-soft">
          <div className="px-6 py-4 border-b border-black/5 flex items-center justify-between">
            <h2 className="font-semibold text-ink">Acknowledgment Letters</h2>
          </div>
          {letters.length === 0 ? (
            <div className="px-6 py-8 text-center text-neutral-400 text-sm">No letters generated yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-creme">
                <tr>
                  <th className="text-left px-6 py-3 font-medium text-neutral-600">Type</th>
                  <th className="text-left px-6 py-3 font-medium text-neutral-600">Subject</th>
                  <th className="text-left px-6 py-3 font-medium text-neutral-600">Status</th>
                  <th className="text-left px-6 py-3 font-medium text-neutral-600">Created</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {letters.map(letter => (
                  <tr key={letter.id} className="hover:bg-creme">
                    <td className="px-6 py-3 text-neutral-700">
                      {LETTER_TYPE_LABELS[letter.letter_type] || letter.letter_type}
                    </td>
                    <td className="px-6 py-3 text-neutral-600 max-w-xs truncate">{letter.subject || '—'}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[letter.status] || STATUS_COLORS.draft}`}>
                        {letter.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-neutral-500">
                      {new Date(letter.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {letter.pdf_url ? (
                        <a href={letter.pdf_url} target="_blank" rel="noopener noreferrer"
                          className="text-azure hover:underline text-xs">
                          View PDF
                        </a>
                      ) : (
                        <button
                          onClick={() => handleGeneratePdf(letter.id)}
                          disabled={generatingPdf === letter.id}
                          className="text-azure hover:underline text-xs disabled:opacity-50"
                        >
                          {generatingPdf === letter.id ? 'Generating…' : 'Generate PDF'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
