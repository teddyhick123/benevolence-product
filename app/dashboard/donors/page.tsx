'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { Suspense, useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { pickActiveOrg } from '@/lib/organizations/active-org';

const TIER_LABELS: Record<string, string> = {
  major: 'Major',
  mid_major: 'Mid-Major',
  regular: 'Regular',
  small: 'Small',
  prospect: 'Prospect',
};

const TIER_COLORS: Record<string, string> = {
  major: 'bg-coral/10 text-ink border border-coral/20',
  mid_major: 'bg-azure/10 text-azure-deep border border-azure/20',
  regular: 'bg-azure/10 text-azure-deep border border-azure/20',
  small: 'bg-neutral-100 text-neutral-700 border border-neutral-200',
  prospect: 'bg-sunset/10 text-ink border border-sunset/20',
};

const RECENCY_COLORS: Record<string, string> = {
  new: 'bg-azure/10 text-azure-deep border border-azure/20',
  active: 'bg-azure/10 text-azure-deep border border-azure/20',
  lapsed: 'bg-sunset/10 text-ink border border-sunset/20',
  lost: 'bg-red-100 text-red-700',
  prospect: 'bg-neutral-100 text-neutral-600 border border-neutral-200',
};

function DonorsPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedOrgId = searchParams.get('org');
  const [orgId, setOrgId] = useState<string | null>(requestedOrgId);
  const [moduleEnabled, setModuleEnabled] = useState<boolean | null>(null);
  const [donors, setDonors] = useState<any[]>([]);
  const [total, setTotal] = useState<number | null>(null);
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
        const res = await apiRequest('/api/org');
        if (res.ok) {
          const data = await readJson(res);
          const organizations = (data.organizations ?? []) as Array<{ id: string; modules?: Record<string, boolean> }>;
          const scopedOrg = requestedOrgId
            ? organizations.find((organization) => organization.id === requestedOrgId)
            : pickActiveOrg(organizations);
          if (scopedOrg) {
            setOrgId(scopedOrg.id);
            setModuleEnabled(!!scopedOrg.modules?.donors || !!scopedOrg.modules?.donor_management);
          } else if (requestedOrgId) {
            setError('That organization is not available to your account.');
            setLoading(false);
          }
        }
      } catch {
        setError('Failed to load organization');
      }
    }
    fetchOrg();
  }, [requestedOrgId]);

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

        const res = await apiRequest(`/api/org/${orgId}/donors?${qs}`);
        if (!res.ok) throw new Error('Failed to load donors');
        const data = await readJson(res);
        setDonors(data.donors || []);
        setTotal(data.total ?? data.donors?.length ?? 0);
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
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center max-w-sm">
          <h2 className="mb-2 font-serif text-xl font-medium text-ink">Donor Management not enabled</h2>
          <p className="text-sm text-neutral-600">The Donor Management module is not enabled for your organization. Contact your administrator to enable it.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-serif text-3xl font-medium text-ink">Donors</h1>
            <p className="mt-1 text-sm text-neutral-600">{`${total !== null ? total.toLocaleString() : donors.length} total records`}</p>
          </div>
          <a
            href={orgId ? `/dashboard/donors/new?org=${encodeURIComponent(orgId)}` : '#'}
            className="rounded-2xl bg-azure px-4 py-2 text-sm font-medium text-white shadow-soft transition-opacity hover:opacity-90"
          >
            + Add Donor
          </a>
        </div>

        {/* Filters */}
        <div className="mb-6 flex flex-wrap gap-3 rounded-2xl border border-black/5 bg-white p-4 shadow-soft">
          <input
            type="text"
            placeholder="Search by name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="min-w-[180px] flex-1 rounded-2xl border border-black/10 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
          />
          <select
            value={tierFilter}
            onChange={e => setTierFilter(e.target.value)}
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
          >
            <option value="">All Tiers</option>
            {Object.entries(TIER_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <select
            value={recencyFilter}
            onChange={e => setRecencyFilter(e.target.value)}
            className="rounded-2xl border border-black/10 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-azure/30"
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
        <div className="overflow-hidden rounded-2xl border border-black/5 bg-white shadow-soft">
          {loading ? (
            <div className="p-12 text-center text-neutral-400">Loading donors…</div>
          ) : error ? (
            <div className="p-12 text-center text-red-500">{error}</div>
          ) : donors.length === 0 ? (
            <div className="p-12 text-center text-neutral-400">No donors found.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-black/5 bg-neutral-50">
                <tr>
                  {[
                    { key: 'display_name', label: 'Name', align: 'left' },
                    { key: 'is_organization', label: 'Type', align: 'left' },
                    { key: 'computed_tier', label: 'Tier', align: 'left' },
                    { key: 'total_lifetime_giving', label: 'Lifetime Giving', align: 'right' },
                    { key: 'recency_status', label: 'Recency', align: 'left' },
                    { key: 'last_gift_date', label: 'Last Gift', align: 'left' },
                  ].map(({ key, label, align }) => (
                    <th key={key}
                      className={`${align === 'right' ? 'text-right' : 'text-left'} cursor-pointer select-none px-4 py-3 font-medium text-neutral-600 hover:text-ink`}
                      onClick={() => toggleSort(key)}
                    >
                      {label}<SortIcon col={key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {sortedDonors.map(donor => (
                  <tr
                    key={donor.id}
                    className="cursor-pointer transition-colors hover:bg-neutral-50"
                    onClick={() => router.push(`/dashboard/donors/${donor.id}?org=${encodeURIComponent(orgId ?? '')}`)}
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-ink">
                        {donor.is_anonymous ? 'Anonymous' : donor.display_name || '—'}
                      </span>
                      {donor.email && (
                        <div className="text-xs text-neutral-400">{donor.email}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-neutral-600 capitalize">{donor.is_organization ? 'Organization' : 'Individual'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${TIER_COLORS[donor.computed_tier] || TIER_COLORS.prospect}`}>
                        {TIER_LABELS[donor.computed_tier] || donor.computed_tier}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-ink">
                      ${Number(donor.total_lifetime_giving || 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${RECENCY_COLORS[donor.recency_status] || RECENCY_COLORS.prospect}`}>
                        {donor.recency_status ? donor.recency_status.charAt(0).toUpperCase() + donor.recency_status.slice(1) : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-neutral-500">
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

export default function DonorsPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-neutral-400">Loading donors…</div>}>
      <DonorsPageContent />
    </Suspense>
  );
}
