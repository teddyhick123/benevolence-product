'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CONTRIBUTION_TYPE_LABELS,
  RECIPIENT_TYPE_LABELS,
  EIN_PLACEHOLDER,
} from '@/lib/tax/constants';
import { explainSubstantiationRequirements } from '@/lib/tax/substantiation-validator';
import type { ContributionType, RecipientType } from '@/lib/schemas/tax';
import DocumentUploader from './DocumentUploader';
import DocumentsList from './DocumentsList';

interface ContributionDetail {
  id: string;
  portfolio_id: string;
  holding_id: string | null;
  tax_year: number;
  contribution_date: string;
  recipient_name: string;
  recipient_ein: string | null;
  recipient_type: RecipientType | null;
  contribution_type: ContributionType;
  amount_usd: number;
  fmv_at_donation: number | null;
  cost_basis: number | null;
  date_acquired: string | null;
  property_description: string | null;
  receipt_storage_path: string | null;
  acknowledgment_received: boolean;
  acknowledgment_date: string | null;
  acknowledgment_storage_path: string | null;
  quid_pro_quo_value: number;
  requires_appraisal: boolean;
  appraisal_storage_path: string | null;
  appraisal_date: string | null;
  appraiser_name: string | null;
  deductible_amount: number | null;
  notes: string | null;
  is_compliant: boolean;
  substantiation_requirement: string;
  holding_name: string | null;
}

interface ContributionDetailModalProps {
  contributionId: string;
  portfolioId: string;
  onClose: () => void;
  onUpdate: () => void;
}

