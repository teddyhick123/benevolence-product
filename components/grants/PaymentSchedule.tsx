'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase-browser';

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
}

export default function PaymentSchedule({ portfolioId }: Props) {
  const [loading, setLoading] = useState(true);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [filter, setFilter] = useState<'all' | 'scheduled' | 'completed'>('all');
  const [showAddPayment, setShowAddPayment] = useState(false);
  const [holdings, setHoldings] = useState<Array<{ id: string; name: string; grant_id?: string }>>([]);
  const [newPayment, setNewPayment] = useState({
    holdingId: '',
    amount: '',
    scheduledDate: '',
    paymentMethod: '',
    notes: '',
  });

  const [summary, setSummary] = useState({
    totalScheduled: 0,
    totalDisbursed: 0,
    pendingCount: 0,
    upcomingAmount: 0,
  });

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const supabase = createClient();

        // Fetch payments with grant info
        const { data: paymentsData, error } = await supabase
          .from('grant_payments')
          .select(`
            *,
            grant_details!inner(
              id,
              holding_id,
              holdings!inner(name, portfolio_id)
            )
          `)
          .eq('grant_details.holdings.portfolio_id', portfolioId)
          .order('scheduled_date', { ascending: true });

        if (error) throw error;

        const processedPayments = (paymentsData || []).map((p: any) => ({
          ...p,
          grant_name: p.grant_details?.holdings?.name || 'Unknown Grant',
          holding_id: p.grant_details?.holding_id,
        }));

        setPayments(processedPayments);

        // Calculate summary
        const totalScheduled = processedPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
        const totalDisbursed = processedPayments
          .filter(p => p.status === 'completed')
          .reduce((sum, p) => sum + (p.amount || 0), 0);
        const pendingCount = processedPayments.filter(p => ['scheduled', 'approved'].includes(p.status)).length;
        const upcomingAmount = processedPayments
          .filter(p => ['scheduled', 'approved'].includes(p.status))
          .reduce((sum, p) => sum + (p.amount || 0), 0);

        setSummary({ totalScheduled, totalDisbursed, pendingCount, upcomingAmount });

        // Fetch grant holdings
        const { data: holdingsData } = await supabase
          .from('holdings')
          .select(`
            id,
            name,
            grant_details(id)
          `)
          .eq('portfolio_id', portfolioId)
          .in('asset_type', ['foundation_grant', 'daf_grant', 'pri', 'mri'])
          .order('name');

        const processedHoldings = (holdingsData || []).map((h: any) => ({
          id: h.id,
          name: h.name,
          grant_id: h.grant_details?.[0]?.id,
        }));

        setHoldings(processedHoldings);
      } catch (err) {
        console.error('Error fetching payment data:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [portfolioId]);

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
    const colors: Record<string, string> = {
      scheduled: 'bg-gray-100 text-gray-700',
      approved: 'bg-blue-100 text-blue-700',
      processing: 'bg-amber-100 text-amber-700',
      completed: 'bg-green-100 text-green-700',
      cancelled: 'bg-gray-200 text-gray-500',
      returned: 'bg-red-100 text-red-700',
    };
    return colors[status] || 'bg-gray-100 text-gray-700';
  };

  const handleAddPayment = async () => {
    if (!newPayment.holdingId || !newPayment.amount) {
      alert('Please fill in required fields');
      return;
    }

    try {
      const supabase = createClient();
      const holding = holdings.find(h => h.id === newPayment.holdingId);

      // Get or create grant details
      let grantId = holding?.grant_id;
      if (!grantId) {
        const { data: newGrant } = await supabase
          .from('grant_details')
          .insert({ holding_id: newPayment.holdingId })
          .select('id')
          .single();
        grantId = newGrant?.id;
      }

      // Get next payment number
      const existingPayments = payments.filter(p => p.grant_id === grantId);
      const nextNumber = existingPayments.length > 0
        ? Math.max(...existingPayments.map(p => p.payment_number)) + 1
        : 1;

      await supabase
        .from('grant_payments')
        .insert({
          grant_id: grantId,
          payment_number: nextNumber,
          amount: parseFloat(newPayment.amount),
          scheduled_date: newPayment.scheduledDate || null,
          payment_method: newPayment.paymentMethod || null,
          notes: newPayment.notes || null,
          status: 'scheduled',
        });

      // Refresh
      window.location.reload();
    } catch (err) {
      console.error('Error adding payment:', err);
      alert('Failed to add payment');
    }
  };

  const handleUpdateStatus = async (paymentId: string, newStatus: string) => {
    try {
      const supabase = createClient();

      const updateData: any = { status: newStatus };
      if (newStatus === 'completed') {
        updateData.actual_date = new Date().toISOString().split('T')[0];
      }

      await supabase
        .from('grant_payments')
        .update(updateData)
        .eq('id', paymentId);

      // Refresh
      window.location.reload();
    } catch (err) {
      console.error('Error updating payment:', err);
      alert('Failed to update payment');
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
          <span className="text-sm font-medium text-gray-500">Total Scheduled</span>
          <div className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(summary.totalScheduled)}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <span className="text-sm font-medium text-gray-500">Total Disbursed</span>
          <div className="mt-2 text-2xl font-bold text-green-600">{formatCurrency(summary.totalDisbursed)}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <span className="text-sm font-medium text-gray-500">Pending Payments</span>
          <div className="mt-2 text-2xl font-bold text-amber-600">{summary.pendingCount}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <span className="text-sm font-medium text-gray-500">Upcoming Amount</span>
          <div className="mt-2 text-2xl font-bold text-gray-900">{formatCurrency(summary.upcomingAmount)}</div>
        </div>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-azure focus:border-azure"
          >
            <option value="all">All Payments</option>
            <option value="scheduled">Pending</option>
            <option value="completed">Completed</option>
          </select>
          <span className="text-sm text-gray-500">{filteredPayments.length} payments</span>
        </div>
        <button
          onClick={() => setShowAddPayment(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-azure text-white rounded-md hover:bg-azure/90 text-sm font-medium"
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
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Schedule Payment</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Grant *</label>
                <select
                  value={newPayment.holdingId}
                  onChange={(e) => setNewPayment({ ...newPayment, holdingId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-azure focus:border-azure"
                >
                  <option value="">Select a grant...</option>
                  {holdings.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-gray-500">$</span>
                  <input
                    type="number"
                    value={newPayment.amount}
                    onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                    className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md focus:ring-azure focus:border-azure"
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Scheduled Date</label>
                <input
                  type="date"
                  value={newPayment.scheduledDate}
                  onChange={(e) => setNewPayment({ ...newPayment, scheduledDate: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-azure focus:border-azure"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <select
                  value={newPayment.paymentMethod}
                  onChange={(e) => setNewPayment({ ...newPayment, paymentMethod: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-azure focus:border-azure"
                >
                  <option value="">Select method...</option>
                  <option value="check">Check</option>
                  <option value="wire">Wire Transfer</option>
                  <option value="ach">ACH</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea
                  value={newPayment.notes}
                  onChange={(e) => setNewPayment({ ...newPayment, notes: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-azure focus:border-azure"
                  rows={2}
                />
              </div>
            </div>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowAddPayment(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPayment}
                className="px-4 py-2 bg-azure text-white rounded-md hover:bg-azure/90 text-sm font-medium"
              >
                Schedule Payment
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Payment List */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        {filteredPayments.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="mt-2">No payments found.</p>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Grant</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payment #</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Scheduled</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actual</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredPayments.map((payment) => (
                <tr key={payment.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <a
                      href={`/dashboard/holdings/${payment.holding_id}?portfolio_id=${portfolioId}`}
                      className="text-sm font-medium text-gray-900 hover:text-azure"
                    >
                      {payment.grant_name}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    #{payment.payment_number}
                  </td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">
                    {formatCurrency(payment.amount)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {formatDate(payment.scheduled_date)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
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
