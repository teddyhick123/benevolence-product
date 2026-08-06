'use client';

import { useState } from 'react';

type Donor = {
  id: string;
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

type Organization = {
  name: string;
  ein: string | null;
};

interface Props {
  organizationId: string;
  donor: Donor;
  organization: Organization;
  letterType?: 'thank_you' | 'annual_summary' | 'welcome' | 'custom';
  contributionId?: string;
  contributionAmount?: number;
  contributionDate?: string;
  annualTotal?: number;
  year?: number;
  isNonCash?: boolean;
  propertyDescription?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export default function AcknowledgmentLetter({
  organizationId,
  donor,
  organization,
  letterType = 'thank_you',
  contributionId,
  contributionAmount,
  contributionDate,
  annualTotal,
  year,
  isNonCash = false,
  propertyDescription,
  onSuccess,
  onCancel,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState(letterType);
  const [customContent, setCustomContent] = useState('');
  const [sendImmediately, setSendImmediately] = useState(false);
  const [previewMode, setPreviewMode] = useState(true);

  const donorName = !donor.is_organization
    ? `${donor.first_name || ''} ${donor.last_name || ''}`.trim() || 'Valued Donor'
    : donor.organization_name || 'Valued Donor';

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const generateLetterContent = () => {
    const currentYear = year || new Date().getFullYear();
    const today = new Date().toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    switch (selectedType) {
      case 'thank_you': {
        // IRS Pub. 1771: written acknowledgment must describe non-cash property
        // (not its value) and disclose any goods/services provided in exchange.
        const giftDescription = isNonCash
          ? (propertyDescription ? `your donation of ${propertyDescription}` : 'your non-cash contribution')
          : `your generous gift${contributionAmount ? ` of ${formatCurrency(contributionAmount)}` : ''}`;
        const dateClause = contributionDate ? ` received on ${formatDate(contributionDate)}` : '';
        return `${today}

Dear ${donorName},

On behalf of everyone at ${organization.name}, I want to express our heartfelt gratitude for ${giftDescription}${dateClause}.

Your support makes a meaningful difference in our ability to carry out our mission. We are deeply grateful for your trust and generosity.

${isNonCash ? 'Please retain this letter for your tax records. No value has been placed on the donated property — the IRS requires that you determine the fair market value of any non-cash contribution.' : 'Please retain this letter for your tax records.'}

No goods or services were provided in exchange for this contribution.

With sincere appreciation,

${organization.name}
${organization.ein ? `EIN: ${organization.ein}` : ''}`;
      }

      case 'annual_summary':
        return `${today}

Dear ${donorName},

As ${currentYear} comes to a close, we want to take a moment to thank you for your incredible generosity throughout the year.

Your total cash contributions to ${organization.name} in ${currentYear}: ${annualTotal ? formatCurrency(annualTotal) : 'See attached statement'}

No goods or services were provided in exchange for these contributions.

Your ongoing support has helped us achieve remarkable things this year. We are deeply grateful for your continued commitment to our mission.

Please retain this letter as your written acknowledgment for tax purposes (IRS Pub. 1771).

With warm regards,

${organization.name}
${organization.ein ? `EIN: ${organization.ein}` : ''}`;

      case 'welcome':
        return `${today}

Dear ${donorName},

Welcome to the ${organization.name} family!

We are thrilled to have you join our community of supporters. Your first gift${contributionAmount ? ` of ${formatCurrency(contributionAmount)}` : ''} marks the beginning of what we hope will be a long and meaningful partnership.

As a member of our donor community, you'll receive regular updates about our work and the impact your generosity makes possible.

Thank you for taking this important step with us. We're honored to have your support.

Warmly,

${organization.name}`;

      case 'custom':
        return customContent || `${today}

Dear ${donorName},

[Your custom message here]

Sincerely,

${organization.name}`;

      default:
        return '';
    }
  };

  const handleSend = async () => {
    setError(null);
    setLoading(true);

    try {
      const content = selectedType === 'custom' ? customContent : generateLetterContent();

      const response = await fetch(`/api/org/${organizationId}/acknowledgments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          donor_id: donor.id,
          contribution_id: contributionId,
          letter_type: selectedType,
          content,
          send_immediately: sendImmediately,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create acknowledgment');
      }

      onSuccess?.();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const letterTypeOptions = [
    { value: 'thank_you', label: 'Thank You Letter', description: 'Standard thank you for a contribution' },
    { value: 'annual_summary', label: 'Annual Summary', description: 'Year-end giving summary' },
    { value: 'welcome', label: 'Welcome Letter', description: 'Welcome new donor to the community' },
    { value: 'custom', label: 'Custom Letter', description: 'Write your own content' },
  ];

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Letter Type Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Letter Type
        </label>
        <div className="grid grid-cols-2 gap-3">
          {letterTypeOptions.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setSelectedType(option.value as any)}
              className={`p-3 text-left border rounded-lg transition-colors ${
                selectedType === option.value
                  ? 'border-azure bg-azure/5'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className={`text-sm font-medium ${selectedType === option.value ? 'text-azure' : 'text-gray-900'}`}>
                {option.label}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{option.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Recipient Info */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Recipient</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <p className="text-gray-500">Name</p>
            <p className="font-medium">{donorName}</p>
          </div>
          <div>
            <p className="text-gray-500">Email</p>
            <p className="font-medium">{donor.email || 'Not on file'}</p>
          </div>
          {donor.address_line1 && (
            <div className="col-span-2">
              <p className="text-gray-500">Address</p>
              <p className="font-medium">
                {donor.address_line1}
                {donor.city && `, ${donor.city}`}
                {donor.state && `, ${donor.state}`}
                {donor.zip && ` ${donor.zip}`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Custom Content Editor */}
      {selectedType === 'custom' && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Letter Content
          </label>
          <textarea
            value={customContent}
            onChange={(e) => setCustomContent(e.target.value)}
            rows={12}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-azure focus:border-transparent font-mono text-sm"
            placeholder="Write your custom letter content here..."
          />
        </div>
      )}

      {/* Letter Preview */}
      {previewMode && selectedType !== 'custom' && (
        <div className="border rounded-lg">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
            <h3 className="text-sm font-medium text-gray-700">Letter Preview</h3>
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
              {generateLetterContent()}
            </pre>
          </div>
        </div>
      )}

      {!previewMode && selectedType !== 'custom' && (
        <button
          onClick={() => setPreviewMode(true)}
          className="text-sm text-azure hover:underline"
        >
          Show preview
        </button>
      )}

      {/* Send Options */}
      <div className="space-y-4">
        {donor.email && (
          <label className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
            <input
              type="checkbox"
              checked={sendImmediately}
              onChange={(e) => setSendImmediately(e.target.checked)}
              className="rounded text-azure"
            />
            <span className="text-sm text-blue-800">
              Send immediately to {donor.email}
            </span>
          </label>
        )}

        {!donor.email && (
          <p className="text-sm text-amber-600 p-3 bg-amber-50 rounded-lg">
            No email address on file for this donor. The letter will be created but you&apos;ll need to send it manually or add an email address.
          </p>
        )}
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
        <button
          onClick={handleSend}
          disabled={loading || (selectedType === 'custom' && !customContent.trim())}
          className="px-6 py-2 bg-azure text-white rounded-lg hover:bg-azure/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Creating...' : sendImmediately ? 'Create & Send Letter' : 'Create Letter'}
        </button>
      </div>
    </div>
  );
}
