'use client';

import { useState, useEffect } from 'react';
import { FILING_STATUS_LABELS, getStandardDeduction, AGI_LIMIT_PERCENTAGES } from '@/lib/tax/constants';
import type { FilingStatus } from '@/lib/schemas/tax';

interface TaxProfile {
  id?: string;
  portfolio_id: string;
  tax_year: number;
  filing_status: FilingStatus | null;
  estimated_agi: number | null;
  carryforward_from_prior: number;
}

interface TaxProfileSetupProps {
  portfolioId: string;
  taxYear: number;
  onSave?: () => void;
}

export default function TaxProfileSetup({ portfolioId, taxYear, onSave }: TaxProfileSetupProps) {
  const [profile, setProfile] = useState<TaxProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  // Form state
  const [filingStatus, setFilingStatus] = useState<FilingStatus | ''>('');
  const [estimatedAGI, setEstimatedAGI] = useState('');
  const [carryforward, setCarryforward] = useState('0');

  // Fetch existing profile
  useEffect(() => {
    async function fetchProfile() {
      try {
        setLoading(true);
        const res = await fetch(`/api/portfolio/${portfolioId}/tax/profile?year=${taxYear}`);

        if (!res.ok) throw new Error('Failed to fetch tax profile');

        const json = await res.json();

        if (json.data) {
          setProfile(json.data);
          setFilingStatus(json.data.filing_status || '');
          setEstimatedAGI(json.data.estimated_agi?.toString() || '');
          setCarryforward(json.data.carryforward_from_prior?.toString() || '0');
        } else {
          // No profile exists yet
          setIsEditing(true);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchProfile();
  }, [portfolioId, taxYear]);

  async function handleSave() {
    if (!filingStatus || !estimatedAGI) {
      setError('Filing status and estimated AGI are required');
      return;
    }

    const agiNum = parseFloat(estimatedAGI);
    if (isNaN(agiNum) || agiNum < 0) {
      setError('Please enter a valid AGI amount');
      return;
    }

    const carryforwardNum = parseFloat(carryforward || '0');
    if (isNaN(carryforwardNum) || carryforwardNum < 0) {
      setError('Please enter a valid carryforward amount');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const body = {
        portfolio_id: portfolioId,
        tax_year: taxYear,
        filing_status: filingStatus,
        estimated_agi: agiNum,
        carryforward_from_prior: carryforwardNum,
      };

      const method = profile ? 'PUT' : 'POST';
      const url = profile
        ? `/api/portfolio/${portfolioId}/tax/profile?year=${taxYear}`
        : `/api/portfolio/${portfolioId}/tax/profile`;

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to save tax profile');
      }

      const json = await res.json();
      setProfile(json.data);
      setIsEditing(false);

      if (onSave) onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    if (profile) {
      setFilingStatus(profile.filing_status || '');
      setEstimatedAGI(profile.estimated_agi?.toString() || '');
      setCarryforward(profile.carryforward_from_prior?.toString() || '0');
      setIsEditing(false);
      setError(null);
    }
  }

  if (loading) {
    return (
      <div className="border border-gray-200 rounded-lg p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          <div className="h-10 bg-gray-200 rounded"></div>
          <div className="h-10 bg-gray-200 rounded"></div>
        </div>
      </div>
    );
  }

  const agiNum = parseFloat(estimatedAGI) || 0;
  const standardDeduction = filingStatus ? getStandardDeduction(taxYear, filingStatus as FilingStatus) : 0;

  return (
    <div className="border border-gray-200 rounded-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Tax Profile</h2>
          <p className="text-sm text-gray-600 mt-1">
            {taxYear} tax year information
          </p>
        </div>
        {!isEditing && profile && (
          <button
            onClick={() => setIsEditing(true)}
            className="text-sm text-azure hover:text-azure font-medium"
          >
            Edit
          </button>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      {isEditing ? (
        <div className="space-y-4">
          {/* Filing Status */}
          <div>
            <label htmlFor="filing-status" className="block text-sm font-medium text-gray-700 mb-2">
              Filing Status
            </label>
            <select
              id="filing-status"
              value={filingStatus}
              onChange={(e) => setFilingStatus(e.target.value as FilingStatus | '')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-azure focus:border-azure"
            >
              <option value="">Select filing status</option>
              {Object.entries(FILING_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {filingStatus && (
              <p className="mt-1 text-xs text-gray-500">
                Standard deduction: ${standardDeduction.toLocaleString()}
              </p>
            )}
          </div>

          {/* Estimated AGI */}
          <div>
            <label htmlFor="estimated-agi" className="block text-sm font-medium text-gray-700 mb-2">
              Estimated Adjusted Gross Income (AGI)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                id="estimated-agi"
                value={estimatedAGI}
                onChange={(e) => setEstimatedAGI(e.target.value)}
                placeholder="0"
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-azure focus:border-azure"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Your estimated AGI for {taxYear} (used to calculate deduction limits)
            </p>
          </div>

          {/* Carryforward from Prior Years */}
          <div>
            <label htmlFor="carryforward" className="block text-sm font-medium text-gray-700 mb-2">
              Carryforward from Prior Years (Optional)
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                id="carryforward"
                value={carryforward}
                onChange={(e) => setCarryforward(e.target.value)}
                placeholder="0"
                className="w-full pl-7 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-azure focus:border-azure"
              />
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Unused charitable contribution deductions from previous years
            </p>
          </div>

          {/* AGI Limits Preview */}
          {agiNum > 0 && (
            <div className="pt-4 border-t border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Your {taxYear} Deduction Limits
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Cash to public charities (60%):</span>
                  <span className="font-semibold text-gray-900">
                    ${(agiNum * AGI_LIMIT_PERCENTAGES.CASH_PUBLIC_CHARITY).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Appreciated assets to public (30%):</span>
                  <span className="font-semibold text-gray-900">
                    ${(agiNum * AGI_LIMIT_PERCENTAGES.APPRECIATED_ASSETS_PUBLIC).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Cash to foundations (30%):</span>
                  <span className="font-semibold text-gray-900">
                    ${(agiNum * AGI_LIMIT_PERCENTAGES.CASH_PRIVATE_FOUNDATION).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Property to foundations (20%):</span>
                  <span className="font-semibold text-gray-900">
                    ${(agiNum * AGI_LIMIT_PERCENTAGES.PROPERTY_PRIVATE_FOUNDATION).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-4">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-azure text-white rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
            >
              {saving ? 'Saving...' : 'Save Profile'}
            </button>
            {profile && (
              <button
                onClick={handleCancel}
                disabled={saving}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      ) : profile ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <div className="text-sm text-gray-600 mb-1">Filing Status</div>
              <div className="font-semibold text-gray-900">
                {profile.filing_status ? FILING_STATUS_LABELS[profile.filing_status] : 'Not set'}
              </div>
            </div>
            <div>
              <div className="text-sm text-gray-600 mb-1">Estimated AGI</div>
              <div className="font-semibold text-gray-900">
                ${profile.estimated_agi?.toLocaleString() || '0'}
              </div>
            </div>
          </div>

          {profile.carryforward_from_prior > 0 && (
            <div>
              <div className="text-sm text-gray-600 mb-1">Carryforward from Prior Years</div>
              <div className="font-semibold text-gray-900">
                ${profile.carryforward_from_prior.toLocaleString()}
              </div>
            </div>
          )}

          {profile.estimated_agi && (
            <div className="pt-4 border-t border-gray-200">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">
                Deduction Limits
              </h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Cash to public charities (60%):</span>
                  <span className="font-semibold text-gray-900">
                    ${(profile.estimated_agi * AGI_LIMIT_PERCENTAGES.CASH_PUBLIC_CHARITY).toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Appreciated assets (30%):</span>
                  <span className="font-semibold text-gray-900">
                    ${(profile.estimated_agi * AGI_LIMIT_PERCENTAGES.APPRECIATED_ASSETS_PUBLIC).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-6">
          <p className="text-gray-600 mb-4">No tax profile set up for {taxYear}</p>
          <button
            onClick={() => setIsEditing(true)}
            className="px-4 py-2 bg-azure text-white rounded-md hover:opacity-90 font-medium text-sm"
          >
            Set Up Profile
          </button>
        </div>
      )}
    </div>
  );
}
