'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = {
  holdingId: string;
  holdingName: string;
  portfolioId: string;
};

export default function AddToTaxTrackerButton({ holdingId, holdingName, portfolioId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleAddToTax() {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/holdings/${holdingId}/create-tax-record`, {
        method: 'POST',
      });

      const data = await res.json();

      if (!res.ok) {
        // If already has a tax record, that's okay - show success message
        if (res.status === 409) {
          setSuccess(true);
          setTimeout(() => {
            router.push(`/dashboard/tax?portfolio_id=${portfolioId}`);
          }, 1500);
          return;
        }
        throw new Error(data.error || 'Failed to create tax record');
      }

      setSuccess(true);

      // Redirect to tax page after short delay
      setTimeout(() => {
        router.push(`/dashboard/tax?portfolio_id=${portfolioId}`);
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to create tax record');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-green-50 border border-green-200 text-green-700 text-sm">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Added to Tax Tracker
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={handleAddToTax}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl border border-coral/25 bg-coral/10 text-coral hover:bg-coral/10 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
        title="Create a tax contribution record from this holding"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        {loading ? 'Adding...' : 'Add to Tax Tracker'}
      </button>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
          {error}
        </div>
      )}
    </div>
  );
}
