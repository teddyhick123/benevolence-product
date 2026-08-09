'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { createBrowserClient as createClient } from '@/lib/supabase-browser';

type ReceiptData = {
  id: string;
  contribution_date: string;
  amount: number;
  tax_deductible_amount: number;
  receipt_status: string;
  receipt_number: string | null;
  receipt_generated_at: string | null;
  receipt_sent_at: string | null;
  donors: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    organization_name: string | null;
    is_organization: boolean;
    email: string | null;
  } | null;
};

export default function ReceiptsPage() {
  const params = useParams();
  const organizationId = params.orgId as string;

  const [loading, setLoading] = useState(true);
  const [receipts, setReceipts] = useState<ReceiptData[]>([]);
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const supabase = createClient();

        const { data, error } = await supabase
          .from('contributions_received')
          .select(`
            id,
            contribution_date,
            amount,
            tax_deductible_amount,
            receipt_status,
            receipt_number,
            receipt_generated_at,
            receipt_sent_at,
            donors (
              id,
              first_name,
              last_name,
              organization_name,
              is_organization,
              email
            )
          `)
          .eq('org_id', organizationId)
          .gte('amount', 250) // IRS threshold
          .order('contribution_date', { ascending: false });

        if (!error) setReceipts((data as unknown as ReceiptData[]) || []);
      } catch (err) {
        console.error('Error fetching receipts:', err);
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

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getDonorName = (donor: ReceiptData['donors']) => {
    if (!donor) return 'Unknown';
    if (!donor.is_organization) {
      return `${donor.first_name || ''} ${donor.last_name || ''}`.trim() || 'Unknown';
    }
    return donor.organization_name || 'Unknown';
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-800',
      generated: 'bg-blue-100 text-blue-800',
      sent: 'bg-green-100 text-green-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredReceipts = statusFilter
    ? receipts.filter((r) => r.receipt_status === statusFilter)
    : receipts;

  const pendingCount = receipts.filter((r) => r.receipt_status === 'pending').length;
  const generatedCount = receipts.filter((r) => r.receipt_status === 'generated').length;
  const sentCount = receipts.filter((r) => r.receipt_status === 'sent').length;

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
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Tax Receipts</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage IRS-compliant tax receipts for contributions of $250 or more
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <button
          onClick={() => setStatusFilter(statusFilter === 'pending' ? '' : 'pending')}
          className={`p-4 rounded-lg border text-left transition-colors ${
            statusFilter === 'pending'
              ? 'border-amber-300 bg-amber-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
          <p className="text-sm text-gray-600">Pending Receipts</p>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'generated' ? '' : 'generated')}
          className={`p-4 rounded-lg border text-left transition-colors ${
            statusFilter === 'generated'
              ? 'border-blue-300 bg-blue-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <p className="text-2xl font-bold text-blue-600">{generatedCount}</p>
          <p className="text-sm text-gray-600">Generated (Not Sent)</p>
        </button>
        <button
          onClick={() => setStatusFilter(statusFilter === 'sent' ? '' : 'sent')}
          className={`p-4 rounded-lg border text-left transition-colors ${
            statusFilter === 'sent'
              ? 'border-green-300 bg-green-50'
              : 'border-gray-200 bg-white hover:border-gray-300'
          }`}
        >
          <p className="text-2xl font-bold text-green-600">{sentCount}</p>
          <p className="text-sm text-gray-600">Sent</p>
        </button>
      </div>

      {/* Clear Filter */}
      {statusFilter && (
        <div className="mb-4">
          <button
            onClick={() => setStatusFilter('')}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Clear filter
          </button>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {filteredReceipts.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No receipts found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Receipt #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Donor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contribution Date
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tax Deductible
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Generated
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Sent
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredReceipts.map((receipt) => (
                  <tr key={receipt.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {receipt.receipt_number || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <a
                        href={`/org/${organizationId}/donors/${receipt.donors?.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-azure"
                      >
                        {getDonorName(receipt.donors)}
                      </a>
                      {receipt.donors?.email && (
                        <p className="text-xs text-gray-500">{receipt.donors.email}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(receipt.contribution_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                      {formatCurrency(receipt.amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600">
                      {formatCurrency(receipt.tax_deductible_amount)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusBadge(receipt.receipt_status)}`}>
                        {receipt.receipt_status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(receipt.receipt_generated_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(receipt.receipt_sent_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <a
                        href={`/org/${organizationId}/contributions?receipt=${receipt.id}`}
                        className="text-azure hover:underline"
                      >
                        View
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* IRS Info */}
      <div className="mt-6 p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
        <p className="font-medium mb-2">IRS Requirements</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Tax receipts are required for charitable contributions of $250 or more</li>
          <li>Must be provided before the donor files their tax return</li>
          <li>Must include a statement of goods/services provided (if any)</li>
        </ul>
      </div>
    </div>
  );
}
