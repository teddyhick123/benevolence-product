'use client';

import { apiRequest, readJson } from '@/lib/api/client';

import { Suspense, type ReactNode, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { pickActiveOrg } from '@/lib/organizations/active-org';
import { Button, Card, EmptyState, Input, PageHeader, Select } from '@/components/ui';

const TIER_LABELS: Record<string, string> = {
  major: 'Major',
  mid_major: 'Mid-Major',
  regular: 'Regular',
  small: 'Small',
  prospect: 'Prospect',
};

const TIER_COLORS: Record<string, string> = {
  major: 'border border-coral/20 bg-coral/10 text-ink',
  mid_major: 'border border-azure/20 bg-azure/10 text-azure-deep',
  regular: 'border border-azure/20 bg-azure/10 text-azure-deep',
  small: 'border border-neutral-200 bg-neutral-100 text-neutral-700',
  prospect: 'border border-sunset/20 bg-sunset/10 text-ink',
};

const RECENCY_COLORS: Record<string, string> = {
  new: 'border border-azure/20 bg-azure/10 text-azure-deep',
  active: 'border border-azure/20 bg-azure/10 text-azure-deep',
  lapsed: 'border border-sunset/20 bg-sunset/10 text-ink',
  lost: 'bg-red-100 text-red-700',
  prospect: 'border border-neutral-200 bg-neutral-100 text-neutral-600',
};

function formatCurrency(value: unknown) {
  return `$${Number(value || 0).toLocaleString()}`;
}

function formatDate(value: unknown) {
  return value
    ? new Date(String(value)).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    : '—';
}

function DonorPill({ className, children }: { className: string; children: ReactNode }) {
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${className}`}>{children}</span>;
}

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
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [recencyFilter, setRecencyFilter] = useState('');
  const [sortKey, setSortKey] = useState<string>('total_lifetime_giving');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

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
    if (sortKey === key) setSortDir((direction) => direction === 'asc' ? 'desc' : 'asc');
    else {
      setSortKey(key);
      setSortDir('asc');
    }
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
    <span className="ml-1" aria-hidden="true">{sortDir === 'asc' ? '↑' : '↓'}</span>
  );
  const hasActiveFilters = Boolean(search || tierFilter || recencyFilter);
  const totalLabel = `${total !== null ? total.toLocaleString() : donors.length.toLocaleString()} total records`;
  const donorUrl = (donorId: string) => `/dashboard/donors/${donorId}?org=${encodeURIComponent(orgId ?? '')}`;
  const addDonorUrl = orgId ? `/dashboard/donors/new?org=${encodeURIComponent(orgId)}` : '#';

  if (moduleEnabled === false) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <EmptyState
          className="mx-4 max-w-lg"
          title="Donor Management not enabled"
          description="The Donor Management module is not enabled for your organization. Contact your administrator to enable it."
        />
      </div>
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <PageHeader
        eyebrow="Donor management"
        title="Donors"
        description={totalLabel}
        actions={(
          <a href={addDonorUrl} className="ui-focus-ring inline-flex min-h-10 items-center justify-center rounded-xl bg-azure px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-azure-deep">
            Add donor
          </a>
        )}
      />

      <Card padding="sm" className="mt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="block min-w-0 flex-1 text-sm font-medium text-ink" htmlFor="donor-search">
            Search donors
            <Input id="donor-search" type="search" placeholder="Name or email" value={search} onChange={(event) => setSearch(event.target.value)} className="mt-1.5 w-full" />
          </label>
          <label className="block text-sm font-medium text-ink" htmlFor="donor-tier-filter">
            Tier
            <Select id="donor-tier-filter" value={tierFilter} onChange={(event) => setTierFilter(event.target.value)} className="mt-1.5 w-full sm:w-40">
              <option value="">All tiers</option>
              {Object.entries(TIER_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
          </label>
          <label className="block text-sm font-medium text-ink" htmlFor="donor-recency-filter">
            Relationship
            <Select id="donor-recency-filter" value={recencyFilter} onChange={(event) => setRecencyFilter(event.target.value)} className="mt-1.5 w-full sm:w-40">
              <option value="">All statuses</option>
              <option value="new">New</option>
              <option value="active">Active</option>
              <option value="lapsed">Lapsed</option>
              <option value="lost">Lost</option>
              <option value="prospect">Prospect</option>
            </Select>
          </label>
          {hasActiveFilters ? (
            <Button variant="quiet" size="md" className="shrink-0" onClick={() => { setSearch(''); setTierFilter(''); setRecencyFilter(''); }}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </Card>

      <Card padding="none" className="mt-6 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-ink/50" role="status">Loading donors…</div>
        ) : error ? (
          <div className="p-12 text-center text-[#b95640]" role="alert">{error}</div>
        ) : donors.length === 0 ? (
          <EmptyState
            className="rounded-none border-0 shadow-none"
            title={hasActiveFilters ? 'No matching donors' : 'No donors yet'}
            description={hasActiveFilters ? 'Try adjusting or clearing your filters.' : 'Add your first donor to begin tracking relationships and giving.'}
            action={!hasActiveFilters ? <a href={addDonorUrl} className="ui-focus-ring inline-flex min-h-10 items-center justify-center rounded-xl bg-azure px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-azure-deep">Add donor</a> : undefined}
          />
        ) : (
          <>
            <div className="border-b border-ink/10 bg-azure/[0.035] px-5 py-3 text-sm text-ink/60 md:hidden">
              Tap a donor to view their relationship details.
            </div>
            <div className="divide-y divide-ink/10 md:hidden">
              {sortedDonors.map((donor) => (
                <button key={donor.id} type="button" className="block w-full px-5 py-4 text-left transition-colors hover:bg-azure/[0.04] focus-visible:bg-azure/[0.06]" onClick={() => router.push(donorUrl(donor.id))}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-ink">{donor.is_anonymous ? 'Anonymous' : donor.display_name || '—'}</p>
                      <p className="mt-1 truncate text-xs text-ink/55">{donor.email || (donor.is_organization ? 'Organization' : 'Individual')}</p>
                    </div>
                    <p className="shrink-0 text-right font-medium text-ink">{formatCurrency(donor.total_lifetime_giving)}</p>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <DonorPill className={TIER_COLORS[donor.computed_tier] || TIER_COLORS.prospect}>{TIER_LABELS[donor.computed_tier] || donor.computed_tier}</DonorPill>
                    <DonorPill className={RECENCY_COLORS[donor.recency_status] || RECENCY_COLORS.prospect}>{donor.recency_status ? donor.recency_status.charAt(0).toUpperCase() + donor.recency_status.slice(1) : '—'}</DonorPill>
                    <span className="text-xs text-ink/55">Last gift {formatDate(donor.last_gift_date)}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
              <table className="min-w-[760px] w-full text-sm">
                <thead className="border-b border-ink/10 bg-azure/[0.035]">
                  <tr>
                    {[
                      { key: 'display_name', label: 'Name', align: 'left' },
                      { key: 'is_organization', label: 'Type', align: 'left' },
                      { key: 'computed_tier', label: 'Tier', align: 'left' },
                      { key: 'total_lifetime_giving', label: 'Lifetime giving', align: 'right' },
                      { key: 'recency_status', label: 'Relationship', align: 'left' },
                      { key: 'last_gift_date', label: 'Last gift', align: 'left' },
                    ].map(({ key, label, align }) => (
                      <th key={key} className={`${align === 'right' ? 'text-right' : 'text-left'} px-4 py-3`} aria-sort={sortKey === key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                        <button type="button" className={`ui-focus-ring inline-flex items-center rounded-md font-medium text-ink/65 transition-colors hover:text-ink ${align === 'right' ? 'ml-auto' : ''}`} onClick={() => toggleSort(key)}>
                          {label}<SortIcon col={key} />
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink/10">
                  {sortedDonors.map((donor) => (
                    <tr key={donor.id} className="cursor-pointer transition-colors hover:bg-azure/[0.04]" onClick={() => router.push(donorUrl(donor.id))}>
                      <td className="px-4 py-3">
                        <span className="font-medium text-ink">{donor.is_anonymous ? 'Anonymous' : donor.display_name || '—'}</span>
                        {donor.email ? <div className="text-xs text-ink/50">{donor.email}</div> : null}
                      </td>
                      <td className="px-4 py-3 capitalize text-ink/65">{donor.is_organization ? 'Organization' : 'Individual'}</td>
                      <td className="px-4 py-3"><DonorPill className={TIER_COLORS[donor.computed_tier] || TIER_COLORS.prospect}>{TIER_LABELS[donor.computed_tier] || donor.computed_tier}</DonorPill></td>
                      <td className="px-4 py-3 text-right font-medium text-ink">{formatCurrency(donor.total_lifetime_giving)}</td>
                      <td className="px-4 py-3"><DonorPill className={RECENCY_COLORS[donor.recency_status] || RECENCY_COLORS.prospect}>{donor.recency_status ? donor.recency_status.charAt(0).toUpperCase() + donor.recency_status.slice(1) : '—'}</DonorPill></td>
                      <td className="px-4 py-3 text-ink/60">{formatDate(donor.last_gift_date)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </main>
  );
}

export default function DonorsPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-ink/50">Loading donors…</div>}>
      <DonorsPageContent />
    </Suspense>
  );
}
