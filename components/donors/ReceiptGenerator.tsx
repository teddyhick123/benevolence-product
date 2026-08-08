'use client';

import { apiRequest, readJson } from "@/lib/api/client";

import { useState } from 'react';

type Contribution = {
  id: string;
  amount: number;
  contribution_date: string;
  gift_type: string;
  quid_pro_quo_value: number;
  tax_deductible_amount: number;
  receipt_number: string | null;
  receipt_status: string;
  designation: string | null;
  donors?: {
    first_name: string | null;
    last_name: string | null;
    organization_name: string | null;
    is_organization: boolean;
    email: string | null;
    address_line1: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
  };
};

type Organization = {
  name: string;
  ein: string | null;
};

interface Props {
  organizationId: string;
  contribution: Contribution;
  organization: Organization;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function ReceiptGenerator({ organizationId, contribution, organization, onSuccess, onCancel }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sendImmediately, setSendImmediately] = useState(false);
  const [previewMode, setPreviewMode] = useState(true);

  const donor = contribution.donors;
  const donorName = donor
    ? !donor.is_organization
      ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim() || 'Donor'
      : donor.organization_name || 'Donor'
    : 'Donor';

  const goodsServicesStatement = contribution.quid_pro_quo_value > 0
    ? `The estimated value of goods and services provided in exchange for this contribution was $${contribution.quid_pro_quo_value.toLocaleString()}. The tax-deductible portion is $${contribution.tax_deductible_amount.toLocaleString()}.`
    : 'No goods or services were provided in exchange for this contribution.';

  const receiptContent = `Dear ${donorName},

Thank you for your generous contribution to ${organization.name}.

This letter serves as your official receipt for tax purposes.

Contribution Details:
- Date: ${new Date(contribution.contribution_date).toLocaleDateString()}
- Amount: $${contribution.amount.toLocaleString()}
- Type: ${contribution.gift_type.replace('_', ' ')}
${contribution.receipt_number ? `- Receipt Number: ${contribution.receipt_number}` : ''}
${contribution.designation ? `- Designation: ${contribution.designation}` : ''}

${goodsServicesStatement}

${organization.ein ? `Organization EIN: ${organization.ein}` : ''}

Thank you for your support!

Sincerely,
${organization.name}`;

  const handleGenerate = async () => {
    setError(null);
    setLoading(true);

    try {
      const response = await apiRequest(`/api/org/${organizationId}/contributions/${contribution.id}/receipt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ send_immediately: sendImmediately }),
      });

      if (!response.ok) {
        const data = await readJson(response);
        throw new Error(data.error || 'Failed to generate receipt');
      }

      onSuccess?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Status Banner */}
      {contribution.receipt_status !== 'pending' && (
        <div className={`p-4 rounded-lg ${contribution.receipt_status === 'sent' ? 'bg-green-50 border border-green-200' : 'bg-blue-50 border border-blue-200'}`}>
          <p className={`text-sm font-medium ${contribution.receipt_status === 'sent' ? 'text-green-800' : 'text-blue-800'}`}>
            {contribution.receipt_status === 'sent'
              ? `Receipt ${contribution.receipt_number} has been sent to ${donor?.email || 'the donor'}.`
              : `Receipt ${contribution.receipt_number} has been generated but not yet sent.`
            }
          </p>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Contribution Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Contribution Summary</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Donor</p>
            <p className="font-medium">{donorName}</p>
          </div>
          <div>
            <p className="text-gray-500">Date</p>
            <p className="font-medium">{new Date(contribution.contribution_date).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-gray-500">Amount</p>
            <p className="font-medium">{formatCurrency(contribution.amount)}</p>
          </div>
          <div>
            <p className="text-gray-500">Tax Deductible</p>
            <p className="font-medium">{formatCurrency(contribution.tax_deductible_amount)}</p>
          </div>
          {contribution.quid_pro_quo_value > 0 && (
            <div>
              <p className="text-gray-500">Quid Pro Quo</p>
              <p className="font-medium text-amber-600">{formatCurrency(contribution.quid_pro_quo_value)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Receipt Preview */}
      {previewMode && (
        <div className="border rounded-lg">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
            <h3 className="text-sm font-medium text-gray-700">Receipt Preview</h3>
            <button
              onClick={() => setPreviewMode(false)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              Hide preview
            </button>
          </div>
          <div className="p-6 bg-white">
            <div className="mb-6 pb-4 border-b">
              <h2 className="text-xl font-bold">{organization.name}</h2>
              {organization.ein && <p className="text-sm text-gray-500">EIN: {organization.ein}</p>}
            </div>
            <pre className="whitespace-pre-wrap font-sans text-sm text-gray-700 leading-relaxed">
              {receiptContent}
            </pre>
          </div>
        </div>
      )}

      {!previewMode && (
        <button
          onClick={() => setPreviewMode(true)}
          className="text-sm text-azure hover:underline"
        >
          Show preview
        </button>
      )}

      {/* Send Options */}
      {contribution.receipt_status === 'pending' && (
        <div className="space-y-4">
          {donor?.email && (
            <label className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
              <input
                type="checkbox"
                checked={sendImmediately}
                onChange={(e) => setSendImmediately(e.target.checked)}
                className="rounded text-azure"
              />
              <span className="text-sm text-blue-800">
                Send receipt immediately to {donor.email}
              </span>
            </label>
          )}

          {!donor?.email && (
            <p className="text-sm text-amber-600 p-3 bg-amber-50 rounded-lg">
              No email address on file for this donor. The receipt will be generated but you&apos;ll need to send it manually.
            </p>
          )}
        </div>
      )}

      {/* IRS Requirements Notice */}
      <div className="p-4 bg-gray-50 rounded-lg text-sm text-gray-600">
        <p className="font-medium mb-2">IRS Requirements for Tax Receipts</p>
        <ul className="list-disc list-inside space-y-1 text-xs">
          <li>Required for charitable contributions of $250 or more</li>
          <li>Must include organization name and address</li>
          <li>Must state the date and amount of contribution</li>
          <li>Must state whether goods/services were provided in exchange</li>
          <li>Must include a good faith estimate of value if goods/services were provided</li>
        </ul>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t">
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            Cancel
          </button>
        )}
        {contribution.receipt_status === 'pending' ? (
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="px-6 py-2 bg-azure text-white rounded-lg hover:bg-azure/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Generating...' : sendImmediately ? 'Generate & Send Receipt' : 'Generate Receipt'}
          </button>
        ) : contribution.receipt_status === 'generated' && donor?.email ? (
          <button
            onClick={handleGenerate}
            disabled={loading}
            className="px-6 py-2 bg-azure text-white rounded-lg hover:bg-azure/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending...' : 'Send Receipt'}
          </button>
        ) : null}
      </div>
    </div>
  );
}
