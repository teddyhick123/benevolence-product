'use client';

import { useState, useEffect } from 'react';
import { CONTRIBUTION_TYPE_LABELS } from '@/lib/tax/constants';
import ContributionDetailModal from './ContributionDetailModal';

interface Contribution {
  id: string;
  contribution_date: string;
  recipient_name: string;
  contribution_type: string;
  amount_usd: number;
  is_compliant: boolean;
  substantiation_requirement: string;
  calculated_deductible_amount: number;
  document_count: number;
}

interface ContributionsListProps {
  portfolioId: string;
  taxYear: number;
  onRefresh?: number; // Counter to trigger refresh
}

export default function ContributionsList({
  portfolioId,
  taxYear,
  onRefresh,
}: ContributionsListProps) {
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedContributionId, setSelectedContributionId] = useState<string | null>(null);

  async function fetchContributions() {
    try {
      setLoading(true);
      const res = await fetch(`/api/portfolio/${portfolioId}/tax/contributions?year=${taxYear}`);

      if (!res.ok) throw new Error('Failed to fetch contributions');

      const json = await res.json();
      setContributions(json.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchContributions();
  }, [portfolioId, taxYear, onRefresh]);

  if (loading) {
    return (
      <div className="border border-gray-200 rounded-lg p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-200 bg-red-50 rounded-lg p-6">
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (contributions.length === 0) {
    return (
      <div className="border border-gray-200 rounded-lg p-6 text-center">
        <p className="text-gray-600">No contributions tracked for {taxYear} yet</p>
      </div>
    );
  }

  const totalAmount = contributions.reduce((sum, c) => sum + c.amount_usd, 0);
  const compliantCount = contributions.filter((c) => c.is_compliant).length;

  return (
    <div className="border border-gray-200 rounded-lg">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Contributions</h2>
            <p className="text-sm text-gray-600 mt-1">
              {contributions.length} {contributions.length === 1 ? 'contribution' : 'contributions'} totaling ${totalAmount.toLocaleString()}
            </p>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600">Documentation</div>
            <div className={`text-lg font-semibold ${
              compliantCount === contributions.length ? 'text-green-600' : 'text-amber-600'
            }`}>
              {compliantCount} / {contributions.length} compliant
            </div>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="divide-y divide-gray-200">
        {contributions.map((contribution) => (
          <div
            key={contribution.id}
            onClick={() => setSelectedContributionId(contribution.id)}
            className="px-6 py-4 hover:bg-gray-50 transition-colors cursor-pointer"
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold text-gray-900">
                    {contribution.recipient_name}
                  </h3>
                  {contribution.document_count > 0 && (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-azure/10 text-azure">
                      {contribution.document_count} doc{contribution.document_count !== 1 ? 's' : ''}
                    </span>
                  )}
                  {!contribution.is_compliant && (
                    <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-amber-100 text-amber-800">
                      ⚠️ Missing docs
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center gap-4 text-sm text-gray-600">
                  <span>
                    {new Date(contribution.contribution_date).toLocaleDateString()}
                  </span>
                  <span>•</span>
                  <span>
                    {CONTRIBUTION_TYPE_LABELS[contribution.contribution_type as keyof typeof CONTRIBUTION_TYPE_LABELS]}
                  </span>
                </div>
                {!contribution.is_compliant && (
                  <div className="mt-2 text-xs text-amber-700">
                    Required: {contribution.substantiation_requirement}
                  </div>
                )}
              </div>
              <div className="text-right ml-4">
                <div className="text-lg font-bold text-gray-900">
                  ${contribution.amount_usd.toLocaleString()}
                </div>
                {contribution.calculated_deductible_amount !== contribution.amount_usd && (
                  <div className="text-xs text-gray-500 mt-1">
                    Deductible: ${contribution.calculated_deductible_amount.toLocaleString()}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Detail Modal */}
      {selectedContributionId && (
        <ContributionDetailModal
          contributionId={selectedContributionId}
          portfolioId={portfolioId}
          onClose={() => setSelectedContributionId(null)}
          onUpdate={() => {
            setSelectedContributionId(null);
            fetchContributions();
          }}
        />
      )}
    </div>
  );
}
