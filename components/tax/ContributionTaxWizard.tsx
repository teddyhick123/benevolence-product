'use client';

import { useState } from 'react';
import {
  CONTRIBUTION_TYPE_LABELS,
  RECIPIENT_TYPE_LABELS,
  EIN_PLACEHOLDER,
  SUBSTANTIATION_THRESHOLDS,
} from '@/lib/tax/constants';
import { explainSubstantiationRequirements } from '@/lib/tax/substantiation-validator';
import type { ContributionType, RecipientType } from '@/lib/schemas/tax';

interface ContributionTaxWizardProps {
  portfolioId: string;
  taxYear: number;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function ContributionTaxWizard({
  portfolioId,
  taxYear,
  onSuccess,
  onCancel,
}: ContributionTaxWizardProps) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form data
  const [contributionDate, setContributionDate] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEIN, setRecipientEIN] = useState('');
  const [recipientType, setRecipientType] = useState<RecipientType | ''>('');
  const [contributionType, setContributionType] = useState<ContributionType | ''>('cash');
  const [amount, setAmount] = useState('');
  const [fmv, setFmv] = useState('');
  const [costBasis, setCostBasis] = useState('');
  const [dateAcquired, setDateAcquired] = useState('');
  const [propertyDescription, setPropertyDescription] = useState('');
  const [acknowledgmentReceived, setAcknowledgmentReceived] = useState(false);
  const [notes, setNotes] = useState('');

  const isNonCash = contributionType && !['cash', 'check', 'wire'].includes(contributionType);
  const amountNum = parseFloat(amount) || 0;
  const requiresAppraisal = isNonCash && amountNum >= SUBSTANTIATION_THRESHOLDS.QUALIFIED_APPRAISAL_THRESHOLD;

  async function handleSubmit() {
    try {
      setSaving(true);
      setError(null);

      const body = {
        portfolio_id: portfolioId,
        tax_year: taxYear,
        contribution_date: contributionDate,
        recipient_name: recipientName,
        recipient_ein: recipientEIN || null,
        recipient_type: recipientType || null,
        contribution_type: contributionType,
        amount_usd: parseFloat(amount),
        fmv_at_donation: isNonCash && fmv ? parseFloat(fmv) : null,
        cost_basis: isNonCash && costBasis ? parseFloat(costBasis) : null,
        date_acquired: isNonCash && dateAcquired ? dateAcquired : null,
        property_description: isNonCash ? propertyDescription : null,
        acknowledgment_received: acknowledgmentReceived,
        notes: notes || null,
      };

      const res = await fetch(`/api/portfolio/${portfolioId}/tax/contributions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to save contribution');
      }

      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function nextStep() {
    setError(null);
    setStep(step + 1);
  }

  function prevStep() {
    setError(null);
    setStep(step - 1);
  }

  function canProceedFromStep1() {
    return contributionDate && recipientName && amount && parseFloat(amount) > 0;
  }

  function canProceedFromStep2() {
    if (!isNonCash) return true;
    if (amountNum > 500 && !fmv) return false;
    return true;
  }

  const substantiationText = contributionType && amountNum > 0
    ? explainSubstantiationRequirements(amountNum, contributionType)
    : '';

  return (
    <div className="border border-black/5 rounded-2xl bg-white">
      {/* Header */}
      <div className="border-b border-black/5 px-6 py-4">
        <h2 className="text-xl font-bold text-ink">Add Tax Contribution</h2>
        <p className="text-sm text-neutral-600 mt-1">Step {step} of 3</p>
      </div>

      {/* Progress Bar */}
      <div className="px-6 py-4 border-b border-black/5">
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`flex-1 h-2 rounded-full ${
                s <= step ? 'bg-azure' : 'bg-neutral-200'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-6 py-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-2xl text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Step 1: Basic Info */}
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-ink">Basic Information</h3>

            <div>
              <label htmlFor="contrib-date" className="block text-sm font-medium text-neutral-700 mb-2">
                Contribution Date *
              </label>
              <input
                type="date"
                id="contrib-date"
                value={contributionDate}
                onChange={(e) => setContributionDate(e.target.value)}
                max={`${taxYear}-12-31`}
                className="w-full px-3 py-2 border border-black/10 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
              />
            </div>

            <div>
              <label htmlFor="recipient-name" className="block text-sm font-medium text-neutral-700 mb-2">
                Recipient Name *
              </label>
              <input
                type="text"
                id="recipient-name"
                value={recipientName}
                onChange={(e) => setRecipientName(e.target.value)}
                placeholder="e.g., American Red Cross"
                className="w-full px-3 py-2 border border-black/10 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
              />
            </div>

            <div>
              <label htmlFor="recipient-ein" className="block text-sm font-medium text-neutral-700 mb-2">
                EIN (Employer Identification Number)
              </label>
              <input
                type="text"
                id="recipient-ein"
                value={recipientEIN}
                onChange={(e) => setRecipientEIN(e.target.value)}
                placeholder={EIN_PLACEHOLDER}
                maxLength={10}
                className="w-full px-3 py-2 border border-black/10 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
              />
              <p className="mt-1 text-xs text-neutral-500">Format: XX-XXXXXXX</p>
            </div>

            <div>
              <label htmlFor="recipient-type" className="block text-sm font-medium text-neutral-700 mb-2">
                Recipient Type
              </label>
              <select
                id="recipient-type"
                value={recipientType}
                onChange={(e) => setRecipientType(e.target.value as RecipientType | '')}
                className="w-full px-3 py-2 border border-black/10 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
              >
                <option value="">Select type</option>
                {Object.entries(RECIPIENT_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="contrib-type" className="block text-sm font-medium text-neutral-700 mb-2">
                Contribution Type *
              </label>
              <select
                id="contrib-type"
                value={contributionType}
                onChange={(e) => setContributionType(e.target.value as ContributionType)}
                className="w-full px-3 py-2 border border-black/10 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
              >
                {Object.entries(CONTRIBUTION_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="amount" className="block text-sm font-medium text-neutral-700 mb-2">
                Amount *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
                <input
                  type="number"
                  id="amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  step="0.01"
                  className="w-full pl-7 pr-3 py-2 border border-black/10 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Additional Details (for non-cash) */}
        {step === 2 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-ink">
              {isNonCash ? 'Non-Cash Contribution Details' : 'Additional Information'}
            </h3>

            {isNonCash ? (
              <>
                <div className="bg-azure/10 border border-azure/20 rounded-2xl p-3 text-sm text-azure">
                  Non-cash contributions require additional documentation for IRS compliance.
                </div>

                <div>
                  <label htmlFor="fmv" className="block text-sm font-medium text-neutral-700 mb-2">
                    Fair Market Value (FMV) at Donation {amountNum > 500 ? '*' : ''}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
                    <input
                      type="number"
                      id="fmv"
                      value={fmv}
                      onChange={(e) => setFmv(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      className="w-full pl-7 pr-3 py-2 border border-black/10 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                    />
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    The value of the property on the date of donation
                  </p>
                </div>

                <div>
                  <label htmlFor="cost-basis" className="block text-sm font-medium text-neutral-700 mb-2">
                    Cost Basis
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-500">$</span>
                    <input
                      type="number"
                      id="cost-basis"
                      value={costBasis}
                      onChange={(e) => setCostBasis(e.target.value)}
                      placeholder="0.00"
                      step="0.01"
                      className="w-full pl-7 pr-3 py-2 border border-black/10 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                    />
                  </div>
                  <p className="mt-1 text-xs text-neutral-500">
                    What you originally paid for the property
                  </p>
                </div>

                <div>
                  <label htmlFor="date-acquired" className="block text-sm font-medium text-neutral-700 mb-2">
                    Date Acquired
                  </label>
                  <input
                    type="date"
                    id="date-acquired"
                    value={dateAcquired}
                    onChange={(e) => setDateAcquired(e.target.value)}
                    max={contributionDate || undefined}
                    className="w-full px-3 py-2 border border-black/10 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    When you acquired the property (for capital gains calculation)
                  </p>
                </div>

                <div>
                  <label htmlFor="property-desc" className="block text-sm font-medium text-neutral-700 mb-2">
                    Property Description
                  </label>
                  <textarea
                    id="property-desc"
                    value={propertyDescription}
                    onChange={(e) => setPropertyDescription(e.target.value)}
                    rows={3}
                    placeholder="e.g., 100 shares of Apple Inc. (AAPL) common stock"
                    className="w-full px-3 py-2 border border-black/10 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                  />
                </div>

                {requiresAppraisal && (
                  <div className="bg-sunset/15 border border-sunset/30 rounded-2xl p-3 text-sm text-ink">
                    <strong>Qualified Appraisal Required:</strong> For non-cash contributions over $5,000,
                    the IRS requires a qualified appraisal by an independent appraiser. You&apos;ll need to upload
                    this documentation later.
                  </div>
                )}
              </>
            ) : (
              <div>
                <label htmlFor="notes-step2" className="block text-sm font-medium text-neutral-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  id="notes-step2"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={4}
                  placeholder="Add any additional notes about this contribution..."
                  className="w-full px-3 py-2 border border-black/10 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                />
              </div>
            )}
          </div>
        )}

        {/* Step 3: Substantiation & Review */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="font-semibold text-ink">Substantiation & Review</h3>

            {substantiationText && (
              <div className="bg-azure/10 border border-azure/20 rounded-2xl p-4 text-sm text-ink">
                <strong className="block mb-2">IRS Documentation Requirements:</strong>
                {substantiationText}
              </div>
            )}

            <div className="flex items-start gap-3 p-3 bg-neutral-50 rounded-2xl">
              <input
                type="checkbox"
                id="acknowledgment"
                checked={acknowledgmentReceived}
                onChange={(e) => setAcknowledgmentReceived(e.target.checked)}
                className="mt-1"
              />
              <label htmlFor="acknowledgment" className="text-sm text-neutral-700">
                I have received (or will receive) a written acknowledgment from the charity
                {amountNum >= SUBSTANTIATION_THRESHOLDS.ACKNOWLEDGMENT_REQUIRED && (
                  <span className="text-red-600"> (required for contributions $250+)</span>
                )}
              </label>
            </div>

            {!isNonCash && (
              <div>
                <label htmlFor="notes-step3" className="block text-sm font-medium text-neutral-700 mb-2">
                  Notes (Optional)
                </label>
                <textarea
                  id="notes-step3"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  placeholder="Add any additional notes..."
                  className="w-full px-3 py-2 border border-black/10 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-azure/30 focus:border-azure"
                />
              </div>
            )}

            {/* Review Summary */}
            <div className="border-t border-black/5 pt-4">
              <h4 className="text-sm font-semibold text-ink mb-3">Summary</h4>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-neutral-600">Date:</dt>
                  <dd className="font-medium text-ink">{contributionDate}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-600">Recipient:</dt>
                  <dd className="font-medium text-ink">{recipientName}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-600">Type:</dt>
                  <dd className="font-medium text-ink">
                    {contributionType && CONTRIBUTION_TYPE_LABELS[contributionType]}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-neutral-600">Amount:</dt>
                  <dd className="font-semibold text-ink text-lg">
                    ${parseFloat(amount).toLocaleString()}
                  </dd>
                </div>
              </dl>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-black/5 px-6 py-4 flex items-center justify-between">
        <div>
          {step > 1 && (
            <button
              onClick={prevStep}
              disabled={saving}
              className="text-sm text-neutral-600 hover:text-ink disabled:opacity-50"
            >
              ← Back
            </button>
          )}
        </div>
        <div className="flex items-center gap-3">
          {onCancel && (
            <button
              onClick={onCancel}
              disabled={saving}
              className="px-4 py-2 border border-black/10 text-neutral-700 rounded-2xl hover:bg-neutral-50 disabled:opacity-50 text-sm"
            >
              Cancel
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={nextStep}
              disabled={
                (step === 1 && !canProceedFromStep1()) ||
                (step === 2 && !canProceedFromStep2())
              }
              className="px-4 py-2 bg-azure text-white rounded-2xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="px-4 py-2 bg-azure text-white rounded-2xl hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
            >
              {saving ? 'Saving...' : 'Save Contribution'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