export default function ContributionDetailModal({
  contributionId,
  portfolioId,
  onClose,
  onUpdate,
}: ContributionDetailModalProps) {
  const [contribution, setContribution] = useState<ContributionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [docRefresh, setDocRefresh] = useState(0);
  const [showUploader, setShowUploader] = useState(false);

  // Edit form state
  const [formData, setFormData] = useState<Partial<ContributionDetail>>({});

  async function fetchContribution() {
    try {
      setLoading(true);
      const res = await fetch(
        `/api/portfolio/${portfolioId}/tax/contributions/${contributionId}`
      );

      if (!res.ok) throw new Error('Failed to fetch contribution');

      const json = await res.json();
      setContribution(json.data);
      setFormData(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchContribution();
  }, [portfolioId, contributionId]);

  // Callback for document upload completion
  const handleUploadComplete = useCallback(() => {
    setDocRefresh((r) => r + 1);
    setShowUploader(false);
    fetchContribution(); // Refresh to get updated storage paths
  }, []);

  async function handleSave() {
    try {
      setSaving(true);
      setError(null);

      const res = await fetch(
        `/api/portfolio/${portfolioId}/tax/contributions/${contributionId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        }
      );

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to update contribution');
      }

      const json = await res.json();
      setContribution(json.data);
      setEditing(false);
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setFormData(contribution || {});
    setEditing(false);
    setError(null);
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-8 max-w-2xl w-full">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            <div className="space-y-3">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-16 bg-gray-100 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !contribution) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-6 max-w-md w-full">
          <h3 className="text-lg font-semibold text-red-900 mb-2">Error</h3>
          <p className="text-sm text-red-700 mb-4">{error}</p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (!contribution) return null;

  const isNonCash = !['cash', 'check', 'wire'].includes(contribution.contribution_type);
  const substantiationText = explainSubstantiationRequirements(
    contribution.amount_usd,
    contribution.contribution_type
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              {contribution.recipient_name}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {new Date(contribution.contribution_date).toLocaleDateString()} •{' '}
              {CONTRIBUTION_TYPE_LABELS[contribution.contribution_type]}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!editing ? (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="px-4 py-2 bg-azure text-white rounded-md hover:opacity-90 text-sm font-medium"
                >
                  Edit
                </button>
                <button
                  onClick={onClose}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-azure text-white rounded-md hover:opacity-90 disabled:opacity-50 text-sm font-medium"
                >
                  {saving ? 'Saving...' : 'Save'}
                </button>
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 text-sm"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-6 space-y-6">
          {error && editing && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Amount */}
          <div className="bg-gray-50 rounded-lg p-6">
            <div className="text-sm text-gray-600 mb-1">Contribution Amount</div>
            <div className="text-4xl font-bold text-gray-900">
              ${contribution.amount_usd.toLocaleString()}
            </div>
            {contribution.deductible_amount && contribution.deductible_amount !== contribution.amount_usd && (
              <div className="text-sm text-gray-600 mt-2">
                Deductible: ${contribution.deductible_amount.toLocaleString()}
              </div>
            )}
          </div>

          {/* Basic Info */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Basic Information</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contribution Date
                </label>
                {editing ? (
                  <input
                    type="date"
                    value={formData.contribution_date || ''}
                    onChange={(e) => setFormData({ ...formData, contribution_date: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                ) : (
                  <div className="text-gray-900">
                    {new Date(contribution.contribution_date).toLocaleDateString()}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Tax Year
                </label>
                <div className="text-gray-900">{contribution.tax_year}</div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recipient Name
                </label>
                {editing ? (
                  <input
                    type="text"
                    value={formData.recipient_name || ''}
                    onChange={(e) => setFormData({ ...formData, recipient_name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                ) : (
                  <div className="text-gray-900">{contribution.recipient_name}</div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  EIN
                </label>
                {editing ? (
                  <input
                    type="text"
                    value={formData.recipient_ein || ''}
                    onChange={(e) => setFormData({ ...formData, recipient_ein: e.target.value })}
                    placeholder={EIN_PLACEHOLDER}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  />
                ) : (
                  <div className="text-gray-900">{contribution.recipient_ein || 'Not provided'}</div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Recipient Type
                </label>
                {editing ? (
                  <select
                    value={formData.recipient_type || ''}
                    onChange={(e) => setFormData({ ...formData, recipient_type: e.target.value as RecipientType })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="">Select type</option>
                    {Object.entries(RECIPIENT_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="text-gray-900">
                    {contribution.recipient_type
                      ? RECIPIENT_TYPE_LABELS[contribution.recipient_type]
                      : 'Not specified'}
                  </div>
                )}
              </div>

              {contribution.holding_name && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Linked Holding
                  </label>
                  <div className="text-gray-900">{contribution.holding_name}</div>
                </div>
              )}
            </div>
          </div>

          {/* Non-Cash Details */}
          {isNonCash && (
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Non-Cash Details</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Fair Market Value
                  </label>
                  <div className="text-gray-900">
                    ${contribution.fmv_at_donation?.toLocaleString() || 'Not provided'}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Cost Basis
                  </label>
                  <div className="text-gray-900">
                    ${contribution.cost_basis?.toLocaleString() || 'Not provided'}
                  </div>
                </div>

                {contribution.date_acquired && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date Acquired
                    </label>
                    <div className="text-gray-900">
                      {new Date(contribution.date_acquired).toLocaleDateString()}
                    </div>
                  </div>
                )}

                {contribution.property_description && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Property Description
                    </label>
                    <div className="text-gray-900">{contribution.property_description}</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Substantiation */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Substantiation</h3>

            <div className="bg-azure/10 border border-azure/20 rounded-md p-4 mb-4 text-sm text-ink">
              <strong>IRS Requirements:</strong>
              <p className="mt-1">{substantiationText}</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  id="acknowledgment"
                  checked={editing ? (formData.acknowledgment_received ?? false) : contribution.acknowledgment_received}
                  onChange={(e) => editing && setFormData({ ...formData, acknowledgment_received: e.target.checked })}
                  disabled={!editing}
                  className="mt-1"
                />
                <label htmlFor="acknowledgment" className="text-sm text-gray-700">
                  Written acknowledgment received from charity
                  {contribution.acknowledgment_date && (
                    <span className="text-gray-500 ml-2">
                      (on {new Date(contribution.acknowledgment_date).toLocaleDateString()})
                    </span>
                  )}
                </label>
              </div>

              {contribution.requires_appraisal && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-md text-sm text-amber-800">
                  <strong>Qualified Appraisal Required</strong>
                  {contribution.appraisal_storage_path ? (
                    <p className="mt-1">✓ Appraisal uploaded</p>
                  ) : (
                    <p className="mt-1">⚠️ Upload appraisal for IRS compliance</p>
                  )}
                </div>
              )}

              <div className={`p-4 rounded-lg ${
                contribution.is_compliant
                  ? 'bg-green-50 border border-green-200'
                  : 'bg-amber-50 border border-amber-200'
              }`}>
                <div className="flex items-center gap-2">
                  <span className={`font-semibold ${
                    contribution.is_compliant ? 'text-green-900' : 'text-amber-900'
                  }`}>
                    {contribution.is_compliant ? '✓ Compliant' : '⚠️ Action Required'}
                  </span>
                </div>
                {!contribution.is_compliant && (
                  <p className={`text-sm mt-2 ${
                    contribution.is_compliant ? 'text-green-800' : 'text-amber-800'
                  }`}>
                    Required: {contribution.substantiation_requirement}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Documents */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Documents</h3>
              {!showUploader && (
                <button
                  onClick={() => setShowUploader(true)}
                  className="px-3 py-1.5 bg-azure text-white rounded-md hover:opacity-90 text-sm font-medium"
                >
                  + Upload Document
                </button>
              )}
            </div>

            {showUploader && (
              <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-gray-700">Upload New Document</span>
                  <button
                    onClick={() => setShowUploader(false)}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <DocumentUploader
                  portfolioId={portfolioId}
                  contributionId={contributionId}
                  onUploadComplete={handleUploadComplete}
                  suggestedType={
                    contribution.requires_appraisal && !contribution.appraisal_storage_path
                      ? 'appraisal'
                      : !contribution.acknowledgment_received
                      ? 'acknowledgment'
                      : 'receipt'
                  }
                />
              </div>
            )}

            <DocumentsList
              portfolioId={portfolioId}
              contributionId={contributionId}
              refreshTrigger={docRefresh}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Notes
            </label>
            {editing ? (
              <textarea
                value={formData.notes || ''}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md"
                placeholder="Add notes about this contribution..."
              />
            ) : contribution.notes ? (
              <div className="text-gray-900 whitespace-pre-wrap">{contribution.notes}</div>
            ) : (
              <div className="text-gray-500 italic">No notes</div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4">
          <div className="text-xs text-gray-500">
            Created: {new Date(contribution.contribution_date).toLocaleDateString()} •
            ID: {contribution.id.slice(0, 8)}...
          </div>
        </div>
      </div>
    </div>
  );
}
