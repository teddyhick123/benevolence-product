'use client';

import { useEffect, useState } from 'react';

export interface BulkResult {
  grantId: string;
  grantName?: string;
  fromStage?: string;
  targetStage?: string;
  success: boolean;
  error?: string;
}

interface Props {
  successCount: number;
  failureCount: number;
  results: BulkResult[];
  onClose: () => void;
}

export default function BulkTransitionResultModal({ successCount, failureCount, results, onClose }: Props) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const allSuccess = failureCount === 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-md mx-4 p-6 transition-all duration-200"
        style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(8px)' }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          {allSuccess ? (
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
          ) : (
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          )}
          <div>
            <h2 className="text-base font-semibold text-ink">
              {allSuccess ? 'All transitions applied' : `${successCount} applied, ${failureCount} failed`}
            </h2>
            <p className="text-xs text-neutral-500">
              {allSuccess ? `${successCount} grant${successCount !== 1 ? 's' : ''} moved successfully` : 'Review failures below'}
            </p>
          </div>
        </div>

        {/* Result list */}
        <div className="space-y-1.5 max-h-56 overflow-y-auto mb-5">
          {results.filter(r => r.success).map(r => (
            <div key={r.grantId} className="flex items-center gap-2 text-sm py-1">
              <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <svg className="w-2.5 h-2.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </span>
              <span className="text-neutral-700 truncate">{r.grantName ?? r.grantId}</span>
            </div>
          ))}
          {results.filter(r => !r.success).map(r => (
            <div key={r.grantId} className="text-sm py-1">
              <div className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                  <svg className="w-2.5 h-2.5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </span>
                <span className="text-neutral-700 truncate">{r.grantName ?? r.grantId}</span>
              </div>
              {r.error && <p className="text-xs text-red-500 ml-6 mt-0.5">{r.error}</p>}
            </div>
          ))}
        </div>

        <button
          onClick={onClose}
          className="w-full rounded-2xl bg-azure px-4 py-2.5 text-sm font-medium text-white shadow-soft hover:opacity-90 transition-opacity"
        >
          Done
        </button>
      </div>
    </div>
  );
}
