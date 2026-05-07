'use client';

import { useState, useEffect } from 'react';
import { CONTRIBUTION_TYPE_LABELS } from '@/lib/tax/constants';
import { suggestContributionType } from '@/lib/helpers/tax-holding-link';
import { AssetType, ASSET_TYPE_LABELS } from '@/lib/schemas/portfolio';

interface Holding {
  id: string;
  name: string;
  status: string;
  asset_type: string | null;
  funds_allocated: number | null;
  sector: string | null;
  country: string | null;
  as_of: string | null;
}

interface HoldingsImporterProps {
  portfolioId: string;
  taxYear: number;
  onImport: () => void;
}

export default function HoldingsImporter({
  portfolioId,
  taxYear,
  onImport,
}: HoldingsImporterProps) {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState<Set<string>>(new Set());
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    async function fetchHoldings() {
      try {
        setLoading(true);
        const res = await fetch(`/api/portfolio/${portfolioId}/holdings`);

        if (!res.ok) throw new Error('Failed to fetch holdings');

        const json = await res.json();
        setHoldings(json.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    if (expanded) {
      fetchHoldings();
    }
  }, [portfolioId, expanded]);

  async function handleImportHolding(holding: Holding) {
    try {
      setImporting((prev) => new Set(prev).add(holding.id));
      setError(null);

      const amount = holding.funds_allocated || 0;

      // Skip holdings with no amount
      if (amount <= 0) {
        throw new Error('Cannot import holding with no allocated funds');
      }

      // Determine contribution type using asset_type enum
      const contributionType = holding.asset_type
        ? suggestContributionType(holding.asset_type as AssetType)
        : 'other_property';

      const isNonCash = !['cash', 'check', 'wire'].includes(contributionType);

      // Create tax contribution with required fields for validation
      const body: Record<string, unknown> = {
        portfolio_id: portfolioId,
        holding_id: holding.id,
        tax_year: taxYear,
        contribution_date: holding.as_of || `${taxYear}-12-31`,
        recipient_name: holding.name,
        recipient_type: '501c3_public',
        contribution_type: contributionType,
        amount_usd: amount,
        notes: `Imported from holding: ${holding.name}`,
      };

      // For non-cash contributions over $500, FMV is required
      if (isNonCash && amount > 500) {
        body.fmv_at_donation = amount; // Use amount as FMV estimate
      }

      // For non-cash contributions over $5000, appraisal is required
      if (isNonCash && amount > 5000) {
        body.requires_appraisal = true;
      }

      const res = await fetch(`/api/portfolio/${portfolioId}/tax/contributions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to import holding');
      }

      setImported((prev) => new Set(prev).add(holding.id));
      onImport();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to import');
    } finally {
      setImporting((prev) => {
        const next = new Set(prev);
        next.delete(holding.id);
        return next;
      });
    }
  }

  async function handleImportAll() {
    const notImported = holdings.filter((h) => !imported.has(h.id));

    for (const holding of notImported) {
      await handleImportHolding(holding);
    }
  }

  if (!expanded) {
    return (
      <div className="border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Import from Holdings</h2>
            <p className="text-sm text-gray-600 mt-1">
              Add existing holdings as tax contributions
            </p>
          </div>
          <button
            onClick={() => setExpanded(true)}
            className="px-4 py-2 bg-azure text-white rounded-md hover:opacity-90 font-medium text-sm"
          >
            Show Holdings
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="border border-gray-200 rounded-lg p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (holdings.length === 0) {
    return (
      <div className="border border-gray-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Import from Holdings</h2>
          <button
            onClick={() => setExpanded(false)}
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            Hide
          </button>
        </div>
        <p className="text-gray-600">No holdings found in your portfolio.</p>
      </div>
    );
  }

  const notImportedCount = holdings.filter((h) => !imported.has(h.id)).length;

  return (
    <div className="border border-gray-200 rounded-lg">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Import from Holdings</h2>
            <p className="text-sm text-gray-600 mt-1">
              {holdings.length} holdings • {imported.size} already imported
            </p>
          </div>
          <div className="flex items-center gap-3">
            {notImportedCount > 0 && (
              <button
                onClick={handleImportAll}
                disabled={importing.size > 0}
                className="px-4 py-2 bg-azure text-white rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
              >
                Import All ({notImportedCount})
              </button>
            )}
            <button
              onClick={() => setExpanded(false)}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Hide
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="px-6 py-3 bg-red-50 border-b border-red-200 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Holdings List */}
      <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
        {holdings.map((holding) => {
          const isImporting = importing.has(holding.id);
          const isImported = imported.has(holding.id);

          return (
            <div
              key={holding.id}
              className={`px-6 py-4 ${isImported ? 'bg-gray-50' : 'hover:bg-gray-50'} transition-colors`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-gray-900">{holding.name}</h3>
                    {isImported && (
                      <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-100 text-green-800">
                        ✓ Imported
                      </span>
                    )}
                    <span
                      className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        holding.status === 'Active'
                          ? 'bg-azure/10 text-azure'
                          : holding.status === 'Exited'
                          ? 'bg-gray-100 text-gray-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {holding.status}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-4 text-sm text-gray-600">
                    {holding.asset_type && (
                      <>
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-neutral-100 text-xs">
                          {ASSET_TYPE_LABELS[holding.asset_type as AssetType] || holding.asset_type}
                        </span>
                        <span>•</span>
                      </>
                    )}
                    {holding.sector && (
                      <>
                        <span>{holding.sector}</span>
                        <span>•</span>
                      </>
                    )}
                    {holding.country && <span>{holding.country}</span>}
                  </div>
                  {holding.funds_allocated !== null && (
                    <div className="mt-1 text-lg font-semibold text-gray-900">
                      ${holding.funds_allocated.toLocaleString()}
                    </div>
                  )}
                </div>
                <div className="ml-4">
                  {isImported ? (
                    <div className="text-sm text-green-600 font-medium">
                      Added to {taxYear}
                    </div>
                  ) : (
                    <button
                      onClick={() => handleImportHolding(holding)}
                      disabled={isImporting}
                      className="px-4 py-2 bg-azure text-white rounded-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
                    >
                      {isImporting ? 'Importing...' : 'Add to Tax'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Info Footer */}
      <div className="px-6 py-4 bg-azure/10 border-t border-azure/20 text-sm text-azure">
        <strong>Note:</strong> Imported holdings will be added as tax contributions. You can edit the details
        (recipient type, documentation, etc.) after importing.
      </div>
    </div>
  );
}
