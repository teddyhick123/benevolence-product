'use client';

import { useState } from 'react';
import { Recommendation } from '@/lib/schemas/recommendations';

type Props = {
  recommendation: Recommendation;
  onClose: () => void;
  onSuccess: (holdingId: string) => void;
};

export default function MakeDonationModal({ recommendation, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [amount, setAmount] = useState<string>(
    recommendation.min_investment?.toString() || ''
  );
  const [donationDate, setDonationDate] = useState(
    new Date().toISOString().split('T')[0]
  );
  const [donationType, setDonationType] = useState<'cash' | 'stock' | 'other'>('cash');
  const [custodian, setCustodian] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const numericAmount = parseFloat(amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        throw new Error('Please enter a valid donation amount');
      }

      // Create holding for the donation
      const holdingPayload = {
        name: recommendation.organization_name,
        asset_type: 'donation',
        asset_subtype: donationType,
        funds_allocated: numericAmount,
        as_of: donationDate,
        sector: recommendation.sector,
        country: recommendation.country,
        custodian: custodian || null,
        status: 'Active',
        metadata: {
          from_recommendation_id: recommendation.id,
          ein: recommendation.ein,
          donation_type: donationType,
          notes: notes || undefined,
        },
      };

      const res = await fetch(`/api/portfolio/${recommendation.portfolio_id}/holdings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(holdingPayload),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to create donation record');
      }

      const result = await res.json();
      onSuccess(result.id);
    } catch (err: any) {
      console.error('Error creating donation:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-neutral-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-neutral-900">Make a Donation</h2>
            <p className="text-sm text-neutral-600 mt-1">
              Create a donation record for {recommendation.organization_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-500 hover:text-neutral-700 transition-colors"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Error Display */}
          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Organization Info */}
          <div className="p-4 bg-neutral-50 rounded-lg">
            <div className="text-sm font-medium text-neutral-700 mb-2">Organization</div>
            <div className="text-lg font-semibold text-neutral-900">{recommendation.organization_name}</div>
            {recommendation.ein && (
              <div className="text-sm text-neutral-600 mt-1">EIN: {recommendation.ein}</div>
            )}
            {recommendation.sector && (
              <div className="text-sm text-neutral-600">Sector: {recommendation.sector}</div>
            )}
          </div>

          {/* Suggested Amount */}
          {(recommendation.min_investment || recommendation.max_investment) && (
            <div className="p-3 bg-azure/5 border border-azure/20 rounded-lg text-sm text-azure">
              <svg className="w-4 h-4 inline mr-1" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              Suggested donation range: ${recommendation.min_investment?.toLocaleString()} - ${recommendation.max_investment?.toLocaleString()}
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Donation Amount *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                min="0"
                step="0.01"
                required
                className="w-full pl-8 pr-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-azure focus:border-azure"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Donation Date */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Donation Date *
            </label>
            <input
              type="date"
              value={donationDate}
              onChange={(e) => setDonationDate(e.target.value)}
              required
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-azure focus:border-azure"
            />
          </div>

          {/* Donation Type */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Donation Type *
            </label>
            <div className="grid grid-cols-3 gap-3">
              {(['cash', 'stock', 'other'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setDonationType(type)}
                  className={`px-4 py-2 rounded-lg border text-sm font-medium transition-colors capitalize ${
                    donationType === type
                      ? 'bg-azure text-white border-azure'
                      : 'bg-white text-neutral-700 border-neutral-300 hover:border-azure hover:bg-azure/5'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Custodian (optional) */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Custodian / Source (optional)
            </label>
            <input
              type="text"
              value={custodian}
              onChange={(e) => setCustodian(e.target.value)}
              placeholder="e.g., Fidelity Charitable, Schwab DAF, Personal Account"
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-azure focus:border-azure"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add any additional notes about this donation..."
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-azure focus:border-azure resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-200">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 rounded-lg transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white text-sm font-medium rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50 shadow-soft"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating...
                </span>
              ) : (
                'Create Donation'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
