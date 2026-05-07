'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

interface TaxOverviewData {
  taxYear: number;
  summary: {
    totalContributions: number;
    totalDeductible: number;
    contributionCount: number;
    missingDocumentation: number;
    complianceScore: number | null;
  };
  carryforwardSummary: {
    totalAvailable: number;
    expiringSoon: any[];
  } | null;
}

interface TaxOverviewCardProps {
  portfolioId: string;
  taxYear?: number;
}

export default function TaxOverviewCard({ portfolioId, taxYear }: TaxOverviewCardProps) {
  const [data, setData] = useState<TaxOverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const year = taxYear || new Date().getFullYear();

  useEffect(() => {
    async function fetchOverview() {
      try {
        setLoading(true);
        const res = await fetch(`/api/portfolio/${portfolioId}/tax/overview?year=${year}`);

        if (!res.ok) {
          throw new Error('Failed to fetch tax overview');
        }

        const json = await res.json();
        setData(json.data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    }

    fetchOverview();
  }, [portfolioId, year]);

  if (loading) {
    return (
      <div className="border border-gray-200 rounded-lg p-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded w-full"></div>
          <div className="h-4 bg-gray-200 rounded w-5/6"></div>
          <div className="h-4 bg-gray-200 rounded w-4/6"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border border-red-200 bg-red-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-red-900 mb-2">Error Loading Tax Data</h3>
        <p className="text-sm text-red-700">{error}</p>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const { summary, carryforwardSummary } = data;

  // Determine compliance status
  const getComplianceStatus = () => {
    if (!summary.complianceScore) return { label: 'Unknown', color: 'gray' };
    if (summary.complianceScore >= 80) return { label: 'Compliant', color: 'green' };
    if (summary.complianceScore >= 50) return { label: 'Needs Attention', color: 'yellow' };
    return { label: 'Non-Compliant', color: 'red' };
  };

  const complianceStatus = getComplianceStatus();

  return (
    <div className="border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">
          {year} Tax Summary
        </h3>
        <Link
          href={`/dashboard/tax?year=${year}`}
          className="text-sm text-azure hover:text-azure font-medium"
        >
          View Details →
        </Link>
      </div>

      <div className="space-y-4">
        {/* Total Contributions */}
        <div>
          <div className="text-sm text-gray-600 mb-1">Total Contributions</div>
          <div className="text-2xl font-bold text-gray-900">
            ${summary.totalContributions.toLocaleString()}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {summary.contributionCount} {summary.contributionCount === 1 ? 'contribution' : 'contributions'}
          </div>
        </div>

        {/* Deductible Amount */}
        {summary.totalDeductible !== summary.totalContributions && (
          <div>
            <div className="text-sm text-gray-600 mb-1">Deductible This Year</div>
            <div className="text-xl font-semibold text-gray-900">
              ${summary.totalDeductible.toLocaleString()}
            </div>
            {summary.totalContributions > summary.totalDeductible && (
              <div className="text-xs text-amber-600 mt-1">
                ${(summary.totalContributions - summary.totalDeductible).toLocaleString()} carryforward
              </div>
            )}
          </div>
        )}

        {/* Carryforwards */}
        {carryforwardSummary && carryforwardSummary.totalAvailable > 0 && (
          <div className="pt-3 border-t border-gray-200">
            <div className="text-sm text-gray-600 mb-1">Available Carryforwards</div>
            <div className="text-xl font-semibold text-gray-900">
              ${carryforwardSummary.totalAvailable.toLocaleString()}
            </div>
            {carryforwardSummary.expiringSoon.length > 0 && (
              <div className="text-xs text-red-600 mt-1 font-medium">
                ⚠️ {carryforwardSummary.expiringSoon.length} expiring soon
              </div>
            )}
          </div>
        )}

        {/* Compliance Status */}
        {summary.complianceScore !== null && (
          <div className="pt-3 border-t border-gray-200">
            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-600">Documentation</div>
              <span
                className={`text-xs font-medium px-2 py-1 rounded ${
                  complianceStatus.color === 'green'
                    ? 'bg-green-100 text-green-800'
                    : complianceStatus.color === 'yellow'
                    ? 'bg-yellow-100 text-yellow-800'
                    : complianceStatus.color === 'red'
                    ? 'bg-red-100 text-red-800'
                    : 'bg-gray-100 text-gray-800'
                }`}
              >
                {complianceStatus.label}
              </span>
            </div>
            {summary.missingDocumentation > 0 && (
              <div className="text-xs text-amber-600 mt-2">
                {summary.missingDocumentation} {summary.missingDocumentation === 1 ? 'contribution needs' : 'contributions need'} documentation
              </div>
            )}
          </div>
        )}
      </div>

      {/* Call to Action */}
      {summary.contributionCount === 0 && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <Link
            href={`/dashboard/tax?year=${year}`}
            className="inline-block text-sm text-azure hover:text-azure font-medium"
          >
            Start tracking contributions →
          </Link>
        </div>
      )}
    </div>
  );
}
