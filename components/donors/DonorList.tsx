'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase-browser';

type DonorSummary = {
  donor_id: string;
  donor_type: string;
  display_name: string;
  email: string | null;
  is_anonymous: boolean;
  total_lifetime_giving: number;
  total_ytd_giving: number;
  gift_count: number;
  last_gift_date: string | null;
  donor_tier: string;
  recency_status: string;
  has_pending_receipts: boolean;
  has_pending_acknowledgments: boolean;
};

interface Props {
  organizationId: string;
  onDonorSelect?: (donorId: string) => void;
}

export default function DonorList({ organizationId, onDonorSelect }: Props) {
  const [loading, setLoading] = useState(true);
  const [donors, setDonors] = useState<DonorSummary[]>([]);
  const [filteredDonors, setFilteredDonors] = useState<DonorSummary[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [donorTypeFilter, setDonorTypeFilter] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [pendingFilter, setPendingFilter] = useState('');

  // Sorting
  const [sortField, setSortField] = useState<'display_name' | 'total_lifetime_giving' | 'last_gift_date' | 'gift_count'>('total_lifetime_giving');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const fetchDonors = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('v_donor_summary')
        .select('*')
        .eq('organization_id', organizationId)
        .order(sortField, { ascending: sortDir === 'asc' });

      if (error) throw error;
      setDonors(data || []);
    } catch (err) {
      console.error('Error fetching donors:', err);
    } finally {
      setLoading(false);
    }
  }, [organizationId, sortField, sortDir]);

  useEffect(() => {
    fetchDonors();
  }, [fetchDonors]);

  // Apply client-side filters
  useEffect(() => {
    let filtered = [...donors];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(d =>
        d.display_name?.toLowerCase().includes(query) ||
        d.email?.toLowerCase().includes(query)
      );
    }

    if (donorTypeFilter) {
      filtered = filtered.filter(d => d.donor_type === donorTypeFilter);
    }

    if (tierFilter) {
      filtered = filtered.filter(d => d.donor_tier === tierFilter);
    }

    if (statusFilter) {
      filtered = filtered.filter(d => d.recency_status === statusFilter);
    }

    if (pendingFilter === 'receipts') {
      filtered = filtered.filter(d => d.has_pending_receipts);
    } else if (pendingFilter === 'acknowledgments') {
      filtered = filtered.filter(d => d.has_pending_acknowledgments);
    }

    setFilteredDonors(filtered);
  }, [donors, searchQuery, donorTypeFilter, tierFilter, statusFilter, pendingFilter]);

  const formatCurrency = (amount: number | null) => {
    if (!amount) return '$0';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getTierBadge = (tier: string) => {
    const colors: Record<string, string> = {
      major: 'bg-purple-100 text-purple-800',
      leadership: 'bg-blue-100 text-blue-800',
      sustainer: 'bg-green-100 text-green-800',
      supporter: 'bg-gray-100 text-gray-800',
    };
    return colors[tier] || 'bg-gray-100 text-gray-800';
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-100 text-green-800',
      lapsed: 'bg-amber-100 text-amber-800',
      inactive: 'bg-red-100 text-red-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const handleSort = (field: typeof sortField) => {
    if (field === sortField) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir(field === 'display_name' ? 'asc' : 'desc');
    }
  };

  const clearFilters = () => {
    setSearchQuery('');
    setDonorTypeFilter('');
    setTierFilter('');
    setStatusFilter('');
    setPendingFilter('');
  };

  const hasActiveFilters = searchQuery || donorTypeFilter || tierFilter || statusFilter || pendingFilter;

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-10 bg-gray-200 rounded w-full max-w-md"></div>
        <div className="h-64 bg-gray-200 rounded-lg"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="Search donors..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure focus:border-transparent"
          />
        </div>

        <select
          value={donorTypeFilter}
          onChange={(e) => setDonorTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure"
        >
          <option value="">All Types</option>
          <option value="individual">Individual</option>
          <option value="foundation">Foundation</option>
          <option value="corporation">Corporation</option>
          <option value="government">Government</option>
        </select>

        <select
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure"
        >
          <option value="">All Tiers</option>
          <option value="major">Major ($100k+)</option>
          <option value="leadership">Leadership ($10k+)</option>
          <option value="sustainer">Sustainer (12+ gifts)</option>
          <option value="supporter">Supporter</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure"
        >
          <option value="">All Status</option>
          <option value="active">Active</option>
          <option value="lapsed">Lapsed</option>
          <option value="inactive">Inactive</option>
        </select>

        <select
          value={pendingFilter}
          onChange={(e) => setPendingFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure"
        >
          <option value="">All Pending</option>
          <option value="receipts">Pending Receipts</option>
          <option value="acknowledgments">Pending Acks</option>
        </select>

        {hasActiveFilters && (
          <button
            onClick={clearFilters}
            className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Clear
          </button>
        )}
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between text-sm text-gray-500">
        <span>
          Showing {filteredDonors.length} of {donors.length} donors
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {filteredDonors.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {hasActiveFilters ? (
              <>
                <p>No donors match your filters.</p>
                <button onClick={clearFilters} className="text-azure hover:underline mt-2">
                  Clear filters
                </button>
              </>
            ) : (
              <p>No donors found. Add your first donor to get started.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('display_name')}
                  >
                    Donor {sortField === 'display_name' && (sortDir === 'asc' ? '↑' : '↓')}
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('total_lifetime_giving')}
                  >
                    Lifetime {sortField === 'total_lifetime_giving' && (sortDir === 'desc' ? '↓' : '↑')}
                  </th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('gift_count')}
                  >
                    Gifts {sortField === 'gift_count' && (sortDir === 'desc' ? '↓' : '↑')}
                  </th>
                  <th
                    className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('last_gift_date')}
                  >
                    Last Gift {sortField === 'last_gift_date' && (sortDir === 'desc' ? '↓' : '↑')}
                  </th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pending
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredDonors.map((donor) => (
                  <tr
                    key={donor.donor_id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => onDonorSelect?.(donor.donor_id)}
                  >
                    <td className="px-6 py-4">
                      <div>
                        <a
                          href={`/org/${organizationId}/donors/${donor.donor_id}`}
                          className="text-sm font-medium text-gray-900 hover:text-azure"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {donor.is_anonymous ? 'Anonymous' : donor.display_name}
                        </a>
                        {donor.email && !donor.is_anonymous && (
                          <p className="text-xs text-gray-500">{donor.email}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-gray-600 capitalize">{donor.donor_type}</span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getTierBadge(donor.donor_tier)}`}>
                        {donor.donor_tier}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusBadge(donor.recency_status)}`}>
                        {donor.recency_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-900">
                      {formatCurrency(donor.total_lifetime_giving)}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-600">
                      {donor.gift_count}
                    </td>
                    <td className="px-6 py-4 text-right text-sm text-gray-600">
                      {formatDate(donor.last_gift_date)}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {donor.has_pending_receipts && (
                          <span className="w-2 h-2 bg-amber-500 rounded-full" title="Pending receipt"></span>
                        )}
                        {donor.has_pending_acknowledgments && (
                          <span className="w-2 h-2 bg-blue-500 rounded-full" title="Pending acknowledgment"></span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
