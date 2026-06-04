'use client';

import * as React from 'react';
import { DONOR_FILING_STATUS_LABELS, STANDARD_DEDUCTIONS_2024, type DonorFilingStatus } from '@/lib/schemas/tax';

export interface TaxYearAGIFormProps {
  portfolioId: string;
  year?: number;
  initialData?: {
    adjusted_gross_income?: number | null;
    filing_status?: DonorFilingStatus | null;
    standard_deduction?: number | null;
    amt_exposure?: boolean | null;
    amt_notes?: string | null;
    carryforward_from_prior_years?: number | null;
    notes?: string | null;
  };
  onSave?: () => void;
  onCancel?: () => void;
}

export default function TaxYearAGIForm({
  portfolioId,
  year = new Date().getFullYear(),
  initialData,
  onSave,
  onCancel,
}: TaxYearAGIFormProps) {
  const [taxYear, setTaxYear] = React.useState(year);
  const [agi, setAgi] = React.useState(initialData?.adjusted_gross_income?.toString() || '');
  const [filingStatus, setFilingStatus] = React.useState<DonorFilingStatus | ''>(
    initialData?.filing_status || ''
  );
  const [standardDeduction, setStandardDeduction] = React.useState(
    initialData?.standard_deduction?.toString() || ''
  );
  const [amtExposure, setAmtExposure] = React.useState(initialData?.amt_exposure || false);
  const [amtNotes, setAmtNotes] = React.useState(initialData?.amt_notes || '');
  const [carryforwardPrior, setCarryforwardPrior] = React.useState(
    initialData?.carryforward_from_prior_years?.toString() || ''
  );
  const [notes, setNotes] = React.useState(initialData?.notes || '');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  // Auto-calculate AGI limits
  const agiLimits = React.useMemo(() => {
    const agiNum = parseFloat(agi) || 0;
    return {
      limit_60: agiNum * 0.60,
      limit_50: agiNum * 0.50,
      limit_30: agiNum * 0.30,
      limit_20: agiNum * 0.20,
    };
  }, [agi]);

  // Auto-populate standard deduction based on filing status
  React.useEffect(() => {
    if (filingStatus && taxYear === 2024) {
      const stdDed = STANDARD_DEDUCTIONS_2024[filingStatus as DonorFilingStatus];
      if (stdDed) {
        setStandardDeduction(stdDed.toString());
      }
    }
  }, [filingStatus, taxYear]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(false);

    try {
      const payload = {
        tax_year: taxYear,
        adjusted_gross_income: agi ? parseFloat(agi) : null,
        filing_status: filingStatus || null,
        standard_deduction: standardDeduction ? parseFloat(standardDeduction) : null,
        amt_exposure: amtExposure,
        amt_notes: amtNotes || null,
        carryforward_from_prior_years: carryforwardPrior ? parseFloat(carryforwardPrior) : null,
        notes: notes || null,
      };

      const method = initialData ? 'PUT' : 'POST';
      const url = `/api/portfolio/${portfolioId}/tax-years`;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save tax year data');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onSave?.();
    } catch (err: any) {
      setError(err.message || 'Failed to save tax year data');
    } finally {
      setBusy(false);
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white rounded-xl border border-neutral-200 p-6">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">
          Tax Year {taxYear} - AGI & Limits
        </h3>
        <p className="text-sm text-neutral-600 mb-6">
          Enter your Adjusted Gross Income to calculate precise charitable deduction limits.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            Tax year data saved successfully
          </div>
        )}

        <div className="space-y-4">
          {/* Tax Year */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Tax Year <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={taxYear}
              onChange={(e) => setTaxYear(parseInt(e.target.value))}
              min="2000"
              max="2100"
              required
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>

          {/* AGI */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Adjusted Gross Income (AGI) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <span className="absolute left-4 top-2 text-neutral-500">$</span>
              <input
                type="number"
                value={agi}
                onChange={(e) => setAgi(e.target.value)}
                placeholder="1000000"
                step="0.01"
                required
                className="w-full pl-8 pr-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              From your tax return (Form 1040, Line 11)
            </p>
          </div>

          {/* Filing Status */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Filing Status
            </label>
            <select
              value={filingStatus}
              onChange={(e) => setFilingStatus(e.target.value as DonorFilingStatus)}
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            >
              <option value="">Select filing status...</option>
              {Object.entries(DONOR_FILING_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Standard Deduction */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Standard Deduction
            </label>
            <div className="relative">
              <span className="absolute left-4 top-2 text-neutral-500">$</span>
              <input
                type="number"
                value={standardDeduction}
                onChange={(e) => setStandardDeduction(e.target.value)}
                placeholder="14600"
                step="0.01"
                className="w-full pl-8 pr-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Auto-populated based on filing status (2024 values)
            </p>
          </div>

          {/* Carryforward from Prior Years */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Carryforward from Prior Years
            </label>
            <div className="relative">
              <span className="absolute left-4 top-2 text-neutral-500">$</span>
              <input
                type="number"
                value={carryforwardPrior}
                onChange={(e) => setCarryforwardPrior(e.target.value)}
                placeholder="0"
                step="0.01"
                className="w-full pl-8 pr-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Unused charitable deductions from previous years
            </p>
          </div>

          {/* AMT Exposure */}
          <div>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={amtExposure}
                onChange={(e) => setAmtExposure(e.target.checked)}
                className="w-4 h-4 text-indigo-600 border-neutral-300 rounded focus:ring-indigo-500"
              />
              <span className="text-sm font-medium text-neutral-700">
                Subject to Alternative Minimum Tax (AMT)
              </span>
            </label>
            {amtExposure && (
              <textarea
                value={amtNotes}
                onChange={(e) => setAmtNotes(e.target.value)}
                rows={2}
                placeholder="AMT notes or considerations..."
                className="mt-2 w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm"
              />
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Additional tax planning notes for this year..."
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* AGI Limits Preview */}
        {agi && parseFloat(agi) > 0 && (
          <div className="mt-6 bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-200 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-indigo-900 mb-3">
              Calculated Deduction Limits
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white rounded-lg p-3">
                <p className="text-xs text-neutral-600 mb-1">Cash to Public Charity</p>
                <p className="text-lg font-bold text-indigo-600">
                  {formatCurrency(agiLimits.limit_60)}
                </p>
                <p className="text-xs text-neutral-500">60% of AGI</p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-xs text-neutral-600 mb-1">Conservation Easements</p>
                <p className="text-lg font-bold text-green-600">
                  {formatCurrency(agiLimits.limit_50)}
                </p>
                <p className="text-xs text-neutral-500">50% of AGI</p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-xs text-neutral-600 mb-1">Appreciated Property</p>
                <p className="text-lg font-bold text-purple-600">
                  {formatCurrency(agiLimits.limit_30)}
                </p>
                <p className="text-xs text-neutral-500">30% of AGI</p>
              </div>
              <div className="bg-white rounded-lg p-3">
                <p className="text-xs text-neutral-600 mb-1">Property to Foundation</p>
                <p className="text-lg font-bold text-amber-600">
                  {formatCurrency(agiLimits.limit_20)}
                </p>
                <p className="text-xs text-neutral-500">20% of AGI</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-end gap-3">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-neutral-700 hover:text-neutral-900 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        )}
        <button
          type="submit"
          disabled={busy}
          className="px-6 py-2 bg-gradient-to-r from-indigo-600 to-indigo-500 text-white rounded-lg hover:opacity-90 transition-opacity font-medium shadow-sm disabled:opacity-50"
        >
          {busy ? 'Saving...' : initialData ? 'Update Tax Year' : 'Save Tax Year'}
        </button>
      </div>
    </form>
  );
}
