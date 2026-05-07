'use client';

import { useState, useEffect } from 'react';
import { pickActiveOrg } from '@/lib/org-cookie';

const TIER_LABELS: Record<string, string> = {
  major: 'Major',
  mid_major: 'Mid-Major',
  regular: 'Regular',
  small: 'Small',
  prospect: 'Prospect',
};

const TIER_COLORS: Record<string, string> = {
  major: 'bg-violet-100 text-violet-800',
  mid_major: 'bg-blue-100 text-blue-800',
  regular: 'bg-green-100 text-green-800',
  small: 'bg-gray-100 text-gray-700',
  prospect: 'bg-yellow-100 text-yellow-800',
};

const RECENCY_COLORS: Record<string, string> = {
  new: 'bg-emerald-100 text-emerald-800',
  active: 'bg-green-100 text-green-800',
  lapsed: 'bg-amber-100 text-amber-800',
  lost: 'bg-red-100 text-red-700',
  prospect: 'bg-gray-100 text-gray-600',
};

export default function DonorsPage() {
  const [orgId, setOrgId] = useState<string | null>(null);
  const [moduleEnabled, setModuleEnabled] = useState<boolean | null>(null);
  const [donors, setDonors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [recencyFilter, setRecencyFilter] = useState('');

  // Sorting
  const [sortKey, setSortKey] = useState<string>('total_lifetime_giving');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  // Fetch current org
  useEffect(() => {
    async function fetchOrg() {
      try {
        const res = await fetch('/api/org');
        if (res.ok) {
          const data = await res.json();
          const activeOrg = pickActiveOrg(data.organizations ?? []);
          if (activeOrg) {
            setOrgId(activeOrg.id);
            setModuleEnabled(!!activeOrg.modules?.donors);
          }
        }
      } catch {
        setError('Failed to load organization');
      }
    }
    fetchOrg();
  }, []);

  // Fetch donors
  useEffect(() => {
    if (!orgId) return;

    async function fetchDonors() {
      setLoading(true);
      setError(null);
      try {
        const qs = new URLSearchParams({ limit: '500' });
        if (search) qs.set('name', search);
        if (tierFilter) qs.set('donor_tier', tierFilter);
        if (recencyFilter) qs.set('recency_status', recencyFilter);

        const res = await fetch(`/api/org/${orgId}/donors?${qs}`);
        if (!res.ok) throw new Error('Failed to load donors');
        const data = await res.json();
        setDonors(data.donors || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchDonors();
  }, [orgId, search, tierFilter, recencyFilter]);

  function toggleSort(key: string) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  }

  const sortedDonors = [...donors].sort((a, b) => {
    let av = a[sortKey];
    let bv = b[sortKey];
    if (sortKey === 'display_name') {
      av = a.is_anonymous ? 'Anonymous' : (a.display_name || '');
      bv = b.is_anonymous ? 'Anonymous' : (b.display_name || '');
    }
    if (typeof av === 'number' && typeof bv === 'number') return sortDir === 'asc' ? av - bv : bv - av;
    return sortDir === 'asc'
      ? String(av ?? '').localeCompare(String(bv ?? ''))
      : String(bv ?? '').localeCompare(String(av ?? ''));
  });

  const SortIcon = ({ col }: { col: string }) => sortKey !== col ? null : (
    <span className="ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  );

  if (moduleEnabled === false) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Donor Management not enabled</h2>
          <p className="text-sm text-gray-500">The Donor Management module is not enabled for your organization. Contact your administrator to enable it.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Donors</h1>
            <p className="text-sm text-gray-500 mt-1">{donors.length} total records</p>
          </div>
          <a
            href={orgId ? `/dashboard/donors/new?org=${orgId}` : '#'}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-md hover:bg-indigo-700 transition-colors"
          >
            + Add Donor
          </a>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-6 flex flex-wrap gap-3">
          <input
            type="text"
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 min-w-[180px] px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <select
            value={tierFilter}
            onChange={e => setTierFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Tiers</option>
            {Object.entries(TIER_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={recencyFilter}
            onChange={e => setRecencyFilter(e.target.value)}
            className="px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">All Recency</option>
            <option value="new">New</option>
            <option value="active">Active</option>
            <option value="lapsed">Lapsed</option>
            <option value="lost">Lost</option>
            <option value="prospect">Prospect</option>
          </select>
        </div>

        {/* Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Loading donors…</div>
          ) : error ? (
            <div className="p-12 text-center text-red-500">{error}</div>
          ) : donors.length === 0 ? (
            <div className="p-12 text-center text-gray-400">No donors found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {[
                    { key: 'display_name', label: 'Name', align: 'left' },
                    { key: 'donor_type', label: 'Type', align: 'left' },
                    { key: 'computed_tier', label: 'Tier', align: 'left' },
                    { key: 'total_lifetime_giving', label: 'Lifetime Giving', align: 'right' },
                    { key: 'recency_status', label: 'Recency', align: 'left' },
                    { key: 'last_gift_date', label: 'Last Gift', align: 'left' },
                  ].map(({ key, label, align }) => (
                    <th key={key}
                      className={`text-${align} px-4 py-3 font-medium text-gray-600 cursor-pointer select-none hover:text-gray-900`}
                      onClick={() => toggleSort(key)}
                    >
                      {label}<SortIcon col={key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sortedDonors.map(donor => (
                  <tr
                    key={donor.id}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => window.location.href = `/dashboard/donors/${donor.id}`}
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">
                        {donor.is_anonymous ? 'Anonymous' : donor.display_name || '—'}
                      </span>
                      {donor.email && (
                        <div className="text-xs text-gray-400">{donor.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-600 capitalize">{donor.donor_type}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TIER_COLORS[donor.computed_tier] || TIER_COLORS.prospect}`}>
                        {TIER_LABELS[donor.computed_tier] || donor.computed_tier}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-gray-900">
                      ${Number(donor.total_lifetime_giving || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${RECENCY_COLORS[donor.recency_status] || RECENCY_COLORS.prospect}`}>
                        {donor.recency_status ? donor.recency_status.charAt(0).toUpperCase() + donor.recency_status.slice(1) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {donor.last_gift_date
                        ? new Date(donor.last_gift_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
                        : '—'}
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
