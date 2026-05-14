'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createClient } from '@/lib/supabase-browser';
import ContributionForm from '@/components/donors/ContributionForm';
import ReceiptGenerator from '@/components/donors/ReceiptGenerator';

type Contribution = {
  id: string;
  contribution_date: string;
  amount: number;
  gift_type: string;
  designation: string | null;
  is_restricted: boolean;
  quid_pro_quo_value: number;
  tax_deductible_amount: number;
  receipt_status: string;
  receipt_number: string | null;
  acknowledgment_status: string;
  notes: string | null;
  donors: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    organization_name: string | null;
    is_organization: boolean;
    email: string | null;
    address_line1: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
  } | null;
};

type Organization = {
  id: string;
  name: string;
  ein: string | null;
};

export default function ContributionsPage() {
  const params = useParams();
  const organizationId = params.orgId as string;

  const [loading, setLoading] = useState(true);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [showContributionForm, setShowContributionForm] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedContribution, setSelectedContribution] = useState<Contribution | null>(null);

  // Filters
  const [typeFilter, setTypeFilter] = useState('');
  const [receiptFilter, setReceiptFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const supabase = createClient();

        const [contribRes, orgRes] = await Promise.all([
          supabase
            .from('contributions_received')
            .select(`
              *,
              donors (
                id,
                first_name,
                last_name,
                organization_name,
                is_organization,
                email,
                address_line1,
                city,
                state,
                postal_code
              )
            `)
            .eq('org_id', organizationId)
            .order('contribution_date', { ascending: false }),
          supabase
            .from('organizations')
            .select('id, name, ein')
            .eq('id', organizationId)
            .single(),
        ]);

        if (!contribRes.error) setContributions(contribRes.data || []);
        if (!orgRes.error) setOrganization(orgRes.data);
      } catch (err) {
        console.error('Error fetching contributions:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [organizationId]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDonorName = (donor: Contribution['donors']) => {
    if (!donor) return 'Unknown';
    if (!donor.is_organization) {
      return `${donor.first_name || ''} ${donor.last_name || ''}`.trim() || 'Unknown';
    }
    return donor.organization_name || 'Unknown';
  };

  const getReceiptStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-800',
      generated: 'bg-blue-100 text-blue-800',
      sent: 'bg-green-100 text-green-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredContributions = contributions.filter((c) => {
    if (typeFilter && c.gift_type !== typeFilter) return false;
    if (receiptFilter && c.receipt_status !== receiptFilter) return false;
    if (dateFilter) {
      const contribDate = new Date(c.contribution_date);
      const now = new Date();
      if (dateFilter === '30') {
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (contribDate < thirtyDaysAgo) return false;
      } else if (dateFilter === '90') {
        const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        if (contribDate < ninetyDaysAgo) return false;
      } else if (dateFilter === 'ytd') {
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        if (contribDate < startOfYear) return false;
      }
    }
    return true;
  });

  const totalAmount = filteredContributions.reduce((sum, c) => sum + c.amount, 0);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-48 bg-gray-200 rounded"></div>
          <div className="h-64 bg-gray-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Contributions</h1>
          <p className="text-sm text-gray-500 mt-1">
            All contributions received by your organization
          </p>
        </div>
        <button
          onClick={() => setShowContributionForm(true)}
          className="px-4 py-2 bg-azure text-white rounded-lg hover:bg-azure/90"
        >
          Log Contribution
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure"
        >
          <option value="">All Types</option>
          <option value="cash">Cash</option>
          <option value="check">Check</option>
          <option value="credit_card">Credit Card</option>
          <option value="wire">Wire Transfer</option>
          <option value="stock">Stock</option>
          <option value="crypto">Cryptocurrency</option>
          <option value="in_kind">In-Kind</option>
        </select>

        <select
          value={receiptFilter}
          onChange={(e) => setReceiptFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure"
        >
          <option value="">All Receipt Status</option>
          <option value="pending">Pending</option>
          <option value="generated">Generated</option>
          <option value="sent">Sent</option>
        </select>

        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure"
        >
          <option value="">All Time</option>
          <option value="30">Last 30 Days</option>
          <option value="90">Last 90 Days</option>
          <option value="ytd">Year to Date</option>
        </select>

        {(typeFilter || receiptFilter || dateFilter) && (
          <button
            onClick={() => {
              setTypeFilter('');
              setReceiptFilter('');
              setDateFilter('');
            }}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Clear
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="flex items-center justify-between text-sm text-gray-500 mb-4">
        <span>
          Showing {filteredContributions.length} of {contributions.length} contributions
        </span>
        <span className="font-medium text-gray-900">
          Total: {formatCurrency(totalAmount)}
        </span>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {filteredContributions.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No contributions found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Donor
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Designation
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Receipt
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredContributions.map((contrib) => (
                  <tr key={contrib.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatDate(contrib.contribution_date)}
                    </td>
                    <td className="px-6 py-4">
                      <a
                        href={`/org/${organizationId}/donors/${contrib.donors?.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-azure"
                      >
                        {getDonorName(contrib.donors)}
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                      {formatCurrency(contrib.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600 capitalize">
                      {(contrib.gift_type || '').replace('_', ' ')}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {contrib.designation || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getReceiptStatusBadge(contrib.receipt_status)}`}>
                        {contrib.receipt_status}
                      </span>
                      {contrib.receipt_number && (
                        <span className="ml-2 text-xs text-gray-500">{contrib.receipt_number}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      {contrib.receipt_status === 'pending' && contrib.amount >= 250 && (
                        <button
                          onClick={() => {
                            setSelectedContribution(contrib);
                            setShowReceiptModal(true);
                          }}
                          className="text-azure hover:underline"
                        >
                          Generate Receipt
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Contribution Form Modal */}
      {showContributionForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Log Contribution</h2>
            </div>
            <div className="p-6">
              <ContributionForm
                organizationId={organizationId}
                onSuccess={() => {
                  setShowContributionForm(false);
                  window.location.reload();
                }}
                onCancel={() => setShowContributionForm(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Receipt Generator Modal */}
      {showReceiptModal && selectedContribution && organization && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">Generate Tax Receipt</h2>
            </div>
            <div className="p-6">
              <ReceiptGenerator
                organizationId={organizationId}
                contribution={{
                  ...selectedContribution,
                  donors: selectedContribution.donors || undefined,
                }}
                organization={organization}
                onSuccess={() => {
                  setShowReceiptModal(false);
                  setSelectedContribution(null);
                  window.location.reload();
                }}
                onCancel={() => {
                  setShowReceiptModal(false);
                  setSelectedContribution(null);
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
