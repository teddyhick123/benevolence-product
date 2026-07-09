'use client';

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const TIER_OPTIONS = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'small', label: 'Small' },
  { value: 'regular', label: 'Regular' },
  { value: 'mid_major', label: 'Mid-Major' },
  { value: 'major', label: 'Major' },
];

function NewDonorLoading() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-40 rounded-2xl bg-neutral-200"></div>
        <div className="h-64 rounded-2xl bg-neutral-200"></div>
        <div className="h-48 rounded-2xl bg-neutral-200"></div>
      </div>
    </div>
  );
}

function NewDonorPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [orgId, setOrgId] = useState<string | null>(searchParams.get('org'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isOrg, setIsOrg] = useState(false);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    organization_name: '',
    preferred_name: '',
    email: '',
    phone: '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    zip: '',
    country: 'US',
    tier: 'prospect',
    notes: '',
  });

  useEffect(() => {
    if (!orgId) {
      fetch('/api/org', { cache: 'no-store' })
        .then(r => r.json())
        .then(d => {
          const first = d.organizations?.[0];
          if (first) setOrgId(first.id);
        })
        .catch(() => {});
    }
  }, [orgId]);

  function set(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId) return;
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/org/${orgId}/donors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, is_organization: isOrg }),
      });

      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Failed to create donor');
      }

      router.push(`/dashboard/donors`);
    } catch (err: any) {
      setError(err.message);
      setSaving(false);
    }
  }

  const inputCls = 'w-full px-3 py-2 text-sm border border-black/15 rounded-2xl focus:outline-none focus:ring-2 focus:ring-azure/30 bg-white';
  const labelCls = 'block text-sm font-medium text-neutral-700 mb-1';

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-neutral-500 hover:text-neutral-700 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>
        <h1 className="text-2xl font-bold text-ink mt-3">Add Donor</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Donor type toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setIsOrg(false)}
            className={`px-4 py-2 text-sm rounded-2xl border transition-colors ${!isOrg ? 'bg-azure text-white border-azure' : 'bg-white text-neutral-700 border-black/15 hover:bg-neutral-50'}`}
          >
            Individual
          </button>
          <button
            type="button"
            onClick={() => setIsOrg(true)}
            className={`px-4 py-2 text-sm rounded-2xl border transition-colors ${isOrg ? 'bg-azure text-white border-azure' : 'bg-white text-neutral-700 border-black/15 hover:bg-neutral-50'}`}
          >
            Organization
          </button>
        </div>

        <div className="bg-white rounded-2xl border border-black/10 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Identity</h2>

          {isOrg ? (
            <div>
              <label className={labelCls}>Organization Name *</label>
              <input
                type="text"
                required
                value={form.organization_name}
                onChange={e => set('organization_name', e.target.value)}
                className={inputCls}
                placeholder="Acme Foundation"
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>First Name</label>
                <input
                  type="text"
                  value={form.first_name}
                  onChange={e => set('first_name', e.target.value)}
                  className={inputCls}
                  placeholder="Jane"
                />
              </div>
              <div>
                <label className={labelCls}>Last Name</label>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={e => set('last_name', e.target.value)}
                  className={inputCls}
                  placeholder="Smith"
                />
              </div>
            </div>
          )}

          <div>
            <label className={labelCls}>Preferred Name / Nickname</label>
            <input
              type="text"
              value={form.preferred_name}
              onChange={e => set('preferred_name', e.target.value)}
              className={inputCls}
              placeholder="Optional"
            />
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-black/10 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Contact</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                className={inputCls}
                placeholder="jane@example.com"
              />
            </div>
            <div>
              <label className={labelCls}>Phone</label>
              <input
                type="tel"
                value={form.phone}
                onChange={e => set('phone', e.target.value)}
                className={inputCls}
                placeholder="+1 (555) 000-0000"
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Address Line 1</label>
            <input
              type="text"
              value={form.address_line1}
              onChange={e => set('address_line1', e.target.value)}
              className={inputCls}
              placeholder="123 Main St"
            />
          </div>
          <div>
            <label className={labelCls}>Address Line 2</label>
            <input
              type="text"
              value={form.address_line2}
              onChange={e => set('address_line2', e.target.value)}
              className={inputCls}
              placeholder="Suite 100"
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={labelCls}>City</label>
              <input
                type="text"
                value={form.city}
                onChange={e => set('city', e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>State</label>
              <input
                type="text"
                value={form.state}
                onChange={e => set('state', e.target.value)}
                className={inputCls}
                placeholder="CA"
                maxLength={2}
              />
            </div>
            <div>
              <label className={labelCls}>ZIP</label>
              <input
                type="text"
                value={form.zip}
                onChange={e => set('zip', e.target.value)}
                className={inputCls}
                placeholder="94105"
              />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-black/10 p-6 space-y-4">
          <h2 className="text-sm font-semibold text-ink uppercase tracking-wide">Classification</h2>
          <div>
            <label className={labelCls}>Donor Tier</label>
            <select
              value={form.tier}
              onChange={e => set('tier', e.target.value)}
              className={inputCls}
            >
              {TIER_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              className={inputCls}
              placeholder="Any notes about this donor…"
            />
          </div>
        </div>

        {error && (
          <div className="rounded-2xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-sm font-medium text-neutral-700 bg-white border border-black/15 rounded-2xl hover:bg-neutral-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !orgId}
            className="px-4 py-2 text-sm font-medium text-white bg-azure rounded-2xl hover:bg-azure/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving…' : 'Add Donor'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NewDonorPage() {
  return (
    <Suspense fallback={<NewDonorLoading />}>
      <NewDonorPageContent />
    </Suspense>
  );
}
