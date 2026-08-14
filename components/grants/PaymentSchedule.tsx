'use client';

import { useState } from 'react';
import { apiRequest, readJson } from '@/lib/api/client';
import { useGrantsData } from '@/lib/grants/hooks';
import { grantStatusBadgeClass } from './grantPalette';
import { useEntityVocabulary } from '@/lib/hooks/use-entity-vocabulary';

type Payment = {
  id: string;
  grant_id: string;
  payment_number: number;
  amount: number;
  scheduled_date: string | null;
  actual_date: string | null;
  status: string;
  payment_method: string | null;
  reference_number: string | null;
  conditions_met: boolean;
  condition_notes: string | null;
  notes: string | null;
  grant_name: string;
  holding_id: string;
};

interface Props {
  portfolioId: string;
  orgId: string;
}

export default function PaymentSchedule({ portfolioId, orgId }: Props) {
  const vocabulary = useEntityVocabulary(orgId);
  const grantLabel = vocabulary.grant.singular;
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'completed'>('all');
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [newPayment, setNewPayment] = useState({
    holdingId: '',
    amount: '',
    scheduledDate: '',
    paymentMethod: '',
    notes: '',
  });

  const paymentsUrl = `/api/org/${orgId}/grants/payments?portfolio_id=${portfolioId}`;
  const holdingsUrl = `/api/org/${orgId}/grants/holdings?portfolio_id=${portfolioId}`;
  const paymentsQuery = useGrantsData<{ payments?: Payment[] }>(paymentsUrl);
  const holdingsQuery = useGrantsData<{ holdings?: Array<{ id: string; name: string; grant_id?: string }> }>(holdingsUrl);
  const loading = paymentsQuery.isLoading || holdingsQuery.isLoading;
  const fetchError = paymentsQuery.error?.message || holdingsQuery.error?.message || null;
  const payments = paymentsQuery.data?.payments || [];
  const holdings = holdingsQuery.data?.holdings || [];
  const refreshData = () => Promise.all([paymentsQuery.mutate(), holdingsQuery.mutate()]);
  const summary = {
    totalScheduled: payments.reduce((sum, payment) => sum + (payment.amount || 0), 0),
    totalDisbursed: payments
      .filter(payment => payment.status === 'completed')
      .reduce((sum, payment) => sum + (payment.amount || 0), 0),
    pendingCount: payments.filter(payment => ['scheduled', 'approved'].includes(payment.status)).length,
    upcomingAmount: payments
      .filter(payment => ['scheduled', 'approved'].includes(payment.status))
      .reduce((sum, payment) => sum + (payment.amount || 0), 0),
  };

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

  const getStatusBadge = (status: string) => {
    return grantStatusBadgeClass(status);
  };

  const handleAddPayment = async () => {
    if (!newPayment.holdingId || !newPayment.amount) {
      alert('Please fill in required fields');
      return;
    }

    try {
      const holding = holdings.find(h => h.id === newPayment.holdingId);
      const grantId = holding?.grant_id;
      if (!grantId) {
        alert('Create the grant through the grant workflow before scheduling payments.');
        return;
      }

      const response = await apiRequest(`/api/org/${orgId}/grants/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio_id: portfolioId,
          grant_id: grantId,
          amount: parseFloat(newPayment.amount),
          scheduled_date: newPayment.scheduledDate || null,
          payment_method: newPayment.paymentMethod || null,
          notes: newPayment.notes || null,
        }),
      });
      const json = await readJson(response);
      if (!response.ok) throw new Error(json.error || 'Failed to add payment');

      setShowAddPayment(false);
      setNewPayment({ holdingId: '', amount: '', scheduledDate: '', paymentMethod: '', notes: '' });
      await refreshData();
    } catch (err: any) {
      alert(err?.message ?? 'Failed to add payment');
    }
  };

  const handleUpdateStatus = async (paymentId: string, newStatus: string) => {
    try {
      const response = await apiRequest(`/api/org/${orgId}/grants/payments/${paymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await readJson(response);
      if (!response.ok) throw new Error(json.error || 'Failed to update payment');

      await refreshData();
    } catch (err: any) {
      alert(err?.message ?? 'Failed to update payment');
    }
  };

  const filteredPayments = payments.filter(p => {
    if (filter === 'all') return true;
    if (filter === 'scheduled') return ['scheduled', 'approved', 'processing'].includes(p.status);
    if (filter === 'completed') return p.status === 'completed';
    return true;
  });

  if (loading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-neutral-200 rounded-2xl"></div>
          ))}
        </div>
        <div className="h-64 bg-neutral-200 rounded-2xl"></div>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="rounded-2xl border border-red-100 bg-red-50 p-6 text-center">
        <p className="text-sm font-medium text-red-700">Failed to load payment data</p>
        <p className="text-xs text-red-500 mt-1">{fetchError}</p>
        <button onClick={() => { void refreshData(); }} className="mt-3 text-sm text-azure hover:underline">Try again</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-black/5 bg-white shadow-soft p-6">
          <span className="text-sm font-medium text-neutral-500">Total Scheduled</span>
          <div className="mt-2 text-2xl font-bold text-ink">{formatCurrency(summary.totalScheduled)}</div>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white shadow-soft p-6">
          <span className="text-sm font-medium text-neutral-500">Total Disbursed</span>
          <div className="mt-2 text-2xl font-bold text-green-600">{formatCurrency(summary.totalDisbursed)}</div>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white shadow-soft p-6">
          <span className="text-sm font-medium text-neutral-500">Pending Payments</span>
          <div className="mt-2 text-2xl font-bold text-coral">{summary.pendingCount}</div>
        </div>
        <div className="rounded-2xl border border-black/5 bg-white shadow-soft p-6">
          <span className="text-sm font-medium text-neutral-500">Upcoming Amount</span>
          <div className="mt-2 text-2xl font-bold text-ink">{formatCurrency(summary.upcomingAmount)}</div>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="px-3 py-2 border border-black/10 rounded-2xl text-sm focus:ring-azure/30 focus:border-azure"
          >
            <option value="all">All Payments</option>
            <option value="scheduled">Pending</option>
            <option value="completed">Completed</option>
          </select>
          <span className="text-sm text-neutral-500">{filteredPayments.length} payments</span>
        </div>
        <button
          onClick={() => setShowAddPayment(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-azure text-white rounded-2xl hover:bg-azure/90 text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Add Payment
        </button>
      </div>

      {/* Add Payment Modal */}
      {showAddPayment && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-ink mb-4">Schedule Payment</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">{grantLabel} *</label>
                <select
                  value={newPayment.holdingId}
                  onChange={(e) => setNewPayment({ ...newPayment, holdingId: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-2xl focus:ring-azure/30 focus:border-azure"
                >
                  <option value="">Select a {grantLabel.toLowerCase()}...</option>
                  {holdings.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-neutral-500">$</span>
                  <input
                    type="number"
                    value={newPayment.amount}
                    onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                    className="w-full pl-7 pr-3 py-2 border border-black/10 rounded-2xl focus:ring-azure/30 focus:border-azure"
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Scheduled Date</label>
                <input
                  type="date"
                  value={newPayment.scheduledDate}
                  onChange={(e) => setNewPayment({ ...newPayment, scheduledDate: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-2xl focus:ring-azure/30 focus:border-azure"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Payment Method</label>
                <select
                  value={newPayment.paymentMethod}
                  onChange={(e) => setNewPayment({ ...newPayment, paymentMethod: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-2xl focus:ring-azure/30 focus:border-azure"
                >
                  <option value="">Select method...</option>
                  <option value="check">Check</option>
                  <option value="wire">Wire Transfer</option>
                  <option value="ach">ACH</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">Notes</label>
                <textarea
                  value={newPayment.notes}
                  onChange={(e) => setNewPayment({ ...newPayment, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-black/10 rounded-2xl focus:ring-azure/30 focus:border-azure"
                  rows={2}
                />
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowAddPayment(false)}
                className="px-4 py-2 text-sm font-medium text-neutral-700 hover:text-ink"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPayment}
                className="px-4 py-2 bg-azure text-white rounded-2xl hover:bg-azure/90 text-sm font-medium"
              >
                Schedule Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment List */}
      <div className="rounded-2xl border border-black/5 bg-white shadow-soft overflow-hidden">
        {filteredPayments.length === 0 ? (
          <div className="p-8 text-center text-neutral-500">
            <svg className="mx-auto h-12 w-12 text-neutral-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="mt-2">No payments found.</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-black/5">
            <thead className="bg-neutral-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">{grantLabel}</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Payment #</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Scheduled</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Actual</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-black/5">
              {filteredPayments.map((payment) => (
                <tr key={payment.id} className="hover:bg-neutral-50">
                  <td className="px-6 py-4">
                    <a
                      href={`/dashboard/holdings/${payment.holding_id}?portfolio_id=${portfolioId}`}
                      className="text-sm font-medium text-ink hover:text-azure"
                    >
                      {payment.grant_name}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-500">
                    #{payment.payment_number}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-ink">
                    {formatCurrency(payment.amount)}
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-500">
                    {formatDate(payment.scheduled_date)}
                  </td>
                  <td className="px-6 py-4 text-sm text-neutral-500">
                    {formatDate(payment.actual_date)}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadge(payment.status)}`}>
                      {payment.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    {payment.status === 'scheduled' && (
                      <button
                        onClick={() => handleUpdateStatus(payment.id, 'approved')}
                        className="text-sm text-azure hover:text-azure/80"
                      >
                        Approve
                      </button>
                    )}
                    {payment.status === 'approved' && (
                      <button
                        onClick={() => handleUpdateStatus(payment.id, 'completed')}
                        className="text-sm text-green-600 hover:text-green-700"
                      >
                        Mark Paid
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
  );
}
