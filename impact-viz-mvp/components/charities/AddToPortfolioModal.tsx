'use client';

import { useState, useEffect } from 'react';
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

  // Fetch user's portfolios
  useEffect(() => {
    if (isOpen) {
      fetchPortfolios();
    }
  }, [isOpen]);

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
          interaction_status: 'new',
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
        setError(data.error || 'Failed to add charity to portfolio');
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
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">Add to Portfolio</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-full transition-colors"
            disabled={isLoading}
          >
            <X className="w-6 h-6 text-gray-600" />
          </button>
        </div>

        {/* Success Message */}
        {success && (
          <div className="p-6 bg-green-50 border-b border-green-100">
            <div className="flex items-center text-green-800">
              <CheckCircle className="w-6 h-6 mr-3" />
              <span className="font-medium">Successfully added {charityName} to your portfolio!</span>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="p-6 bg-red-50 border-b border-red-100">
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
            <div className="bg-gray-50 p-4 rounded-lg">
              <h3 className="font-semibold text-gray-900">{charityName}</h3>
              <p className="text-sm text-gray-600 mt-1">EIN: {charityEin}</p>
            </div>

            {/* Portfolio Selection */}
            <div>
              <label htmlFor="portfolio" className="block text-sm font-medium text-gray-700 mb-2">
                Select Portfolio <span className="text-red-500">*</span>
              </label>
              {portfolios.length > 0 ? (
                <select
                  id="portfolio"
                  value={selectedPortfolioId}
                  onChange={(e) => setSelectedPortfolioId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  {portfolios.map((portfolio) => (
                    <option key={portfolio.id} value={portfolio.id}>
                      {portfolio.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="text-sm text-gray-500 italic">No portfolios available. Please create a portfolio first.</div>
              )}
            </div>

            {/* Note */}
            <div>
              <label htmlFor="note" className="block text-sm font-medium text-gray-700 mb-2">
                Recommendation Note
              </label>
              <textarea
                id="note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Why are you recommending this charity? Any specific programs or initiatives of interest?"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1 text-sm text-gray-500">Optional: Add context for your team</p>
            </div>

            {/* Investment Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Suggested Investment Range (Optional)
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="minInvestment" className="block text-xs text-gray-500 mb-1">
                    Minimum
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="number"
                      id="minInvestment"
                      value={minInvestment}
                      onChange={(e) => setMinInvestment(e.target.value)}
                      placeholder="10000"
                      min="0"
                      step="1000"
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="maxInvestment" className="block text-xs text-gray-500 mb-1">
                    Maximum
                  </label>
                  <div className="relative">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="number"
                      id="maxInvestment"
                      value={maxInvestment}
                      onChange={(e) => setMaxInvestment(e.target.value)}
                      placeholder="50000"
                      min="0"
                      step="1000"
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || portfolios.length === 0}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
