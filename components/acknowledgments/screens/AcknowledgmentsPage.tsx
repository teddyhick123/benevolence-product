'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useAcknowledgmentsData } from '@/lib/acknowledgments/hooks';

type Acknowledgment = {
  id: string;
  letter_type: string;
  subject: string | null;
  content: string;
  status: string;
  sent_at: string | null;
  created_at: string;
  donors: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    organization_name: string | null;
    is_organization: boolean;
    email: string | null;
  } | null;
  contributions_received: {
    id: string;
    amount: number;
    contribution_date: string;
  } | null;
};

export default function AcknowledgmentsPage() {
  const params = useParams();
  const organizationId = params.orgId as string;

  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedAck, setSelectedAck] = useState<Acknowledgment | null>(null);
  const { data, isLoading: loading } = useAcknowledgmentsData<{ letters?: Array<any> }>(
    organizationId ? `/api/org/${organizationId}/acknowledgments?limit=100` : null,
  );
  const acknowledgments: Acknowledgment[] = (data?.letters || []).map((letter) => ({
    id: letter.id,
    letter_type: letter.letter_type,
    subject: letter.subject,
    content: letter.body,
    status: letter.status,
    sent_at: letter.sent_at,
    created_at: letter.created_at,
    donors: letter.donors,
    contributions_received: letter.contributions_received,
  }));

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getDonorName = (donor: Acknowledgment['donors']) => {
    if (!donor) return 'Unknown';
    if (!donor.is_organization) {
      return `${donor.first_name || ''} ${donor.last_name || ''}`.trim() || 'Unknown';
    }
    return donor.organization_name || 'Unknown';
  };

  const getTypeBadge = (type: string) => {
    const colors: Record<string, string> = {
      tax_receipt: 'bg-purple-100 text-purple-800',
      thank_you: 'bg-blue-100 text-blue-800',
      annual_summary: 'bg-green-100 text-green-800',
      welcome: 'bg-amber-100 text-amber-800',
      custom: 'bg-gray-100 text-gray-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800',
      approved: 'bg-blue-100 text-blue-800',
      sent: 'bg-green-100 text-green-800',
      delivered: 'bg-green-100 text-green-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredAcks = acknowledgments.filter((a) => {
    if (typeFilter && a.letter_type !== typeFilter) return false;
    if (statusFilter && a.status !== statusFilter) return false;
    return true;
  });

  const draftCount = acknowledgments.filter((a) => a.status === 'draft').length;
  const sentCount = acknowledgments.filter((a) => a.status === 'sent' || a.status === 'delivered').length;

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
          <h1 className="text-2xl font-bold text-gray-900">Acknowledgments</h1>
          <p className="text-sm text-gray-500 mt-1">
            Thank-you letters, tax receipts, and donor communications
          </p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <p className="text-2xl font-bold text-amber-600">{draftCount}</p>
          <p className="text-sm text-gray-600">Draft / Pending</p>
        </div>
        <div className="p-4 bg-white rounded-lg border border-gray-200">
          <p className="text-2xl font-bold text-green-600">{sentCount}</p>
          <p className="text-sm text-gray-600">Sent</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure"
        >
          <option value="">All Types</option>
          <option value="tax_receipt">Tax Receipt</option>
          <option value="thank_you">Thank You</option>
          <option value="annual_summary">Annual Summary</option>
          <option value="welcome">Welcome</option>
          <option value="custom">Custom</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure"
        >
          <option value="">All Status</option>
          <option value="draft">Draft</option>
          <option value="approved">Approved</option>
          <option value="sent">Sent</option>
          <option value="delivered">Delivered</option>
        </select>

        {(typeFilter || statusFilter) && (
          <button
            onClick={() => {
              setTypeFilter('');
              setStatusFilter('');
            }}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {filteredAcks.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p>No acknowledgments found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Donor
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contribution
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
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
                {filteredAcks.map((ack) => (
                  <tr key={ack.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(ack.created_at)}
                    </td>
                    <td className="px-6 py-4">
                      <a
                        href={`/org/${organizationId}/donors/${ack.donors?.id}`}
                        className="text-sm font-medium text-gray-900 hover:text-azure"
                      >
                        {getDonorName(ack.donors)}
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getTypeBadge(ack.letter_type)}`}>
                        {ack.letter_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {ack.contributions_received ? (
                        <span>
                          {formatCurrency(ack.contributions_received.amount)} on{' '}
                          {formatDate(ack.contributions_received.contribution_date)}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusBadge(ack.status)}`}>
                        {ack.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                      {formatDate(ack.sent_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button
                        onClick={() => setSelectedAck(ack)}
                        className="text-azure hover:underline"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Letter Preview Modal */}
      {selectedAck && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold capitalize">
                  {selectedAck.letter_type.replace('_', ' ')} Letter
                </h2>
                <p className="text-sm text-gray-500">
                  To: {getDonorName(selectedAck.donors)}
                </p>
              </div>
              <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${getStatusBadge(selectedAck.status)}`}>
                {selectedAck.status}
              </span>
            </div>
            <div className="p-6">
              <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 leading-relaxed">
                {selectedAck.content}
              </pre>
            </div>
            <div className="p-6 border-t flex items-center justify-end gap-3">
              <button
                onClick={() => setSelectedAck(null)}
                className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                Close
              </button>
              {selectedAck.status === 'draft' && selectedAck.donors?.email && (
                <button
                  className="px-4 py-2 bg-azure text-white rounded-lg hover:bg-azure/90"
                >
                  Send Letter
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
