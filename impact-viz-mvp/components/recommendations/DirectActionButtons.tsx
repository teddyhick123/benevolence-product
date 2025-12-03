'use client';

import { useState } from 'react';
import MakeDonationModal from './MakeDonationModal';
import CreateGrantModal from './CreateGrantModal';
import { Recommendation } from '@/lib/schemas/recommendations';

type Props = {
  recommendation: Recommendation;
  onDonationCreated?: (holdingId: string) => void;
  onGrantCreated?: (holdingId: string) => void;
};

export default function DirectActionButtons({
  recommendation,
  onDonationCreated,
  onGrantCreated,
}: Props) {
  const [showDonationModal, setShowDonationModal] = useState(false);
  const [showGrantModal, setShowGrantModal] = useState(false);

  const handleRequestMeeting = () => {
    const contactEmail = recommendation.contact_info?.email;
    const contactName = recommendation.contact_info?.contact_name;

    // Build email template
    const subject = `Meeting Request: ${recommendation.organization_name}`;
    const body = `Dear ${contactName || 'Team'},

I am reaching out to request a meeting to discuss potential collaboration with ${recommendation.organization_name}.

I am interested in learning more about:
- Your current programs and impact
- Funding needs and opportunities
- How we might support your mission

${recommendation.description ? `\nI was particularly interested in: ${recommendation.description.substring(0, 200)}...\n` : ''}
Please let me know your availability for a call or meeting in the coming weeks.

Thank you for your time and the important work you do.

Best regards`;

    const mailtoLink = `mailto:${contactEmail || ''}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    if (contactEmail) {
      window.location.href = mailtoLink;
    } else {
      // Fallback: Open website or show alert
      if (recommendation.website) {
        window.open(recommendation.website, '_blank');
      } else {
        alert('No contact information available for this organization. Please visit their website or search for contact details online.');
      }
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Make a Donation Button */}
        <button
          onClick={() => setShowDonationModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-azure via-azure/90 to-azure/70 text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-soft"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Make a Donation
        </button>

        {/* Request Meeting Button */}
        <button
          onClick={handleRequestMeeting}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-azure text-azure text-sm font-medium hover:bg-azure/5 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Request Meeting
        </button>

        {/* Create Grant Button */}
        <button
          onClick={() => setShowGrantModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-emerald-600 text-emerald-700 text-sm font-medium hover:bg-emerald-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Create Grant
        </button>
      </div>

      {/* Modals */}
      {showDonationModal && (
        <MakeDonationModal
          recommendation={recommendation}
          onClose={() => setShowDonationModal(false)}
          onSuccess={(holdingId) => {
            setShowDonationModal(false);
            onDonationCreated?.(holdingId);
          }}
        />
      )}

      {showGrantModal && (
        <CreateGrantModal
          recommendation={recommendation}
          onClose={() => setShowGrantModal(false)}
          onSuccess={(holdingId) => {
            setShowGrantModal(false);
            onGrantCreated?.(holdingId);
          }}
        />
      )}
    </>
  );
}
