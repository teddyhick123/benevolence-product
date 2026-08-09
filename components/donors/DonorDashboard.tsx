'use client';

import { useState, useEffect } from 'react';
import { createBrowserClient as createClient } from '@/lib/supabase-browser';

type DonorSummary = {
  donor_id: string;
  org_id: string;
  is_organization: boolean;
  display_name: string;
  email: string | null;
  is_anonymous: boolean;
  total_lifetime_giving: number;
  total_ytd_giving: number;
  first_gift_date: string | null;
  last_gift_date: string | null;
  gift_count: number;
  largest_gift: number;
  average_gift: number;
  donor_tier: string;
  recency_status: string;
  days_since_last_gift: number | null;
  has_pending_receipts: boolean;
  has_pending_acknowledgments: boolean;
};

type ContributionSummary = {
  contribution_id: string;
  donor_name: string;
  amount: number;
  contribution_date: string;
  gift_type: string;
  receipt_status: string;
  acknowledgment_status: string;
};

interface Props {
  organizationId: string;
}

export default function DonorDashboard({ organizationId }: Props) {
  const [loading, setLoading] = useState(true);
  const [donors, setDonors] = useState<DonorSummary[]>([]);
  const [recentContributions, setRecentContributions] = useState<ContributionSummary[]>([]);
  const [summary, setSummary] = useState({
    totalDonors: 0,
    totalYtdGiving: 0,
    avgGiftSize: 0,
    activeDonors: 0,
    lapsedDonors: 0,
    pendingReceipts: 0,
    pendingAcks: 0,
    majorDonors: 0,
  });

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const supabase = createClient();

        // Fetch donor summary data
        const { data: donorData, error: donorError } = await supabase
          .from('v_donor_summary')
          .select('*')
          .eq('org_id', organizationId)
          .order('total_lifetime_giving', { ascending: false });

        if (donorError) throw donorError;
        setDonors(donorData || []);

        // Calculate summary stats
        const donorsList = donorData || [];
        const totalDonors = donorsList.length;
        const totalYtdGiving = donorsList.reduce((sum, d) => sum + (d.total_ytd_giving || 0), 0);
        const totalGiftCount = donorsList.reduce((sum, d) => sum + (d.gift_count || 0), 0);
        const avgGiftSize = totalGiftCount > 0
          ? donorsList.reduce((sum, d) => sum + (d.total_lifetime_giving || 0), 0) / totalGiftCount
          : 0;
        const activeDonors = donorsList.filter(d => d.recency_status === 'active').length;
        const lapsedDonors = donorsList.filter(d => d.recency_status === 'lapsed').length;
        const pendingReceipts = donorsList.filter(d => d.has_pending_receipts).length;
        const pendingAcks = donorsList.filter(d => d.has_pending_acknowledgments).length;
        const majorDonors = donorsList.filter(d => d.donor_tier === 'major').length;

        setSummary({
          totalDonors,
          totalYtdGiving,
          avgGiftSize,
          activeDonors,
          lapsedDonors,
          pendingReceipts,
          pendingAcks,
          majorDonors,
        });

        // Fetch recent contributions
        const { data: contribData, error: contribError } = await supabase
          .from('v_contribution_with_donor')
          .select('*')
          .eq('org_id', organizationId)
          .order('contribution_date', { ascending: false })
          .limit(10);

        if (!contribError && contribData) {
          setRecentContributions(contribData);
        }
      } catch (err) {
        console.error('Error fetching donor dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [organizationId]);

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
    if (!date) return '';
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

  const getReceiptStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'text-amber-600',
      generated: 'text-blue-600',
      sent: 'text-green-600',
    };
    return colors[status] || 'text-gray-600';
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-200 rounded-lg"></div>
          ))}
        </div>
        <div className="h-64 bg-gray-200 rounded-lg"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Total Donors</span>
            <span className="text-2xl font-bold text-gray-900">{summary.totalDonors}</span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            <span className="px-2 py-0.5 rounded bg-green-100 text-green-700">{summary.activeDonors} active</span>
            {summary.lapsedDonors > 0 && (
              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-700">{summary.lapsedDonors} lapsed</span>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">YTD Giving</span>
            <span className="text-2xl font-bold text-gray-900">{formatCurrency(summary.totalYtdGiving)}</span>
          </div>
          <div className="mt-2 text-xs text-gray-500">
            Avg gift: {formatCurrency(summary.avgGiftSize)}
          </div>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Major Donors</span>
            <span className="text-2xl font-bold text-purple-600">{summary.majorDonors}</span>
          </div>
          <p className="mt-2 text-xs text-gray-500">$100k+ lifetime giving</p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-500">Action Needed</span>
            <span className={`text-2xl font-bold ${summary.pendingReceipts + summary.pendingAcks > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {summary.pendingReceipts + summary.pendingAcks}
            </span>
          </div>
          <div className="mt-2 flex items-center gap-2 text-xs">
            {summary.pendingReceipts > 0 && (
              <span className="text-amber-600">{summary.pendingReceipts} receipts</span>
            )}
            {summary.pendingAcks > 0 && (
              <span className="text-amber-600">{summary.pendingAcks} acks</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top Donors */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-semibold text-gray-900">Top Donors</h2>
            <a href={`/org/${organizationId}/donors`} className="text-sm text-azure hover:underline">
              View all
            </a>
          </div>
          {donors.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="mt-2">No donors found.</p>
              <p className="text-sm">Start by adding your first donor.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Donor</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Lifetime</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {donors.slice(0, 10).map((donor) => (
                    <tr key={donor.donor_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <a
                          href={`/org/${organizationId}/donors/${donor.donor_id}`}
                          className="text-sm font-medium text-gray-900 hover:text-azure"
                        >
                          {donor.is_anonymous ? 'Anonymous' : donor.display_name}
                        </a>
                        {donor.email && !donor.is_anonymous && (
                          <p className="text-xs text-gray-500">{donor.email}</p>
                        )}
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent Contributions */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Contributions</h2>
          </div>
          {recentContributions.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              <svg className="mx-auto h-8 w-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="mt-2 text-sm">No contributions yet</p>
            </div>
          ) : (
            <ul className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
              {recentContributions.map((contrib) => (
                <li key={contrib.contribution_id} className="px-6 py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        {formatCurrency(contrib.amount)}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {contrib.donor_name || 'Anonymous'} &middot; {formatDate(contrib.contribution_date)}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-xs ${getReceiptStatusColor(contrib.receipt_status)}`}>
                          Receipt: {contrib.receipt_status}
                        </span>
                      </div>
                    </div>
                    <span className="text-xs text-gray-500 capitalize">
                      {contrib.gift_type.replace('_', ' ')}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
