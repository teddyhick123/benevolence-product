'use client';

import * as React from 'react';
import { DONOR_FILING_STATUS_LABELS, type DonorFilingStatus } from '@/lib/schemas/tax';

export interface DonorProfileFormProps {
  portfolioId: string;
  initialData?: {
    date_of_birth?: string | null;
    filing_status?: DonorFilingStatus | null;
    notes?: string | null;
  };
  onSave?: () => void;
  onCancel?: () => void;
}

export default function DonorProfileForm({
  portfolioId,
  initialData,
  onSave,
  onCancel,
}: DonorProfileFormProps) {
  const [dateOfBirth, setDateOfBirth] = React.useState(initialData?.date_of_birth || '');
  const [filingStatus, setFilingStatus] = React.useState(initialData?.filing_status || '');
  const [notes, setNotes] = React.useState(initialData?.notes || '');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState(false);

  // Calculate age if DOB is entered
  const age = React.useMemo(() => {
    if (!dateOfBirth) return null;
    const today = new Date();
    const birthDate = new Date(dateOfBirth);
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }, [dateOfBirth]);

  // Check QCD eligibility
  const qcdEligible = age !== null && age >= 70.5;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(false);

    try {
      const payload = {
        date_of_birth: dateOfBirth || null,
        filing_status: filingStatus || null,
        notes: notes || null,
      };

      const method = initialData ? 'PUT' : 'POST';
      const url = `/api/portfolio/${portfolioId}/donor-profile`;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to save donor profile');
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
      onSave?.();
    } catch (err: any) {
      setError(err.message || 'Failed to save donor profile');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-white rounded-xl border border-neutral-200 p-6">
        <h3 className="text-lg font-semibold text-neutral-900 mb-4">
          Donor Profile
        </h3>
        <p className="text-sm text-neutral-600 mb-6">
          This information helps validate tax deductions and QCD eligibility.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700">
            ✅ Donor profile saved successfully
          </div>
        )}

        <div className="space-y-4">
          {/* Date of Birth */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Date of Birth
              <span className="ml-1 text-neutral-500 font-normal">(optional)</span>
            </label>
            <input
              type="date"
              value={dateOfBirth}
              onChange={(e) => setDateOfBirth(e.target.value)}
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
            {age !== null && (
              <div className="mt-2 flex items-center gap-4">
                <p className="text-sm text-neutral-600">
                  Age: <span className="font-medium">{age}</span>
                </p>
                {qcdEligible && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                    ✓ QCD Eligible (70.5+)
                  </span>
                )}
                {!qcdEligible && age >= 65 && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                    QCD Eligible at 70.5
                  </span>
                )}
              </div>
            )}
            <p className="mt-1 text-xs text-neutral-500">
              Required for validating Qualified Charitable Distributions (QCDs)
            </p>
          </div>

          {/* Filing Status */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Tax Filing Status
              <span className="ml-1 text-neutral-500 font-normal">(optional)</span>
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
            <p className="mt-1 text-xs text-neutral-500">
              Affects standard deduction and AGI thresholds
            </p>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-neutral-700 mb-2">
              Notes
              <span className="ml-1 text-neutral-500 font-normal">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Additional information about donor tax situation..."
              className="w-full px-4 py-2 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Info Box */}
        <div className="mt-6 bg-indigo-50 border border-indigo-200 rounded-lg p-4">
          <div className="flex gap-3">
            <div className="text-2xl">ℹ️</div>
            <div className="text-sm text-indigo-900">
              <p className="font-medium mb-1">Privacy & Security</p>
              <p>
                This information is stored securely and only used for tax calculations within your
                portfolio. It is never shared with third parties.
              </p>
            </div>
          </div>
        </div>
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
          {busy ? 'Saving...' : initialData ? 'Update Profile' : 'Save Profile'}
        </button>
      </div>
    </form>
  );
}
