'use client';

import { useState, useEffect, useRef } from 'react';
import { X, DollarSign, AlertCircle, CheckCircle } from 'lucide-react';

interface AddToPortfolioModalProps {
  isOpen: boolean;
  onClose: () => void;
  charityName: string;
  charityEin: string;
  onSuccess?: () => void;
}

interface Portfolio {
  id: string;
  name: string;
  description?: string;
}

export default function AddToPortfolioModal({
  isOpen,
  onClose,
  charityName,
  charityEin,
  onSuccess,
}: AddToPortfolioModalProps) {
  const [portfolios, setPortfolios] = useState<Portfolio[]>([]);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>('');
  const [note, setNote] = useState<string>('');
  const [minInvestment, setMinInvestment] = useState<string>('');
  const [maxInvestment, setMaxInvestment] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Fetch user's portfolios
  useEffect(() => {
    if (isOpen) {
      fetchPortfolios();
    }
  }, [isOpen]);

  // Focus management
  useEffect(() => {
    if (isOpen) {
      triggerRef.current = document.activeElement;
      const first = dialogRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      first?.focus();
    } else {
      (triggerRef.current as HTMLElement | null)?.focus?.();
    }
  }, [isOpen]);

  function handleDialogKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }

  const fetchPortfolios = async () => {
    try {
      const response = await fetch('/api/portfolios');
      if (response.ok) {
        const data = await response.json();
        setPortfolios(data.data || []);
        if (data.data && data.data.length > 0) {
          setSelectedPortfolioId(data.data[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching portfolios:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/charities/${charityEin}/add-to-portfolio`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          portfolio_id: selectedPortfolioId,
          note: note || undefined,
          min_investment: minInvestment ? parseFloat(minInvestment) : undefined,
          max_investment: maxInvestment ? parseFloat(maxInvestment) : undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
          if (onSuccess) onSuccess();
          resetForm();
        }, 1500);
      } else {
        // Enhanced error messages for specific scenarios
        if (response.status === 409) {
          setError('This charity is already in your portfolio. You can view or edit it in the "My Portfolio" view.');
        } else if (response.status === 404) {
          setError('This charity could not be found. It may have been removed from the database.');
        } else if (response.status === 403) {
          setError('You do not have permission to modify this portfolio. Please contact your team administrator.');
        } else if (response.status === 401) {
          setError('Your session has expired. Please log in again.');
        } else {
          setError(data.error || 'Failed to add charity to portfolio. Please try again.');
        }
      }
    } catch (err: any) {
      setError('An unexpected error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const resetForm = () => {
    setNote('');
    setMinInvestment('');
    setMaxInvestment('');
    setError(null);
    setSuccess(false);
  };

  if (!isOpen) return null;

  return (
    <div
      ref={dialogRef}
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="add-portfolio-modal-title"
      onKeyDown={handleDialogKeyDown}
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-black/5">
          <h2 id="add-portfolio-modal-title" className="text-xl font-semibold text-ink">Add to Portfolio</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-neutral-100 rounded-full transition-colors"
            disabled={isLoading}
            aria-label="Close"
          >
            <X className="w-6 h-6 text-neutral-600" />
          </button>
        </div>

        {/* Success Message */}
        {success && (
          <div className="p-6 bg-green-50 border-b border-green-100" role="status">
            <div className="flex items-center text-green-800">
              <CheckCircle className="w-6 h-6 mr-3" />
              <span className="font-medium">Successfully added {charityName} to your portfolio!</span>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-6 bg-red-50 border-b border-red-100" role="alert">
            <div className="flex items-center text-red-800">
              <AlertCircle className="w-6 h-6 mr-3" />
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Form */}
        {!success && (
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
            {/* Charity Info */}
            <div className="bg-neutral-50 p-4 rounded-2xl">
              <h3 className="font-semibold text-ink">{charityName}</h3>
              <p className="text-sm text-neutral-600 mt-1">EIN: {charityEin}</p>
            </div>

            {/* Portfolio Selection */}
            <div>
              <label htmlFor="portfolio" className="block text-sm font-medium text-neutral-700 mb-2">
                Select Portfolio <span className="text-red-500">*</span>
              </label>
              {portfolios.length > 0 ? (
                <select
                  id="portfolio"
                  value={selectedPortfolioId}
                  onChange={(e) => setSelectedPortfolioId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-black/10 rounded-2xl focus:ring-azure/30 focus:border-azure"
                >
                  {portfolios.map((portfolio) => (
                    <option key={portfolio.id} value={portfolio.id}>
                      {portfolio.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-neutral-500 italic">No portfolios available. Please create a portfolio first.</div>
              )}
            </div>

            {/* Note */}
            <div>
              <label htmlFor="note" className="block text-sm font-medium text-neutral-700 mb-2">
                Recommendation Note
              </label>
              <textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Why are you recommending this charity? Any specific programs or initiatives of interest?"
                className="w-full px-3 py-2 border border-black/10 rounded-2xl focus:ring-azure/30 focus:border-azure"
              />
              <p className="mt-1 text-sm text-neutral-500">Optional: Add context for your team</p>
            </div>

            {/* Investment Range */}
            <div>
              <label className="block text-sm font-medium text-neutral-700 mb-2">
                Suggested Investment Range (Optional)
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="minInvestment" className="block text-xs text-neutral-500 mb-1">
                    Minimum
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      type="number"
                      id="minInvestment"
                      value={minInvestment}
                      onChange={(e) => setMinInvestment(e.target.value)}
                      placeholder="10000"
                      min="0"
                      step="1000"
                      className="w-full pl-10 pr-3 py-2 border border-black/10 rounded-2xl focus:ring-azure/30 focus:border-azure"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="maxInvestment" className="block text-xs text-neutral-500 mb-1">
                    Maximum
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                    <input
                      type="number"
                      id="maxInvestment"
                      value={maxInvestment}
                      onChange={(e) => setMaxInvestment(e.target.value)}
                      placeholder="50000"
                      min="0"
                      step="1000"
                      className="w-full pl-10 pr-3 py-2 border border-black/10 rounded-2xl focus:ring-azure/30 focus:border-azure"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-black/5">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 border border-black/10 text-neutral-700 rounded-2xl hover:bg-neutral-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || portfolios.length === 0}
                className="px-4 py-2 bg-azure text-white rounded-2xl hover:bg-azure/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? 'Adding...' : 'Add to Portfolio'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
