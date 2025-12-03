'use client';

import { useState } from 'react';
import { GRANT_TYPE_LABELS, GrantType } from '@/lib/schemas/grant';
import { Recommendation } from '@/lib/schemas/recommendations';

type Props = {
  recommendation: Recommendation;
  onClose: () => void;
  onSuccess: (holdingId: string) => void;
};

export default function CreateGrantModal({ recommendation, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state - Holding info
  const [amount, setAmount] = useState<string>(
    recommendation.min_investment?.toString() || ''
  );
  const [assetType, setAssetType] = useState<'foundation_grant' | 'daf_grant'>('foundation_grant');

  // Form state - Grant details
  const [grantType, setGrantType] = useState<GrantType>('general_operating');
  const [grantPeriodStart, setGrantPeriodStart] = useState<string>('');
  const [grantPeriodEnd, setGrantPeriodEnd] = useState<string>('');
  const [deliverables, setDeliverables] = useState('');
  const [reportingFrequency, setReportingFrequency] = useState('');
  const [renewalEligible, setRenewalEligible] = useState(false);
  const [renewalDate, setRenewalDate] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const numericAmount = parseFloat(amount);
      if (isNaN(numericAmount) || numericAmount <= 0) {
        throw new Error('Please enter a valid grant amount');
      }

      // Step 1: Create holding for the grant
      const holdingPayload = {
        name: recommendation.organization_name,
        asset_type: assetType,
        funds_allocated: numericAmount,
        as_of: grantPeriodStart || new Date().toISOString().split('T')[0],
        sector: recommendation.sector,
        country: recommendation.country,
        status: 'Active',
        metadata: {
          from_recommendation_id: recommendation.id,
          ein: recommendation.ein,
        },
      };

      const holdingRes = await fetch(`/api/portfolio/${recommendation.portfolio_id}/holdings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(holdingPayload),
      });

      if (!holdingRes.ok) {
        const errorData = await holdingRes.json();
        throw new Error(errorData.error || 'Failed to create grant holding');
      }

      const holdingResult = await holdingRes.json();
      const holdingId = holdingResult.id;

      // Step 2: Create grant details
      const grantDetailsPayload = {
        holding_id: holdingId,
        grant_type: grantType,
        grant_period_start: grantPeriodStart || null,
        grant_period_end: grantPeriodEnd || null,
        deliverables: deliverables || null,
        reporting_frequency: reportingFrequency || null,
        renewal_eligible: renewalEligible,
        renewal_date: renewalDate || null,
      };

      const grantDetailsRes = await fetch(
        `/api/portfolio/${recommendation.portfolio_id}/holdings/${holdingId}/grant-details`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(grantDetailsPayload),
        }
      );

      if (!grantDetailsRes.ok) {
        const errorData = await grantDetailsRes.json();
        // If grant details creation fails, we should still report success for the holding
        console.error('Failed to create grant details:', errorData);
      }

      onSuccess(holdingId);
    } catch (err: any) {
      console.error('Error creating grant:', err);
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
            <h2 className="text-xl font-semibold text-neutral-900">Create Grant</h2>
            <p className="text-sm text-neutral-600 mt-1">
              Set up a grant for {recommendation.organization_name}
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
            <div className="text-sm font-medium text-neutral-700 mb-2">Grantee Organization</div>
            <div className="text-lg font-semibold text-neutral-900">{recommendation.organization_name}</div>
            {recommendation.ein && (
              <div className="text-sm text-neutral-600 mt-1">EIN: {recommendation.ein}</div>
            )}
            {recommendation.sector && (
              <div className="text-sm text-neutral-600">Sector: {recommendation.sector}</div>
            )}
          </div>

          {/* Grant Source */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Grant Source *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAssetType('foundation_grant')}
                className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                  assetType === 'foundation_grant'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-neutral-700 border-neutral-300 hover:border-emerald-600 hover:bg-emerald-50'
                }`}
              >
                <div>Foundation Grant</div>
                <div className="text-xs opacity-75 mt-1">From private foundation</div>
              </button>
              <button
                type="button"
                onClick={() => setAssetType('daf_grant')}
                className={`px-4 py-3 rounded-lg border text-sm font-medium transition-colors ${
                  assetType === 'daf_grant'
                    ? 'bg-emerald-600 text-white border-emerald-600'
                    : 'bg-white text-neutral-700 border-neutral-300 hover:border-emerald-600 hover:bg-emerald-50'
                }`}
              >
                <div>DAF Grant</div>
                <div className="text-xs opacity-75 mt-1">Donor-Advised Fund</div>
              </button>
            </div>
          </div>

          {/* Grant Amount */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Grant Amount *
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
                className="w-full pl-8 pr-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                placeholder="0.00"
              />
            </div>
          </div>

          {/* Grant Type */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Grant Type *
            </label>
            <select
              value={grantType}
              onChange={(e) => setGrantType(e.target.value as GrantType)}
              required
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
            >
              {Object.entries(GRANT_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Grant Period */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={grantPeriodStart}
                onChange={(e) => setGrantPeriodStart(e.target.value)}
                className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={grantPeriodEnd}
                onChange={(e) => setGrantPeriodEnd(e.target.value)}
                min={grantPeriodStart}
                className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
              />
            </div>
          </div>

          {/* Reporting Frequency */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Reporting Frequency (optional)
            </label>
            <select
              value={reportingFrequency}
              onChange={(e) => setReportingFrequency(e.target.value)}
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
            >
              <option value="">Select frequency...</option>
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly</option>
              <option value="Semi-Annual">Semi-Annual</option>
              <option value="Annual">Annual</option>
              <option value="Final Only">Final Only</option>
            </select>
          </div>

          {/* Deliverables */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Deliverables & Expectations (optional)
            </label>
            <textarea
              value={deliverables}
              onChange={(e) => setDeliverables(e.target.value)}
              rows={4}
              placeholder="Describe expected deliverables, milestones, and reporting requirements..."
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600 resize-none"
            />
          </div>

          {/* Renewal Options */}
          <div className="p-4 bg-neutral-50 rounded-lg space-y-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={renewalEligible}
                onChange={(e) => setRenewalEligible(e.target.checked)}
                className="w-4 h-4 text-emerald-600 border-neutral-300 rounded focus:ring-emerald-600"
              />
              <span className="text-sm font-medium text-neutral-700">
                Eligible for renewal
              </span>
            </label>

            {renewalEligible && (
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-2">
                  Renewal Date
                </label>
                <input
                  type="date"
                  value={renewalDate}
                  onChange={(e) => setRenewalDate(e.target.value)}
                  className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-emerald-600 focus:border-emerald-600"
                />
              </div>
            )}
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
              className="px-6 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 shadow-soft"
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
                'Create Grant'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
